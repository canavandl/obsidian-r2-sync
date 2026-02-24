import { Hono } from "hono";
import { cors } from "hono/cors";
import { authMiddleware } from "./middleware/auth.js";
import { healthRoutes } from "./routes/health.js";
import { manifestRoutes } from "./routes/manifest.js";
import { fileRoutes } from "./routes/files.js";

export type Env = {
  Bindings: {
    BUCKET: R2Bucket;
    AUTH_SECRET: string;
    CF_ACCOUNT_ID: string;
    CF_ACCESS_KEY_ID: string;
    CF_SECRET_ACCESS_KEY: string;
    BUCKET_NAME: string;
  };
  Variables: {
    deviceId: string;
  };
};

const app = new Hono<Env>();

// CORS for plugin requests
app.use("*", cors());

// Health check is public
app.route("/health", healthRoutes);

// All other routes require auth
app.use("*", authMiddleware);
app.route("/manifest", manifestRoutes);
app.route("/files", fileRoutes);

export default app;
