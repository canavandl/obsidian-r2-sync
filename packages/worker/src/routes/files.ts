import { Hono } from "hono";
import { AwsClient } from "aws4fetch";
import { FILES_PREFIX, PRESIGNED_URL_EXPIRY } from "@obsidian-r2-sync/shared";
import type { Env } from "../index.js";

export const fileRoutes = new Hono<Env>();

/**
 * Generate a presigned URL for uploading a file to R2.
 */
fileRoutes.post("/upload-url", async (c) => {
  const { path, hash } = await c.req.json<{ path: string; hash: string }>();

  if (!path) {
    return c.json({ error: "path is required" }, 400);
  }

  const r2Key = `${FILES_PREFIX}${path}`;

  // For presigned URLs we need the S3-compatible API
  // The Worker generates the URL; the client uploads directly to R2
  const url = await generatePresignedUrl(c.env, r2Key, "PUT");

  return c.json({
    url,
    expiresAt: new Date(Date.now() + PRESIGNED_URL_EXPIRY * 1000).toISOString(),
  });
});

/**
 * Generate a presigned URL for downloading a file from R2.
 */
fileRoutes.post("/download-url", async (c) => {
  const { path } = await c.req.json<{ path: string }>();

  if (!path) {
    return c.json({ error: "path is required" }, 400);
  }

  const r2Key = `${FILES_PREFIX}${path}`;
  const url = await generatePresignedUrl(c.env, r2Key, "GET");

  return c.json({
    url,
    expiresAt: new Date(Date.now() + PRESIGNED_URL_EXPIRY * 1000).toISOString(),
  });
});

/**
 * Delete files from R2.
 */
fileRoutes.post("/delete", async (c) => {
  const { paths } = await c.req.json<{ paths: string[] }>();

  if (!paths?.length) {
    return c.json({ error: "paths array is required" }, 400);
  }

  const keys = paths.map((p) => `${FILES_PREFIX}${p}`);

  // R2 supports deleting multiple objects at once
  await c.env.BUCKET.delete(keys);

  return c.json({ ok: true, deleted: paths.length });
});

/**
 * Generate a presigned URL using aws4fetch.
 * Uses the S3-compatible API endpoint for R2.
 */
async function generatePresignedUrl(
  env: Env["Bindings"],
  key: string,
  method: "GET" | "PUT",
): Promise<string> {
  // These credentials come from CF_ACCESS_KEY_ID and CF_SECRET_ACCESS_KEY
  // environment variables, set via wrangler secrets
  const client = new AwsClient({
    accessKeyId: (env as Record<string, string>).CF_ACCESS_KEY_ID,
    secretAccessKey: (env as Record<string, string>).CF_SECRET_ACCESS_KEY,
    service: "s3",
    region: "auto",
  });

  const accountId = (env as Record<string, string>).CF_ACCOUNT_ID;
  const bucketName = "obsidian-vault-sync";
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com/${bucketName}/${key}`;

  const signed = await client.sign(
    new Request(endpoint, { method }),
    { aws: { signQuery: true, allHeaders: true } },
  );

  return signed.url;
}
