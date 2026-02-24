/**
 * Manages the sync status indicator in Obsidian's status bar.
 */
export class StatusBar {
  constructor(private el: HTMLElement) {
    this.el.addClass("r2-sync-status-bar");
    this.setIdle();
  }

  setIdle(): void {
    this.el.removeClass("is-syncing", "is-error");
    this.el.setText("R2 ✓");
    this.el.setAttribute("aria-label", "R2 Sync: Idle");
  }

  setSyncing(): void {
    this.el.addClass("is-syncing");
    this.el.removeClass("is-error");
    this.el.setText("R2 ↻");
    this.el.setAttribute("aria-label", "R2 Sync: Syncing...");
  }

  setError(): void {
    this.el.addClass("is-error");
    this.el.removeClass("is-syncing");
    this.el.setText("R2 ✗");
    this.el.setAttribute("aria-label", "R2 Sync: Error");
  }

  setConflict(): void {
    this.el.removeClass("is-syncing");
    this.el.addClass("is-error");
    this.el.setText("R2 ⚠");
    this.el.setAttribute("aria-label", "R2 Sync: Conflicts detected");
  }
}
