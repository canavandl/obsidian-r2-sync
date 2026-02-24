/**
 * Test helper for creating authenticated requests against the Hono worker app.
 */

import app from "../../index.js";
import { MockR2Bucket } from "./mock-r2.js";

/** Fixed secret used for all test HMAC computations */
export const TEST_AUTH_SECRET = "test-secret-key-for-unit-tests";

/**
 * Generate a valid auth token for a given device ID.
 * Token format: "deviceId:hmacHex" where HMAC = SHA-256(AUTH_SECRET, deviceId)
 */
export async function generateToken(deviceId: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(TEST_AUTH_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(deviceId));
  const hmacHex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${deviceId}:${hmacHex}`;
}

/**
 * Create test bindings with a fresh MockR2Bucket.
 */
export function createTestEnv(bucket?: MockR2Bucket) {
  return {
    BUCKET: (bucket ?? new MockR2Bucket()) as unknown as R2Bucket,
    AUTH_SECRET: TEST_AUTH_SECRET,
    CF_ACCOUNT_ID: "test-account-id",
    CF_ACCESS_KEY_ID: "test-access-key",
    CF_SECRET_ACCESS_KEY: "test-secret-key",
    BUCKET_NAME: "test-bucket",
  };
}

/**
 * Make an authenticated request to the test app.
 */
export async function appRequest(
  path: string,
  options: {
    method?: string;
    body?: string;
    headers?: Record<string, string>;
    token?: string;
    env?: ReturnType<typeof createTestEnv>;
  } = {},
): Promise<Response> {
  const { method = "GET", body, headers = {}, token, env } = options;
  const testEnv = env ?? createTestEnv();

  const reqHeaders: Record<string, string> = { ...headers };
  if (token) {
    reqHeaders["Authorization"] = `Bearer ${token}`;
  }

  const url = `http://localhost${path}`;
  const request = new Request(url, {
    method,
    body,
    headers: reqHeaders,
  });

  return app.fetch(request, testEnv);
}
