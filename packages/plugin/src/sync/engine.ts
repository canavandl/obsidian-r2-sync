import type { App, TFile } from "obsidian";
import type {
  ConflictEntry,
  DiffResult,
  FileEntry,
  SyncManifest,
} from "@obsidian-r2-sync/shared";
import { diffManifests } from "@obsidian-r2-sync/shared";
import type { ApiClient } from "../api/client.js";
import { ManifestConflictError } from "../api/client.js";
import type R2SyncPlugin from "../main.js";
import { TransferQueue } from "./queue.js";
import { threeWayMerge } from "./merger.js";
import { ConflictModal } from "../ui/conflict-modal.js";
import type { ConflictResolution } from "../ui/conflict-modal.js";

const MAX_RETRIES = 3;

/**
 * Orchestrates the full sync cycle:
 * 1. Build local manifest from vault
 * 2. Fetch remote manifest
 * 3. Diff local vs remote vs base
 * 4. Resolve conflicts
 * 5. Upload/download files (concurrent via TransferQueue)
 * 6. Update remote manifest
 * 7. Save base manifest locally
 */
export class SyncEngine {
  private transferQueue: TransferQueue;

  constructor(
    private app: App,
    private api: ApiClient,
    private plugin: R2SyncPlugin,
  ) {
    this.transferQueue = new TransferQueue();
  }

  async sync(forceFullSync = false): Promise<void> {
    let retries = 0;

    while (retries < MAX_RETRIES) {
      try {
        await this.executeSyncCycle(forceFullSync);
        return;
      } catch (error) {
        if (error instanceof ManifestConflictError && retries < MAX_RETRIES - 1) {
          console.log(`R2 Sync: Manifest conflict, retrying (${retries + 1}/${MAX_RETRIES})`);
          retries++;
          continue;
        }
        throw error;
      }
    }
  }

  private async executeSyncCycle(forceFullSync: boolean): Promise<void> {
    // Step 1: Build local manifest
    const localManifest = await this.buildLocalManifest();

    // Step 2: Fetch remote manifest
    const { manifest: remoteManifest, etag } = await this.api.getManifest();

    // Step 3: Diff
    const baseManifest = forceFullSync ? null : this.plugin.baseManifest;
    const diff = diffManifests(localManifest, remoteManifest, baseManifest);

    // Step 4: Check if anything to do
    if (this.isDiffEmpty(diff)) {
      console.log("R2 Sync: Everything up to date");
      return;
    }

    console.log(
      `R2 Sync: ${diff.toUpload.length} uploads, ${diff.toDownload.length} downloads, ` +
      `${diff.toDeleteRemote.length} remote deletes, ${diff.toDeleteLocal.length} local deletes, ` +
      `${diff.conflicts.length} conflicts`,
    );

    // Step 5: Resolve conflicts
    const resolvedConflicts = await this.resolveConflicts(diff.conflicts, baseManifest);

    // Step 6: Download files (concurrent)
    const downloadPromises = diff.toDownload.map((entry) =>
      this.transferQueue.enqueue(() => this.downloadFile(entry)),
    );
    await Promise.all(downloadPromises);

    // Step 7: Upload files (concurrent)
    const uploadPromises = diff.toUpload.map((entry) =>
      this.transferQueue.enqueue(() => this.uploadFile(entry)),
    );
    await Promise.all(uploadPromises);

    // Step 8: Delete remote files
    if (diff.toDeleteRemote.length > 0) {
      await this.api.deleteFiles(diff.toDeleteRemote);
    }

    // Step 9: Delete local files
    for (const path of diff.toDeleteLocal) {
      await this.deleteLocalFile(path);
    }

    // Step 10: Build updated manifest and push
    const updatedManifest: SyncManifest = {
      files: { ...remoteManifest.files },
      lastUpdated: new Date().toISOString(),
      lastUpdatedBy: this.plugin.settings.deviceId,
    };

    // Apply uploads
    for (const entry of diff.toUpload) {
      updatedManifest.files[entry.path] = entry;
    }

    // Apply resolved conflicts
    for (const resolved of resolvedConflicts) {
      if (resolved.action === "deleted") {
        delete updatedManifest.files[resolved.path];
      } else {
        updatedManifest.files[resolved.path] = resolved.entry;
      }
    }

    // Apply remote deletions
    for (const path of diff.toDeleteRemote) {
      delete updatedManifest.files[path];
    }

    // Apply downloaded files to manifest
    for (const entry of diff.toDownload) {
      updatedManifest.files[entry.path] = entry;
    }

    const { etag: newEtag } = await this.api.putManifest(updatedManifest, etag);

    // Step 11: Save base manifest locally
    this.plugin.baseManifest = updatedManifest;
    this.plugin.lastEtag = newEtag;
    await this.plugin.saveSettings();
  }

  /**
   * Resolve conflicts based on the configured strategy.
   */
  private async resolveConflicts(
    conflicts: ConflictEntry[],
    baseManifest: SyncManifest | null,
  ): Promise<ResolvedConflict[]> {
    if (conflicts.length === 0) return [];

    const resolved: ResolvedConflict[] = [];
    const strategy = this.plugin.settings.conflictStrategy;

    for (const conflict of conflicts) {
      let resolution: ConflictResolution;

      if (strategy === "keep-local") {
        resolution = "keep-local";
      } else if (strategy === "keep-remote") {
        resolution = "keep-remote";
      } else if (strategy === "three-way-merge") {
        resolution = "merge";
      } else {
        // strategy === "ask" — show modal
        resolution = await this.askUserForResolution(conflict);
      }

      const result = await this.applyConflictResolution(conflict, resolution, baseManifest);
      resolved.push(result);
    }

    return resolved;
  }

  /**
   * Show the conflict modal and wait for user input.
   */
  private async askUserForResolution(conflict: ConflictEntry): Promise<ConflictResolution> {
    // Read local content
    const localFile = this.app.vault.getAbstractFileByPath(conflict.path);
    const localContent = localFile
      ? await this.app.vault.read(localFile as TFile)
      : "(file not found locally)";

    // Download remote content for display
    let remoteContent: string;
    try {
      const { url } = await this.api.getDownloadUrl(conflict.path);
      const response = await fetch(url);
      remoteContent = await response.text();
    } catch {
      remoteContent = "(could not fetch remote content)";
    }

    const modal = new ConflictModal(this.app, conflict, localContent, remoteContent);
    return modal.waitForResolution();
  }

  /**
   * Apply a conflict resolution decision.
   */
  private async applyConflictResolution(
    conflict: ConflictEntry,
    resolution: ConflictResolution,
    baseManifest: SyncManifest | null,
  ): Promise<ResolvedConflict> {
    const isMdFile = conflict.path.endsWith(".md");

    if (resolution === "keep-local") {
      // Upload local version
      await this.uploadFile(conflict.local);
      return { path: conflict.path, action: "uploaded", entry: conflict.local };
    }

    if (resolution === "keep-remote") {
      // Download remote version
      await this.downloadFile(conflict.remote);
      return { path: conflict.path, action: "downloaded", entry: conflict.remote };
    }

    // resolution === "merge"
    if (!isMdFile) {
      // Binary files can't be merged — fall back to keep-remote
      console.warn(`R2 Sync: Cannot merge binary file ${conflict.path}, keeping remote`);
      await this.downloadFile(conflict.remote);
      return { path: conflict.path, action: "downloaded", entry: conflict.remote };
    }

    // Three-way merge for .md files
    const localFile = this.app.vault.getAbstractFileByPath(conflict.path);
    if (!localFile) {
      await this.downloadFile(conflict.remote);
      return { path: conflict.path, action: "downloaded", entry: conflict.remote };
    }

    const localContent = await this.app.vault.read(localFile as TFile);

    // Get remote content
    const { url } = await this.api.getDownloadUrl(conflict.path);
    const remoteResponse = await fetch(url);
    const remoteContent = await remoteResponse.text();

    // Get base content if available
    let baseContent = "";
    if (conflict.baseHash && baseManifest) {
      // We don't store base content — use empty string as fallback
      // A proper implementation would cache base versions locally
      // For now, treat it as a two-way merge (empty base)
      baseContent = "";
    }

    const mergeResult = threeWayMerge(baseContent, localContent, remoteContent);

    // Write merged content
    await this.app.vault.modify(localFile as TFile, mergeResult.content);

    if (!mergeResult.clean) {
      console.warn(`R2 Sync: Merge of ${conflict.path} has conflict markers — manual review needed`);
    }

    // Build updated entry
    const mergedContent = new TextEncoder().encode(mergeResult.content);
    const hash = await this.hashContent(mergedContent.buffer as ArrayBuffer);
    const updatedEntry: FileEntry = {
      path: conflict.path,
      hash,
      mtime: Date.now(),
      size: mergedContent.byteLength,
      lastModifiedBy: this.plugin.settings.deviceId,
    };

    // Upload the merged version
    await this.uploadFile(updatedEntry);

    return { path: conflict.path, action: "uploaded", entry: updatedEntry };
  }

  private async buildLocalManifest(): Promise<SyncManifest> {
    const files: Record<string, FileEntry> = {};
    const allFiles = this.app.vault.getFiles();

    for (const file of allFiles) {
      if (this.isExcluded(file.path)) continue;

      const content = await this.app.vault.readBinary(file);
      const hash = await this.hashContent(content);

      files[file.path] = {
        path: file.path,
        hash,
        mtime: file.stat.mtime,
        size: file.stat.size,
        lastModifiedBy: this.plugin.settings.deviceId,
      };
    }

    return {
      files,
      lastUpdated: new Date().toISOString(),
      lastUpdatedBy: this.plugin.settings.deviceId,
    };
  }

  private isExcluded(path: string): boolean {
    return this.plugin.settings.excludePatterns.some((pattern) => {
      const regex = new RegExp(
        "^" +
        pattern
          .replace(/\./g, "\\.")
          .replace(/\*\*/g, ".*")
          .replace(/(?<!\.)(\*)/g, "[^/]*") +
        "$",
      );
      return regex.test(path);
    });
  }

  private async hashContent(content: ArrayBuffer): Promise<string> {
    const hashBuffer = await crypto.subtle.digest("SHA-256", content);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  private async downloadFile(entry: FileEntry): Promise<void> {
    const { url } = await this.api.getDownloadUrl(entry.path);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to download ${entry.path}`);

    const content = await response.arrayBuffer();

    // Create parent directories if needed
    const dir = entry.path.substring(0, entry.path.lastIndexOf("/"));
    if (dir && !this.app.vault.getAbstractFileByPath(dir)) {
      await this.app.vault.createFolder(dir);
    }

    const existing = this.app.vault.getAbstractFileByPath(entry.path);
    if (existing) {
      await this.app.vault.modifyBinary(existing as TFile, content);
    } else {
      await this.app.vault.createBinary(entry.path, content);
    }
  }

  private async uploadFile(entry: FileEntry): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(entry.path);
    if (!file) throw new Error(`File not found: ${entry.path}`);

    const content = await this.app.vault.readBinary(file as TFile);
    const { url } = await this.api.getUploadUrl(entry.path, entry.hash);

    const response = await fetch(url, {
      method: "PUT",
      body: content,
    });
    if (!response.ok) throw new Error(`Failed to upload ${entry.path}`);
  }

  private async deleteLocalFile(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file) {
      await this.app.vault.delete(file);
    }
  }

  private isDiffEmpty(diff: DiffResult): boolean {
    return (
      diff.toUpload.length === 0 &&
      diff.toDownload.length === 0 &&
      diff.toDeleteRemote.length === 0 &&
      diff.toDeleteLocal.length === 0 &&
      diff.conflicts.length === 0
    );
  }
}

interface ResolvedConflict {
  path: string;
  action: "uploaded" | "downloaded" | "deleted";
  entry: FileEntry;
}
