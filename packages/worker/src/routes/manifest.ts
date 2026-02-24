import { Hono } from "hono";
import { MANIFEST_KEY } from "@obsidian-r2-sync/shared";
import type { Env } from "../index.js";

export const manifestRoutes = new Hono<Env>();

manifestRoutes.get("/", async (c) => {
  const object = await c.env.BUCKET.get(MANIFEST_KEY);

  if (!object) {
    // No manifest yet — return empty one
    return c.json(
      {
        manifest: { files: {}, lastUpdated: new Date().toISOString(), lastUpdatedBy: "" },
        etag: null,
      },
      200,
    );
  }

  const manifest = await object.json();
  return c.json(
    { manifest, etag: object.httpEtag },
    200,
    { ETag: object.httpEtag },
  );
});

manifestRoutes.put("/", async (c) => {
  const ifMatch = c.req.header("If-Match");

  // For the first manifest write, If-Match is not required
  // For subsequent writes, it must be present
  const existingObject = await c.env.BUCKET.head(MANIFEST_KEY);

  if (existingObject && !ifMatch) {
    return c.json({ error: "If-Match header required for manifest updates" }, 428);
  }

  const body = await c.req.text();

  try {
    const putOptions: R2PutOptions = {};
    if (ifMatch) {
      putOptions.onlyIf = { etagMatches: ifMatch.replace(/"/g, "") };
    }

    const result = await c.env.BUCKET.put(MANIFEST_KEY, body, {
      ...putOptions,
      httpMetadata: { contentType: "application/json" },
    });

    if (result === null) {
      // R2 returns null when onlyIf condition fails
      return c.json({ error: "Manifest has been modified by another device" }, 412);
    }

    return c.json(
      { ok: true, etag: result.httpEtag },
      200,
      { ETag: result.httpEtag },
    );
  } catch (err) {
    return c.json({ error: "Failed to update manifest" }, 500);
  }
});
