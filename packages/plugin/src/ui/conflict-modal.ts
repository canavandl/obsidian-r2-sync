import { Modal, App } from "obsidian";
import type { ConflictEntry } from "@obsidian-r2-sync/shared";

export type ConflictResolution = "keep-local" | "keep-remote" | "merge";

/**
 * Modal for resolving sync conflicts.
 * Shows a diff view and lets the user choose how to resolve.
 */
export class ConflictModal extends Modal {
  private conflict: ConflictEntry;
  private localContent: string;
  private remoteContent: string;
  private resolvePromise!: (resolution: ConflictResolution) => void;
  private resolved = false;

  constructor(
    app: App,
    conflict: ConflictEntry,
    localContent: string,
    remoteContent: string,
  ) {
    super(app);
    this.conflict = conflict;
    this.localContent = localContent;
    this.remoteContent = remoteContent;
  }

  /**
   * Show the modal and wait for user resolution.
   */
  async waitForResolution(): Promise<ConflictResolution> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      this.open();
    });
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("r2-sync-conflict-modal");

    contentEl.createEl("h2", { text: `Conflict: ${this.conflict.path}` });
    contentEl.createEl("p", {
      text: "This file was modified on both this device and another device.",
    });

    // Local version
    contentEl.createEl("h3", { text: "Local version" });
    const localPre = contentEl.createEl("div", { cls: "conflict-diff" });
    localPre.setText(this.localContent.slice(0, 2000));

    // Remote version
    contentEl.createEl("h3", { text: "Remote version" });
    const remotePre = contentEl.createEl("div", { cls: "conflict-diff" });
    remotePre.setText(this.remoteContent.slice(0, 2000));

    // Action buttons
    const actions = contentEl.createEl("div", { cls: "conflict-actions" });

    const keepLocalBtn = actions.createEl("button", { text: "Keep Local" });
    this.registerDomEvent(keepLocalBtn, "click", () => {
      this.resolved = true;
      this.resolvePromise("keep-local");
      this.close();
    });

    const keepRemoteBtn = actions.createEl("button", { text: "Keep Remote" });
    this.registerDomEvent(keepRemoteBtn, "click", () => {
      this.resolved = true;
      this.resolvePromise("keep-remote");
      this.close();
    });

    const mergeBtn = actions.createEl("button", { text: "Auto-merge", cls: "mod-cta" });
    this.registerDomEvent(mergeBtn, "click", () => {
      this.resolved = true;
      this.resolvePromise("merge");
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
    // If user closed modal without choosing (Escape, click outside), default to keep-local
    if (!this.resolved) {
      this.resolved = true;
      this.resolvePromise("keep-local");
    }
  }
}
