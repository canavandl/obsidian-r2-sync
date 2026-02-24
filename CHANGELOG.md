# Changelog

All notable changes to this project will be documented in this file.

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
