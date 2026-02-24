import { describe, it, expect } from "vitest";
import { appRequest } from "./helpers/test-app.js";
import { PACKAGE_VERSION } from "@obsidian-r2-sync/shared";

describe("GET /health", () => {
  it("returns ok: true with version and timestamp", async () => {
    const res = await appRequest("/health");
    expect(res.status).toBe(200);

    const body = await res.json() as { ok: boolean; version: string; timestamp: string };
    expect(body.ok).toBe(true);
    expect(body.version).toBe(PACKAGE_VERSION);
    expect(body.timestamp).toBeTruthy();
    // Verify it's a valid ISO timestamp
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });

  it("does not require authentication", async () => {
    // No token provided — should still succeed
    const res = await appRequest("/health");
    expect(res.status).toBe(200);
  });
});
