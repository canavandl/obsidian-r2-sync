import { Notice, Plugin } from "obsidian";
import type { SyncConfig, SyncManifest } from "@obsidian-r2-sync/shared";
import { DEFAULT_SYNC_INTERVAL } from "@obsidian-r2-sync/shared";
import { SyncEngine } from "./sync/engine.js";
import { ApiClient } from "./api/client.js";
import { R2SyncSettingsTab } from "./ui/settings-tab.js";
import { StatusBar } from "./ui/status-bar.js";

/** Stored plugin data: settings + base manifest + last ETag */
interface PluginData {
  settings: SyncConfig;
  baseManifest: SyncManifest | null;
  lastEtag: string | null;
}

const DEFAULT_SETTINGS: SyncConfig = {
  endpoint: "",
  token: "",
  deviceId: "",
  syncInterval: DEFAULT_SYNC_INTERVAL,
  conflictStrategy: "ask",
  excludePatterns: [
    ".obsidian/plugins/obsidian-r2-sync/**",
    ".obsidian/workspace.json",
    ".obsidian/workspace-mobile.json",
  ],
  syncOnFileOpen: false,
};

export default class R2SyncPlugin extends Plugin {
  settings!: SyncConfig;
  baseManifest: SyncManifest | null = null;
  lastEtag: string | null = null;
  private syncEngine!: SyncEngine;
  private apiClient!: ApiClient;
  private statusBar!: StatusBar;
  private syncIntervalId: number | null = null;
  private isSyncing = false;

  async onload(): Promise<void> {
    await this.loadSettings();

    // Initialize API client
    this.apiClient = new ApiClient(this.settings.endpoint, this.settings.token);

    // Initialize sync engine
    this.syncEngine = new SyncEngine(this.app, this.apiClient, this);

    // Add status bar
    this.statusBar = new StatusBar(this.addStatusBarItem());

    // Add settings tab
    this.addSettingTab(new R2SyncSettingsTab(this.app, this));

    // Register commands
    this.addCommand({
      id: "sync-now",
      name: "Sync now",
      callback: () => this.triggerSync(),
    });

    this.addCommand({
      id: "force-full-sync",
      name: "Force full sync (ignore base manifest)",
      callback: () => this.triggerSync(true),
    });

    // Start interval sync if configured
    this.startSyncInterval();
  }

  onunload(): void {
    this.stopSyncInterval();
  }

  async loadSettings(): Promise<void> {
    const data: PluginData | null = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data?.settings);
    this.baseManifest = data?.baseManifest ?? null;
    this.lastEtag = data?.lastEtag ?? null;

    // Generate device ID if not set
    if (!this.settings.deviceId) {
      this.settings.deviceId = this.generateDeviceId();
      await this.saveSettings();
    }
  }

  async saveSettings(): Promise<void> {
    const data: PluginData = {
      settings: this.settings,
      baseManifest: this.baseManifest,
      lastEtag: this.lastEtag,
    };
    await this.saveData(data);
  }

  async triggerSync(forceFullSync = false): Promise<void> {
    if (!this.settings.endpoint || !this.settings.token) {
      new Notice("R2 Sync: Please configure endpoint and token in settings");
      return;
    }

    if (this.isSyncing) {
      console.log("R2 Sync: Sync already in progress, skipping");
      return;
    }

    this.isSyncing = true;
    try {
      this.statusBar.setSyncing();
      await this.syncEngine.sync(forceFullSync);
      this.statusBar.setIdle();
      new Notice("R2 Sync: Sync complete");
    } catch (error) {
      this.statusBar.setError();
      const message = error instanceof Error ? error.message : "Unknown error";
      new Notice(`R2 Sync: Sync failed — ${message}`);
      console.error("R2 Sync error:", error);
    } finally {
      this.isSyncing = false;
    }
  }

  startSyncInterval(): void {
    this.stopSyncInterval();
    if (this.settings.syncInterval > 0) {
      this.syncIntervalId = window.setInterval(
        () => this.triggerSync(),
        this.settings.syncInterval * 1000,
      );
      this.registerInterval(this.syncIntervalId);
    }
  }

  stopSyncInterval(): void {
    if (this.syncIntervalId !== null) {
      window.clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }
  }

  private generateDeviceId(): string {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let id = "device-";
    for (let i = 0; i < 8; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
  }
}
