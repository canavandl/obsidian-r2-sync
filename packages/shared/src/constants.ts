export const PACKAGE_VERSION = "0.1.0";

/** R2 key prefix for the sync manifest */
export const MANIFEST_KEY = ".obsidian-r2-sync/manifest.json";

/** R2 key prefix for vault files */
export const FILES_PREFIX = "vault/";

/** API route paths */
export const API_ROUTES = {
  HEALTH: "/health",
  MANIFEST: "/manifest",
  UPLOAD_URL: "/files/upload-url",
  DOWNLOAD_URL: "/files/download-url",
  DELETE_FILES: "/files/delete",
} as const;

/** Default sync interval in seconds */
export const DEFAULT_SYNC_INTERVAL = 300; // 5 minutes

/** Presigned URL expiry in seconds */
export const PRESIGNED_URL_EXPIRY = 900; // 15 minutes

/** Maximum concurrent file transfers */
export const MAX_CONCURRENT_TRANSFERS = 5;

/** Maximum retry attempts for failed transfers */
export const MAX_RETRIES = 3;

/** Retry backoff base in milliseconds */
export const RETRY_BACKOFF_MS = 1000;
