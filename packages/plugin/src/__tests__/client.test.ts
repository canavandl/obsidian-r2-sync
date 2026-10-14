import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestUrl } from "obsidian";
import { ApiClient } from "../api/client.js";

vi.mock("obsidian", () => ({ requestUrl: vi.fn() }));

function response(status: number, json: unknown) {
  return { status, json, headers: {}, text: JSON.stringify(json), arrayBuffer: new ArrayBuffer(0) };
}

describe("Authenticated connection test", () => {
  beforeEach(() => vi.resetAllMocks());

  it("rejects an invalid token even when public health succeeds", async () => {
    vi.mocked(requestUrl)
      .mockResolvedValueOnce(response(200, { ok: true }))
      .mockResolvedValueOnce(response(401, { error: "Invalid token" }));
    await expect(new ApiClient("https://worker.example", "stale-token").testConnection()).rejects.toThrow("401: Invalid token");
    expect(requestUrl).toHaveBeenLastCalledWith(expect.objectContaining({
      url: "https://worker.example/manifest", headers: { Authorization: "Bearer stale-token" },
    }));
  });

  it("succeeds when both health and authenticated manifest access work", async () => {
    vi.mocked(requestUrl)
      .mockResolvedValueOnce(response(200, { ok: true }))
      .mockResolvedValueOnce(response(200, { manifest: { files: {} }, etag: null }));
    await expect(new ApiClient("https://worker.example", "valid-token").testConnection()).resolves.toBeUndefined();
    expect(requestUrl).toHaveBeenCalledTimes(2);
  });

  it("rejects an unhealthy Worker", async () => {
    vi.mocked(requestUrl).mockResolvedValueOnce(response(200, { ok: false }));
    await expect(new ApiClient("https://worker.example", "token").testConnection()).rejects.toThrow("health check failed");
    expect(requestUrl).toHaveBeenCalledTimes(1);
  });
});
