import type { DiffResult, FileEntry, SyncManifest } from "./types.js";

/**
 * Compare local and remote manifests to produce a diff.
 *
 * @param local  - The locally-built manifest of the vault
 * @param remote - The manifest fetched from R2
 * @param base   - The last-synced manifest (snapshot from previous successful sync)
 * @returns A DiffResult describing what needs to happen
 */
export function diffManifests(
  local: SyncManifest,
  remote: SyncManifest,
  base: SyncManifest | null,
): DiffResult {
  const toUpload: FileEntry[] = [];
  const toDownload: FileEntry[] = [];
  const toDeleteRemote: string[] = [];
  const toDeleteLocal: string[] = [];
  const conflicts: DiffResult["conflicts"] = [];

  const allPaths = new Set([
    ...Object.keys(local.files),
    ...Object.keys(remote.files),
    ...(base ? Object.keys(base.files) : []),
  ]);

  for (const path of allPaths) {
    const localEntry = local.files[path];
    const remoteEntry = remote.files[path];
    const baseEntry = base?.files[path];

    const localChanged = localEntry && baseEntry ? localEntry.hash !== baseEntry.hash : false;
    const remoteChanged = remoteEntry && baseEntry ? remoteEntry.hash !== baseEntry.hash : false;

    if (localEntry && !remoteEntry) {
      if (baseEntry) {
        // File existed in base but was deleted remotely
        if (localChanged) {
          // Modified locally, deleted remotely → conflict
          conflicts.push({ path, local: localEntry, remote: baseEntry, baseHash: baseEntry.hash });
        } else {
          // Not modified locally → accept remote deletion
          toDeleteLocal.push(path);
        }
      } else {
        // New local file → upload
        toUpload.push(localEntry);
      }
    } else if (!localEntry && remoteEntry) {
      if (baseEntry) {
        // File existed in base but was deleted locally
        if (remoteChanged) {
          // Modified remotely, deleted locally → conflict
          conflicts.push({ path, local: baseEntry, remote: remoteEntry, baseHash: baseEntry.hash });
        } else {
          // Not modified remotely → accept local deletion
          toDeleteRemote.push(path);
        }
      } else {
        // New remote file → download
        toDownload.push(remoteEntry);
      }
    } else if (localEntry && remoteEntry) {
      if (localEntry.hash === remoteEntry.hash) {
        // Same content, nothing to do
        continue;
      }

      if (base) {
        if (localChanged && !remoteChanged) {
          // Only local changed → upload
          toUpload.push(localEntry);
        } else if (!localChanged && remoteChanged) {
          // Only remote changed → download
          toDownload.push(remoteEntry);
        } else if (localChanged && remoteChanged) {
          // Both changed → conflict
          conflicts.push({ path, local: localEntry, remote: remoteEntry, baseHash: baseEntry?.hash });
        } else {
          // Neither changed relative to base, but hashes differ?
          // This shouldn't happen, but treat as conflict to be safe
          conflicts.push({ path, local: localEntry, remote: remoteEntry, baseHash: baseEntry?.hash });
        }
      } else {
        // No base manifest (first sync) — if hashes differ, it's a conflict
        conflicts.push({ path, local: localEntry, remote: remoteEntry });
      }
    }
    // Both null: file was in base, deleted on both sides → nothing to do
  }

  return { toUpload, toDownload, toDeleteRemote, toDeleteLocal, conflicts };
}

/**
 * Merge a DiffResult back into a manifest, producing an updated manifest
 * that reflects the resolved state after sync.
 */
export function applyDiffToManifest(
  base: SyncManifest,
  diff: DiffResult,
  deviceId: string,
): SyncManifest {
  const files = { ...base.files };

  // Apply uploads (local wins)
  for (const entry of diff.toUpload) {
    files[entry.path] = entry;
  }

  // Apply downloads (remote wins)
  for (const entry of diff.toDownload) {
    files[entry.path] = entry;
  }

  // Apply remote deletions
  for (const path of diff.toDeleteRemote) {
    delete files[path];
  }

  // Apply local deletions
  for (const path of diff.toDeleteLocal) {
    delete files[path];
  }

  return {
    files,
    lastUpdated: new Date().toISOString(),
    lastUpdatedBy: deviceId,
  };
}
