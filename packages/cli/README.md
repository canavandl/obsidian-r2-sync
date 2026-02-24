# obsidian-r2-sync

CLI for provisioning [Obsidian R2 Vault Sync](https://github.com/canavandl/obsidian-r2-sync) infrastructure on Cloudflare.

Sync your Obsidian vault across devices using Cloudflare R2 storage and a Cloudflare Worker — all on the free tier.

## Prerequisites

- **Node.js** >= 20
- A **Cloudflare account** with [R2 enabled](https://dash.cloudflare.com) (free tier works)
- A **Cloudflare API token** with these permissions:
  - Account / Workers Scripts: Edit
  - Account / Workers R2 Storage: Edit
  - Account / Account API Tokens: Edit

See the [full setup guide](https://github.com/canavandl/obsidian-r2-sync#setup-guide) for step-by-step instructions on creating your API token.

## Installation

```bash
npx obsidian-r2-sync setup
```

Or install globally:

```bash
npm install -g obsidian-r2-sync
obsidian-r2-sync setup
```

## Commands

### `setup`

Full provisioning wizard. Creates an R2 bucket, deploys the Cloudflare Worker, and generates your first device token.

```bash
npx obsidian-r2-sync setup
```

The wizard will output:
- **Endpoint URL** — the Worker URL to configure in the Obsidian plugin
- **Token** — paste this into the plugin settings
- **Auth Secret** — save this to add more devices later

### `deploy`

Redeploy the Cloudflare Worker (e.g. after updating to a new version).

```bash
npx obsidian-r2-sync deploy
```

### `add-device`

Generate an auth token for an additional device.

```bash
npx obsidian-r2-sync add-device
```

### `status`

Check the health of your deployed Worker.

```bash
npx obsidian-r2-sync status
```

### `rotate-secret`

Generate a new auth secret and redeploy the Worker. **This invalidates all existing device tokens** — you'll need to run `add-device` again for each device.

```bash
npx obsidian-r2-sync rotate-secret
```

### `teardown`

Remove the Cloudflare Worker and optionally delete the R2 bucket.

```bash
npx obsidian-r2-sync teardown
```

## How It Works

This CLI provisions the server-side infrastructure for Obsidian R2 Vault Sync:

1. **R2 Bucket** — stores your vault files and sync manifest
2. **Cloudflare Worker** — API layer handling authentication, manifest management, and presigned URL generation
3. **HMAC tokens** — each device gets a unique token for authentication

The Obsidian plugin then syncs your vault files directly to/from R2 via presigned URLs.

## Pricing

Everything runs on Cloudflare's free tier. For a typical personal vault (~500 MB, 2-3 devices), you'll pay **$0/month**.

| Resource | Free Allowance | Typical Usage |
|---|---|---|
| Workers requests | 100,000/day | ~50-200/day |
| R2 storage | 10 GB/month | ~500 MB |
| R2 Class A ops | 1M/month | ~1,000-3,000/month |
| R2 Class B ops | 10M/month | ~3,000-10,000/month |

## License

MIT
