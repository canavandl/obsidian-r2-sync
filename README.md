# Obsidian R2 Vault Sync

Sync your Obsidian vault across devices using Cloudflare R2 storage and a Cloudflare Worker.

## Prerequisites

- **Node.js** >= 20
- **pnpm** >= 9
- A **Cloudflare account** (free tier works)

## Setup Guide

### 1. Enable R2 on your Cloudflare account

Before running the CLI, you must activate R2 Object Storage on your Cloudflare account:

1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Click **R2 Object Storage** in the left sidebar
3. Click through the activation prompt to enable R2

This is a one-time step. R2 has a generous free tier (10 GB storage, 10 million reads/month, 1 million writes/month).

### 2. Create a Cloudflare API token

1. Go to [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click **Create Token**
3. Select **Create Custom Token**
4. Configure the following permissions:

| Permission | Access |
|---|---|
| **Account / Workers Scripts** | Edit |
| **Account / Workers R2 Storage** | Edit |
| **Account / Account API Tokens** | Edit |

- **Workers Scripts** — needed to deploy the Cloudflare Worker
- **Workers R2 Storage** — needed to create and manage the R2 bucket
- **Account API Tokens** — needed so the CLI can automatically create an R2-scoped API token for presigned URL generation

5. Under **Account Resources**, select your account
6. Click **Continue to summary**, then **Create Token**
7. Copy the token — you'll need it in the next step

### 3. Build the project

```bash
git clone <repo-url>
cd obsidian-r2-sync
pnpm install
pnpm build
```

### 4. Run the setup wizard

```bash
pnpm cli setup
```

The setup wizard will:
1. Verify your API token
2. Create an R2 bucket
3. Create an R2 API token (for presigned URL generation)
4. Generate an auth secret
5. Deploy the Cloudflare Worker
6. Generate your first device token

At the end, it will output:
- **Endpoint URL** — the Worker URL to configure in the Obsidian plugin
- **Token** — paste this into the plugin settings (includes device ID automatically)
- **Auth Secret** — save this! You'll need it to add more devices

### 5. Install the Obsidian plugin

Copy the built plugin into your vault:

```bash
# Create the plugin directory
mkdir -p /path/to/your/vault/.obsidian/plugins/obsidian-r2-sync

# Copy the built files
cp packages/plugin/main.js /path/to/your/vault/.obsidian/plugins/obsidian-r2-sync/
cp packages/plugin/manifest.json /path/to/your/vault/.obsidian/plugins/obsidian-r2-sync/
cp packages/plugin/styles.css /path/to/your/vault/.obsidian/plugins/obsidian-r2-sync/
```

Then in Obsidian:
1. Go to **Settings > Community Plugins**
2. Enable **R2 Vault Sync**
3. Click the gear icon to configure:
   - **Worker endpoint**: paste the Worker URL from setup
   - **Auth token**: paste the token from setup (device ID is embedded in the token)

### 6. Add more devices

To sync another device, generate a new token:

```bash
pnpm cli add-device
```

## CLI Commands

| Command | Description |
|---|---|
| `pnpm cli setup` | Full provisioning wizard (bucket + worker + first token) |
| `pnpm cli deploy` | Redeploy the Worker (after code changes) |
| `pnpm cli add-device` | Generate an auth token for a new device |
| `pnpm cli status` | Check Worker health |
| `pnpm cli teardown` | Remove Worker and optionally the R2 bucket |

## Development

```bash
# Build all packages
pnpm build

# Watch mode (all packages)
pnpm dev

# Type checking
pnpm typecheck

# Local Worker development
cd packages/worker
npx wrangler dev
```

## Architecture

```
Obsidian Plugin  <-->  Cloudflare Worker  <-->  R2 Bucket
                        (Hono API)
```

- **Plugin**: Builds local manifest, diffs against remote, uploads/downloads via presigned URLs
- **Worker**: Auth middleware, manifest CRUD, presigned URL generation
- **R2**: File storage + manifest (with ETag-based optimistic concurrency)
- **CLI**: Infrastructure provisioning via Cloudflare SDK

See [PLAN.md](./PLAN.md) for detailed architecture decisions.
