import type { App } from "obsidian";
import type {
  DiffResult,
  FileEntry,
  SyncManifest,
} from "@obsidian-r2-sync/shared";
import { diffManifests } from "@obsidian-r2-sync/shared";
import type { ApiClient } from "../api/client.js";
import { ManifestConflictError } from "../api/client.js";
import type R2SyncPlugin from "../main.js";

const MAX_RETRIES = 3;

/**
 * Orchestrates the full sync cycle:
 * 1. Build local manifest from vault
 * 2. Fetch remote manifest
 * 3. Diff local vs remote vs base
 * 4. Resolve conflicts
 * 5. Upload/download files
 * 6. Update remote manifest
 * 7. Save base manifest locally
 */
export class SyncEngine {
  constructor(
    private app: App,
    private api: ApiClient,
    private plugin: R2SyncPlugin,
  ) {}

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
    const baseManifest = forceFullSync ? null : (this.plugin as unknown as { baseManifest: SyncManifest | null }).baseManifest;
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

    // Step 5: Handle conflicts
    // TODO: Implement conflict resolution UI (Phase 4.3)
    if (diff.conflicts.length > 0) {
      console.warn("R2 Sync: Conflicts detected, skipping conflicted files for now");
    }

    // Step 6: Download files
    for (const entry of diff.toDownload) {
      await this.downloadFile(entry);
    }

    // Step 7: Upload files
    for (const entry of diff.toUpload) {
      await this.uploadFile(entry);
    }

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

    // Apply our changes to the manifest
    for (const entry of diff.toUpload) {
      updatedManifest.files[entry.path] = entry;
    }
    for (const path of diff.toDeleteRemote) {
      delete updatedManifest.files[path];
    }

    const { etag: newEtag } = await this.api.putManifest(updatedManifest, etag);

    // Step 11: Save base manifest locally
    (this.plugin as unknown as { baseManifest: SyncManifest; lastEtag: string; saveSettings: () => Promise<void> }).baseManifest = updatedManifest;
    (this.plugin as unknown as { lastEtag: string }).lastEtag = newEtag;
    await this.plugin.saveSettings();
  }

  private async buildLocalManifest(): Promise<SyncManifest> {
    const files: Record<string, FileEntry> = {};
    const allFiles = this.app.vault.getFiles();

    for (const file of allFiles) {
      // Check exclude patterns
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
      // Simple glob matching — convert ** and * to regex
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
      await this.app.vault.modifyBinary(existing as import("obsidian").TFile, content);
    } else {
      await this.app.vault.createBinary(entry.path, content);
    }
  }

  private async uploadFile(entry: FileEntry): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(entry.path);
    if (!file) throw new Error(`File not found: ${entry.path}`);

    const content = await this.app.vault.readBinary(file as import("obsidian").TFile);
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
