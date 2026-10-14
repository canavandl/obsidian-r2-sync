import { describe, expect, it, vi } from "vitest";
import type { App } from "obsidian";
import type { SyncManifest } from "@obsidian-r2-sync/shared";
import { SyncEngine } from "../sync/engine.js";
import type { ApiClient } from "../api/client.js";
import type R2SyncPlugin from "../main.js";

vi.mock("obsidian", () => ({ requestUrl: vi.fn(), Modal: class {} }));

async function fixture() {
  const content = new TextEncoder().encode("Keep this note").buffer;
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", content)))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  const base: SyncManifest = {
    files: { "note.md": { path: "note.md", hash, size: content.byteLength, mtime: 1, lastModifiedBy: "device" } },
    lastUpdated: "", lastUpdatedBy: "device",
  };
  const vault = {
    getFiles: vi.fn(() => [{ path: "note.md", stat: { mtime: 1, size: content.byteLength } }]),
    readBinary: vi.fn(async () => content),
    delete: vi.fn(), modifyBinary: vi.fn(), createBinary: vi.fn(),
  };
  const api = {
    getManifest: vi.fn(async () => ({ manifest: { files: {}, lastUpdated: "", lastUpdatedBy: "" }, etag: null as string | null })),
    getUploadUrl: vi.fn(), getDownloadUrl: vi.fn(), deleteFiles: vi.fn(), putManifest: vi.fn(),
  };
  const plugin = {
    baseManifest: base, deviceId: "device",
    settings: { excludePatterns: [], conflictStrategy: "keep-local", allowLocalDeletion: false },
    saveSettings: vi.fn(),
  };
  const engine = new SyncEngine({ vault } as unknown as App, api as unknown as ApiClient, plugin as unknown as R2SyncPlugin);
  return { engine, api, vault, plugin };
}

function expectNoChanges(api: Awaited<ReturnType<typeof fixture>>["api"], vault: Awaited<ReturnType<typeof fixture>>["vault"]) {
  for (const operation of [api.getUploadUrl, api.getDownloadUrl, api.deleteFiles, api.putManifest, vault.delete, vault.modifyBinary, vault.createBinary]) {
    expect(operation).not.toHaveBeenCalled();
  }
}

describe("Sync safety checks", () => {
  it("stops before any changes when a previously synced vault loses its remote manifest", async () => {
    const { engine, api, vault } = await fixture();
    await expect(engine.sync()).rejects.toThrow("Remote sync manifest is missing");
    expectNoChanges(api, vault);
  });

  it("blocks local deletion even when the empty remote manifest exists", async () => {
    const { engine, api, vault } = await fixture();
    api.getManifest.mockResolvedValue({ manifest: { files: {}, lastUpdated: "", lastUpdatedBy: "" }, etag: '"existing"' });
    await expect(engine.sync()).rejects.toThrow("would delete 1 local file");
    expectNoChanges(api, vault);
  });

  it("blocks deletions for settings saved before the safety option existed", async () => {
    const { engine, api, vault, plugin } = await fixture();
    Reflect.deleteProperty(plugin.settings, "allowLocalDeletion");
    api.getManifest.mockResolvedValue({ manifest: { files: {}, lastUpdated: "", lastUpdatedBy: "" }, etag: '"existing"' });
    await expect(engine.sync()).rejects.toThrow("Local deletion is disabled");
    expectNoChanges(api, vault);
  });

  it("allows an unchanged populated vault to sync without writes", async () => {
    const { engine, api, vault, plugin } = await fixture();
    api.getManifest.mockResolvedValue({ manifest: plugin.baseManifest, etag: '"existing"' });
    await expect(engine.sync()).resolves.toBeUndefined();
    expectNoChanges(api, vault);
  });
});
