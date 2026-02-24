import { describe, it, expect } from "vitest";
import { appRequest, generateToken, createTestEnv } from "./helpers/test-app.js";

describe("Auth middleware", () => {
  it("returns 401 when Authorization header is missing", async () => {
    const res = await appRequest("/manifest");
    expect(res.status).toBe(401);

    const body = await res.json() as { error: string };
    expect(body.error).toContain("Authorization");
  });

  it("returns 401 for non-Bearer auth scheme", async () => {
    const res = await appRequest("/manifest", {
      headers: { Authorization: "Basic dXNlcjpwYXNz" },
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 for token without colon (bad format)", async () => {
    const res = await appRequest("/manifest", {
      token: "no-colon-token",
    });
    expect(res.status).toBe(401);

    const body = await res.json() as { error: string };
    expect(body.error).toContain("token format");
  });

  it("returns 401 for invalid HMAC", async () => {
    const res = await appRequest("/manifest", {
      token: "device-id:0000000000000000000000000000000000000000000000000000000000000000",
    });
    expect(res.status).toBe(401);

    const body = await res.json() as { error: string };
    expect(body.error).toContain("Invalid token");
  });

  it("passes through with valid token", async () => {
    const token = await generateToken("test-device");
    const res = await appRequest("/manifest", { token });

    // Should reach the manifest handler, not be blocked by auth
    // 200 means auth passed (manifest returns empty manifest when none exists)
    expect(res.status).toBe(200);
  });
});
