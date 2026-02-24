/**
 * Represents a single file tracked in the sync manifest.
 */
export interface FileEntry {
  /** Vault-relative path (e.g. "notes/daily/2024-01-01.md") */
  path: string;
  /** SHA-256 hex hash of the file contents */
  hash: string;
  /** Last modified timestamp (ms since epoch) */
  mtime: number;
  /** File size in bytes */
  size: number;
  /** Device ID that last modified this file */
  lastModifiedBy: string;
}

/**
 * The sync manifest stored in R2.
 * Concurrency is handled via R2 ETags, not a version field.
 */
export interface SyncManifest {
  /** Map of vault-relative path → FileEntry */
  files: Record<string, FileEntry>;
  /** ISO 8601 timestamp of last update */
  lastUpdated: string;
  /** Device ID that last updated the manifest */
  lastUpdatedBy: string;
}

/**
 * Plugin configuration stored in Obsidian settings.
 */
export interface SyncConfig {
  /** Worker API endpoint URL */
  endpoint: string;
  /** Bearer auth token for this device */
  token: string;
  /** Unique device identifier */
  deviceId: string;
  /** Sync interval in seconds (0 = manual only) */
  syncInterval: number;
  /** Conflict resolution strategy */
  conflictStrategy: ConflictStrategy;
  /** Glob patterns to exclude from sync */
  excludePatterns: string[];
  /** Whether sync-on-file-open is enabled */
  syncOnFileOpen: boolean;
}

export type ConflictStrategy = "three-way-merge" | "keep-local" | "keep-remote" | "ask";

/**
 * Result of diffing local vs remote manifests.
 */
export interface DiffResult {
  /** Files that need to be uploaded (new or modified locally) */
  toUpload: FileEntry[];
  /** Files that need to be downloaded (new or modified remotely) */
  toDownload: FileEntry[];
  /** Files that were deleted locally and should be deleted remotely */
  toDeleteRemote: string[];
  /** Files that were deleted remotely and should be deleted locally */
  toDeleteLocal: string[];
  /** Files modified on both sides — need conflict resolution */
  conflicts: ConflictEntry[];
}

export interface ConflictEntry {
  path: string;
  local: FileEntry;
  remote: FileEntry;
  /** Base version hash (from last successful sync), if available */
  baseHash?: string;
}

/**
 * Sync cycle status.
 */
export type SyncStatus =
  | { state: "idle" }
  | { state: "syncing"; progress: SyncProgress }
  | { state: "error"; message: string }
  | { state: "conflict"; conflicts: ConflictEntry[] };

export interface SyncProgress {
  phase: "comparing" | "downloading" | "uploading" | "finalizing";
  current: number;
  total: number;
}

/**
 * Worker API response types.
 */
export interface PresignedUrlResponse {
  url: string;
  expiresAt: string;
}

export interface HealthResponse {
  ok: boolean;
  version: string;
  timestamp: string;
}

export interface ManifestResponse {
  manifest: SyncManifest;
  etag: string;
}
