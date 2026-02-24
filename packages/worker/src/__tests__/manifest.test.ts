import { describe, it, expect, beforeEach } from "vitest";
import { appRequest, generateToken, createTestEnv } from "./helpers/test-app.js";
import { MockR2Bucket } from "./helpers/mock-r2.js";

describe("Manifest CRUD", () => {
  let bucket: MockR2Bucket;
  let env: ReturnType<typeof createTestEnv>;
  let token: string;

  beforeEach(async () => {
    bucket = new MockR2Bucket();
    env = createTestEnv(bucket);
    token = await generateToken("test-device");
  });

  it("GET returns empty manifest when none exists", async () => {
    const res = await appRequest("/manifest", { token, env });
    expect(res.status).toBe(200);

    const body = await res.json() as { manifest: { files: Record<string, unknown> }; etag: string | null };
    expect(body.manifest.files).toEqual({});
    expect(body.etag).toBeNull();
  });

  it("PUT creates manifest without If-Match for first write", async () => {
    const manifestData = JSON.stringify({
      files: { "a.md": { path: "a.md", hash: "abc", mtime: 1000, size: 100, lastModifiedBy: "test" } },
      lastUpdated: new Date().toISOString(),
      lastUpdatedBy: "test-device",
    });

    const res = await appRequest("/manifest", {
      method: "PUT",
      token,
      env,
      body: manifestData,
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; etag: string };
    expect(body.ok).toBe(true);
    expect(body.etag).toBeTruthy();
  });

  it("GET returns stored manifest after PUT", async () => {
    const manifestData = {
      files: { "test.md": { path: "test.md", hash: "xyz", mtime: 2000, size: 200, lastModifiedBy: "test" } },
      lastUpdated: new Date().toISOString(),
      lastUpdatedBy: "test-device",
    };

    // First, PUT a manifest
    const putRes = await appRequest("/manifest", {
      method: "PUT",
      token,
      env,
      body: JSON.stringify(manifestData),
      headers: { "Content-Type": "application/json" },
    });
    expect(putRes.status).toBe(200);

    // Then, GET it
    const getRes = await appRequest("/manifest", { token, env });
    expect(getRes.status).toBe(200);

    const body = await getRes.json() as { manifest: typeof manifestData; etag: string };
    expect(body.manifest.files["test.md"]).toBeDefined();
    expect(body.manifest.files["test.md"]!.hash).toBe("xyz");
    expect(body.etag).toBeTruthy();
  });

  it("PUT without If-Match after first write returns 428", async () => {
    // First write (no If-Match needed)
    await appRequest("/manifest", {
      method: "PUT",
      token,
      env,
      body: JSON.stringify({ files: {}, lastUpdated: new Date().toISOString(), lastUpdatedBy: "test" }),
      headers: { "Content-Type": "application/json" },
    });

    // Second write without If-Match
    const res = await appRequest("/manifest", {
      method: "PUT",
      token,
      env,
      body: JSON.stringify({ files: {}, lastUpdated: new Date().toISOString(), lastUpdatedBy: "test" }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(428);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("If-Match");
  });

  it("PUT with correct If-Match returns 200", async () => {
    // First write
    const putRes = await appRequest("/manifest", {
      method: "PUT",
      token,
      env,
      body: JSON.stringify({ files: {}, lastUpdated: new Date().toISOString(), lastUpdatedBy: "test" }),
      headers: { "Content-Type": "application/json" },
    });
    const { etag } = await putRes.json() as { etag: string };

    // Second write with correct If-Match
    const res = await appRequest("/manifest", {
      method: "PUT",
      token,
      env,
      body: JSON.stringify({ files: { "new.md": {} }, lastUpdated: new Date().toISOString(), lastUpdatedBy: "test" }),
      headers: { "Content-Type": "application/json", "If-Match": etag },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; etag: string };
    expect(body.ok).toBe(true);
    // Etag should have changed
    expect(body.etag).not.toBe(etag);
  });

  it("PUT with wrong If-Match returns 412", async () => {
    // First write
    await appRequest("/manifest", {
      method: "PUT",
      token,
      env,
      body: JSON.stringify({ files: {}, lastUpdated: new Date().toISOString(), lastUpdatedBy: "test" }),
      headers: { "Content-Type": "application/json" },
    });

    // Second write with wrong If-Match
    const res = await appRequest("/manifest", {
      method: "PUT",
      token,
      env,
      body: JSON.stringify({ files: {}, lastUpdated: new Date().toISOString(), lastUpdatedBy: "test" }),
      headers: { "Content-Type": "application/json", "If-Match": '"wrong-etag"' },
    });

    expect(res.status).toBe(412);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("modified");
  });
});
