# Changelog

All notable changes to this project will be documented in this file.

## [0.1.3] - 2026-10-14

### Added

- Local file deletion is disabled by default. A new setting allows opting in to deletions from other devices; otherwise, sync stops before changing files when local deletions are detected.

### Fixed

- Connection testing now validates the device token and manifest access, and displays authentication failures.
- Sync stops when a previously synced vault unexpectedly loses its remote manifest, protecting local files while the bucket configuration is checked.
- The CLI retrieves the account's workers.dev subdomain through the correct Cloudflare SDK endpoint and rejects missing or blank subdomains instead of returning an invalid Worker URL.

## [0.1.0] - 2025-02-24

### Added

- Initial release
- **Plugin**: Obsidian plugin for vault synchronization via Cloudflare R2
  - Automatic sync with configurable interval
  - Three-way merge conflict resolution
  - Conflict resolution modal with diff view
  - Status bar indicator
  - Settings tab with full configuration
- **CLI**: Infrastructure provisioning tool
  - `setup` — Full provisioning wizard (bucket + worker + first device token)
  - `deploy` — Redeploy the Cloudflare Worker
  - `add-device` — Generate auth tokens for additional devices
  - `status` — Check Worker health
  - `rotate-secret` — Rotate the auth secret (invalidates all tokens)
  - `teardown` — Remove Worker and optionally the R2 bucket
- **Worker**: Cloudflare Worker API (Hono)
  - HMAC-based device authentication
  - Manifest CRUD with ETag optimistic concurrency
  - Presigned URL generation for R2 uploads/downloads
  - Health check endpoint
- **Shared**: Common types, constants, and utilities
