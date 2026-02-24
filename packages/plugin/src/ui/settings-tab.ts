import { App, PluginSettingTab, Setting } from "obsidian";
import type R2SyncPlugin from "../main.js";

export class R2SyncSettingsTab extends PluginSettingTab {
  plugin: R2SyncPlugin;
  private resetTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(app: App, plugin: R2SyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
    containerEl.empty();

    containerEl.createEl("h2", { text: "R2 Vault Sync Settings" });

    new Setting(containerEl)
      .setName("Worker endpoint")
      .setDesc("URL of your Cloudflare Worker (e.g., https://obsidian-r2-sync.your-account.workers.dev)")
      .addText((text) =>
        text
          .setPlaceholder("https://...")
          .setValue(this.plugin.settings.endpoint)
          .onChange(async (value) => {
            this.plugin.settings.endpoint = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Auth token")
      .setDesc("Device authentication token from the CLI setup")
      .addText((text) =>
        text
          .setPlaceholder("device-xxxx:hmac...")
          .setValue(this.plugin.settings.token)
          .onChange(async (value) => {
            this.plugin.settings.token = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Sync interval (seconds)")
      .setDesc("How often to sync automatically. Set to 0 for manual-only sync.")
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.syncInterval))
          .onChange(async (value) => {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num >= 0) {
              this.plugin.settings.syncInterval = num;
              await this.plugin.saveSettings();
              this.plugin.startSyncInterval();
            }
          }),
      );

    new Setting(containerEl)
      .setName("Conflict strategy")
      .setDesc("How to handle files modified on multiple devices")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("ask", "Ask me each time")
          .addOption("three-way-merge", "Auto-merge (three-way)")
          .addOption("keep-local", "Always keep local")
          .addOption("keep-remote", "Always keep remote")
          .setValue(this.plugin.settings.conflictStrategy)
          .onChange(async (value) => {
            this.plugin.settings.conflictStrategy = value as typeof this.plugin.settings.conflictStrategy;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Exclude patterns")
      .setDesc("Glob patterns to exclude from sync (one per line)")
      .addTextArea((text) =>
        text
          .setValue(this.plugin.settings.excludePatterns.join("\n"))
          .onChange(async (value) => {
            this.plugin.settings.excludePatterns = value
              .split("\n")
              .map((p) => p.trim())
              .filter((p) => p.length > 0);
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Sync on file open")
      .setDesc("Check for remote changes when opening a file (adds slight delay)")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.syncOnFileOpen)
          .onChange(async (value) => {
            this.plugin.settings.syncOnFileOpen = value;
            await this.plugin.saveSettings();
          }),
      );

    // Test connection button
    new Setting(containerEl)
      .setName("Test connection")
      .setDesc("Verify that the Worker endpoint is reachable")
      .addButton((button) =>
        button.setButtonText("Test").onClick(async () => {
          try {
            button.setButtonText("Testing...");
            button.setDisabled(true);
            const { ApiClient } = await import("../api/client.js");
            const client = new ApiClient(this.plugin.settings.endpoint, this.plugin.settings.token);
            const health = await client.health();
            if (health.ok) {
              button.setButtonText("✓ Connected");
            }
          } catch (e) {
            button.setButtonText("✗ Failed");
            console.error("Connection test failed:", e);
          } finally {
            this.resetTimer = setTimeout(() => {
              this.resetTimer = null;
              button.setButtonText("Test");
              button.setDisabled(false);
            }, 3000);
          }
        }),
      );
  }

  hide(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
  }
}
