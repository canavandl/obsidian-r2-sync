# Obsidian R2 Vault Sync — Implementation Plan

## Architecture Decisions

### Infrastructure Management: CloudFlare SDK

**Decision:** Use the `cloudflare` npm package (official CloudFlare SDK) for all infrastructure provisioning in the CLI.

**Alternatives considered:**

| Option | Language | Verdict |
|---|---|---|
| **CloudFlare SDK** ✅ | TypeScript | Chosen — pure npm, zero external dependencies, fully self-contained CLI |
| **Pulumi** | TypeScript | Good IaC model, but requires separate `pulumi` CLI binary install (not bundled in npm package). The Automation API still needs the CLI binary on disk. Too much friction for 2 resources. |
| **OpenTofu / Terraform** | HCL | Mature CF provider, but introduces a separate language (HCL) and another CLI binary dependency. |
| **CDKTF** | TypeScript | Deprecated and archived by HashiCorp on Dec 10, 2025. Not an option. |
| **Wrangler (shell out)** | CLI | Fragile (parsing stdout), requires global wrangler install. Mixing wrangler + CloudFlare SDK is a code smell. |

**Key tradeoffs accepted:**
- We write our own idempotency logic (~200 lines) instead of getting it free from IaC tools
- We write our own teardown logic instead of `pulumi destroy` / `tofu destroy`
- In return: `npx obsidian-r2-sync setup` just works with zero prerequisites

**Note:** Wrangler is still used for **local development** (`wrangler dev` for local R2 emulation), but not in the CLI's production deploy path.

### Manifest Concurrency: R2 ETags

**Decision:** Use R2's native ETag support + `If-Match` conditional headers for optimistic concurrency on the sync manifest, instead of a manual `version` field.

- `GET /manifest` returns the R2 ETag in the response
- `PUT /manifest` requires `If-Match` header; R2 returns `412 Precondition Failed` on mismatch
- Plugin stores ETag after each fetch, sends it back on updates
- On `412`, plugin re-fetches manifest, re-diffs, retries sync cycle
- `SyncManifest` type drops the `version` field (or keeps it as a human-readable counter only)

### Other Key Decisions

- **Architecture:** R2 + CloudFlare Worker (no Durable Objects or D1 for MVP)
- **Conflict resolution:** Three-way merge via diff-match-patch for .md files, last-write-wins for binary
- **Sync model:** Interval-based + manual sync (no real-time WebSocket)
- **Monorepo:** pnpm workspaces + Turborepo

---

## Project Structure

```
obsidian-r2-sync/
├── packages/
│   ├── plugin/                     # Obsidian plugin
│   │   ├── src/
│   │   │   ├── main.ts             # Plugin lifecycle (onload/onunload)
│   │   │   ├── sync/
│   │   │   │   ├── engine.ts       # Orchestrates full sync cycle
│   │   │   │   ├── differ.ts       # Compares local vs remote manifests
│   │   │   │   ├── merger.ts       # Three-way merge using diff-match-patch
│   │   │   │   └── queue.ts        # Upload/download queue with retry + progress
│   │   │   ├── api/
│   │   │   │   └── client.ts       # HTTP client to Worker API
│   │   │   └── ui/
│   │   │       ├── settings-tab.ts # Plugin settings (endpoint, token, interval)
│   │   │       ├── status-bar.ts   # Sync status indicator
│   │   │       └── conflict-modal.ts # Shows diff when merge needs user input
│   │   ├── manifest.json
│   │   ├── styles.css
│   │   ├── esbuild.config.mjs
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── worker/                     # CloudFlare Worker (Hono)
│   │   ├── src/
│   │   │   ├── index.ts            # Hono app entry point
│   │   │   ├── routes/
│   │   │   │   ├── manifest.ts     # GET/PUT sync manifest
│   │   │   │   ├── files.ts        # Generate presigned URLs for upload/download
│   │   │   │   └── health.ts       # Health check endpoint
│   │   │   └── middleware/
│   │   │       └── auth.ts         # Bearer token validation
│   │   ├── wrangler.toml           # R2 bucket binding, environment config
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── cli/                        # Infrastructure CLI
│   │   ├── src/
│   │   │   ├── index.ts            # CLI entry point
│   │   │   ├── commands/
│   │   │   │   ├── setup.ts        # Full provisioning wizard
│   │   │   │   ├── deploy.ts       # Deploy/update Worker
│   │   │   │   ├── add-device.ts   # Generate new auth token
│   │   │   │   ├── status.ts       # Health check
│   │   │   │   └── teardown.ts     # Remove infra
│   │   │   └── lib/
│   │   │       ├── cloudflare.ts   # CF SDK wrapper
│   │   │       └── prompts.ts      # Interactive prompts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── shared/                     # Shared types & utilities
│       ├── src/
│       │   ├── types.ts            # SyncManifest, FileEntry, SyncConfig types
│       │   ├── manifest.ts         # Manifest comparison logic
│       │   └── constants.ts        # Shared constants (version, API paths)
│       ├── tsconfig.json
│       └── package.json
│
├── pnpm-workspace.yaml
├── turbo.json
├── package.json                    # Root package.json
├── tsconfig.base.json              # Shared TS config
├── .gitignore
└── .eslintrc.js
```

---

## Phase 1: Project Scaffolding

### 1.1 Initialize monorepo
- `pnpm init` at root
- Create `pnpm-workspace.yaml` with `packages/*` glob
- Create `turbo.json` with `build`, `dev`, `lint`, `typecheck` pipelines
- Create `tsconfig.base.json` with strict TS config, path aliases

### 1.2 Scaffold shared package
- Types: `FileEntry`, `SyncManifest` (no `version` field for concurrency), `SyncConfig`
- Manifest comparison logic
- Shared constants

### 1.3 Scaffold Obsidian plugin
- `manifest.json`: id `obsidian-r2-sync`, minAppVersion `1.0.0`
- esbuild config for bundling
- Dependencies: `obsidian`, `diff-match-patch`, shared package

### 1.4 Scaffold CloudFlare Worker
- Hono setup with wrangler.toml for R2 binding
- Dependencies: `hono`, `aws4fetch`

### 1.5 Scaffold CLI
- Commander.js + inquirer
- Dependencies: `commander`, `inquirer`, `chalk`, `ora`, `cloudflare` (SDK)

---

## Phase 2: CLI — Infrastructure Setup

### 2.1 `setup` command (using CloudFlare SDK)
1. Prompt for CloudFlare API token
2. Auto-detect or prompt for account ID
3. Create R2 bucket via `cloudflare` SDK
4. Generate auth secret
5. Deploy Worker via CloudFlare SDK (Workers API upload)
6. Generate first device token
7. Output: Worker URL + device token

### 2.2 `add-device` command — generate new device auth token
### 2.3 `deploy` command — redeploy Worker via SDK
### 2.4 `status` command — hit Worker health endpoint
### 2.5 `teardown` command — delete Worker + optionally R2 bucket via SDK

---

## Phase 3: CloudFlare Worker API

### 3.1 Routes
```
GET  /health              → { ok: true }
GET  /manifest            → SyncManifest + ETag header
PUT  /manifest            → Update manifest (requires If-Match header, returns 412 on mismatch)
POST /files/upload-url    → { path, hash } → presigned PUT URL
POST /files/download-url  → { path } → presigned GET URL
POST /files/delete        → { paths: string[] } → delete files from R2
```

### 3.2 Auth middleware — Bearer token validation via HMAC
### 3.3 Presigned URLs — aws4fetch, 15-min expiry
### 3.4 Manifest storage — `.obsidian-r2-sync/manifest.json` in R2, ETag-based concurrency

---

## Phase 4: Obsidian Plugin — Sync Engine

### 4.1 Plugin lifecycle — settings, status bar, commands, interval timer
### 4.2 Sync engine — build manifest, fetch remote, diff, resolve conflicts, transfer, update
### 4.3 Three-way merge — diff-match-patch, local base copies
### 4.4 Upload/download queue — concurrency, retry, progress
### 4.5 Settings UI — endpoint, token, interval, conflict strategy, exclusions
### 4.6 Status bar — sync state indicator
### 4.7 Conflict modal — side-by-side diff, keep local/remote/both

---

## Phase 5: Polish & Testing

### 5.1 Unit tests (vitest) for shared, worker, plugin
### 5.2 Worker integration tests with wrangler dev --local
### 5.3 Build pipeline — turborepo dependency graph
### 5.4 Developer experience — turbo dev, symlinked plugin, wrangler dev
### 5.5 `rotate-secret` CLI command
- Generate new random auth secret
- Update `AUTH_SECRET` on the Worker via Cloudflare SDK
- Prompt for each device name and print new tokens
- Remind user to update each Obsidian instance
- This is the only way to revoke a compromised device (invalidates ALL tokens)

### 5.6 Manifest reconciliation / `repair` command
- Full `ListObjectsV2` scan of the R2 bucket
- Compare actual R2 contents against manifest, detect and fix drift
- Can be run manually via CLI or as a plugin command

### 5.7 Revisit exclude patterns
- Audit the default exclude list — are we excluding too much or too little?
- Consider whether all `.obsidian/**` should be excluded by default (themes, snippets, hotkeys, etc. are device-specific)
- Evaluate whether plugin settings (`data.json` files) should sync or not — some users want consistent plugin config across devices
- Investigate using `.gitignore`-style syntax instead of custom glob-to-regex conversion
- Consider a `.r2syncignore` file in the vault root as an alternative/complement to the settings UI

### 5.8 Evaluate R2 object versioning
- R2 supports object versioning at the bucket level — when enabled, every PUT creates a new version rather than overwriting
- Investigate enabling versioning on the bucket via `PutBucketVersioning` (S3-compatible API)
- Key benefits:
  - **File history / undo**: users could restore previous versions of any synced file
  - **Safety net**: accidental deletes or bad merges are recoverable without external backups
  - **Simpler conflict resolution**: instead of needing the base version for three-way merge, we could fetch the common ancestor version from R2's version history
- Key concerns:
  - **Storage costs**: every edit creates a new version; need lifecycle rules to expire old versions (e.g., keep last N versions or versions from last 30 days)
  - **Manifest complexity**: do we store version IDs in the manifest? Or rely on R2's version list API at conflict time?
  - **Delete semantics**: with versioning, DELETE creates a "delete marker" — need to understand implications for our delete sync flow
- Potential CLI additions: `pnpm cli enable-versioning`, `pnpm cli file-history <path>`
- Potential plugin additions: "View file history" command, "Restore version" UI

### 5.9 Sync-on-file-open with brief blocking modal
- Explore showing a brief modal/overlay ("Syncing latest version...") when opening a file that may have remote changes
- On file open: `HEAD /manifest` to check ETag → if changed, check if this file has a newer remote version → download before user edits
- Modal blocks editing for the duration of the check (~300-700ms typical)
- If sync takes longer than ~1 second, dismiss modal and fall back to three-way merge if the user starts editing
- Should be a user-configurable setting (some users may find it annoying)
- Requires investigation into Obsidian's plugin API for file open hooks and editor interaction control

---

## Key Dependencies

| Package | Purpose | Where Used |
|---------|---------|------------|
| `obsidian` | Plugin API | plugin |
| `diff-match-patch` | Three-way merge | plugin |
| `hono` | Worker framework | worker |
| `aws4fetch` | Presigned URL signing | worker |
| `commander` | CLI framework | cli |
| `inquirer` | Interactive prompts | cli |
| `chalk` | Colored output | cli |
| `ora` | Spinners | cli |
| `cloudflare` | CloudFlare SDK (infra provisioning) | cli |
| `vitest` | Test runner | all |
| `esbuild` | Plugin bundler | plugin |
| `typescript` | Type checking | all |
| `turborepo` | Build orchestration | root |
