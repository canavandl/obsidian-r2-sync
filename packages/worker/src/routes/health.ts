import { Hono } from "hono";
import { PACKAGE_VERSION } from "@obsidian-r2-sync/shared";
import type { Env } from "../index.js";

export const healthRoutes = new Hono<Env>();

healthRoutes.get("/", (c) => {
  return c.json({
    ok: true,
    version: PACKAGE_VERSION,
    timestamp: new Date().toISOString(),
  });
});
