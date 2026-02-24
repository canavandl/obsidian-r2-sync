import { describe, it, expect, beforeEach } from "vitest";
import { appRequest, generateToken, createTestEnv } from "./helpers/test-app.js";
import { MockR2Bucket } from "./helpers/mock-r2.js";

describe("File routes — path validation", () => {
  let token: string;
  let env: ReturnType<typeof createTestEnv>;

  beforeEach(async () => {
    const bucket = new MockR2Bucket();
    env = createTestEnv(bucket);
    token = await generateToken("test-device");
  });

  it("blocks .. traversal", async () => {
    const res = await appRequest("/files/upload-url", {
      method: "POST",
      token,
      env,
      body: JSON.stringify({ path: "../etc/passwd", hash: "abc" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);

    const body = await res.json() as { error: string };
    expect(body.error).toContain("traversal");
  });

  it("blocks absolute path starting with /", async () => {
    const res = await appRequest("/files/upload-url", {
      method: "POST",
      token,
      env,
      body: JSON.stringify({ path: "/etc/passwd", hash: "abc" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
  });

  it("blocks absolute path starting with \\", async () => {
    const res = await appRequest("/files/upload-url", {
      method: "POST",
      token,
      env,
      body: JSON.stringify({ path: "\\windows\\system32", hash: "abc" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
  });

  it("blocks internal .obsidian-r2-sync/ keys", async () => {
    const res = await appRequest("/files/upload-url", {
      method: "POST",
      token,
      env,
      body: JSON.stringify({ path: ".obsidian-r2-sync/manifest.json", hash: "abc" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);

    const body = await res.json() as { error: string };
    expect(body.error).toContain("internal");
  });

  it("blocks empty path", async () => {
    const res = await appRequest("/files/upload-url", {
      method: "POST",
      token,
      env,
      body: JSON.stringify({ path: "", hash: "abc" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
  });

  it("accepts a valid path", async () => {
    const res = await appRequest("/files/upload-url", {
      method: "POST",
      token,
      env,
      body: JSON.stringify({ path: "notes/daily/2024-01-01.md", hash: "abc123" }),
      headers: { "Content-Type": "application/json" },
    });

    // The handler calls generatePresignedUrl which uses aws4fetch.
    // In the test environment without real AWS credentials, it should still
    // get past validation. If it returns 200, path validation passed.
    // If it throws, that's an infrastructure issue, not a validation one.
    expect(res.status).toBe(200);
  });
});

describe("File routes — delete", () => {
  let token: string;
  let env: ReturnType<typeof createTestEnv>;

  beforeEach(async () => {
    const bucket = new MockR2Bucket();
    env = createTestEnv(bucket);
    token = await generateToken("test-device");
  });

  it("returns 400 for empty paths array", async () => {
    const res = await appRequest("/files/delete", {
      method: "POST",
      token,
      env,
      body: JSON.stringify({ paths: [] }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);

    const body = await res.json() as { error: string };
    expect(body.error).toContain("paths");
  });

  it("returns 400 when a path in the array is invalid", async () => {
    const res = await appRequest("/files/delete", {
      method: "POST",
      token,
      env,
      body: JSON.stringify({ paths: ["valid.md", "../invalid.md"] }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
  });

  it("deletes valid paths and returns count", async () => {
    const res = await appRequest("/files/delete", {
      method: "POST",
      token,
      env,
      body: JSON.stringify({ paths: ["notes/a.md", "notes/b.md"] }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(200);

    const body = await res.json() as { ok: boolean; deleted: number };
    expect(body.ok).toBe(true);
    expect(body.deleted).toBe(2);
  });
});
