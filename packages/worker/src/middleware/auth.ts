import { createMiddleware } from "hono/factory";
import type { Env } from "../index.js";

/**
 * Validates Bearer tokens.
 * Token format: `<deviceId>:<hmacHex>`
 * The HMAC is SHA-256(AUTH_SECRET, deviceId).
 */
export const authMiddleware = createMiddleware<Env>(async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }

  const token = authHeader.slice(7);
  const colonIndex = token.indexOf(":");
  if (colonIndex === -1) {
    return c.json({ error: "Invalid token format" }, 401);
  }

  const deviceId = token.slice(0, colonIndex);
  const providedHmac = token.slice(colonIndex + 1);

  // Compute expected HMAC
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(c.env.AUTH_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(deviceId));
  const expectedHmac = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time comparison
  if (expectedHmac.length !== providedHmac.length) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const expectedBytes = encoder.encode(expectedHmac);
  const providedBytes = encoder.encode(providedHmac);
  let mismatch = 0;
  for (let i = 0; i < expectedBytes.length; i++) {
    mismatch |= expectedBytes[i]! ^ providedBytes[i]!;
  }

  if (mismatch !== 0) {
    return c.json({ error: "Invalid token" }, 401);
  }

  // Attach device ID to context for downstream use
  c.set("deviceId", deviceId);
  await next();
});
