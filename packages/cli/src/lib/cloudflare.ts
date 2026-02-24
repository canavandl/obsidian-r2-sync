import Cloudflare from "cloudflare";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Read the pre-built Worker bundle.
 * Expects the worker package to have been built first (`pnpm --filter @obsidian-r2-sync/worker build`).
 */
export function readWorkerBundle(bundlePath?: string): string {
  const path = bundlePath ?? resolve(__dirname, "../../../worker/dist/index.js");
  try {
    return readFileSync(path, "utf-8");
  } catch {
    throw new Error(
      `Worker bundle not found at ${path}. Run "pnpm --filter @obsidian-r2-sync/worker build" first.`,
    );
  }
}

export interface ProvisioningConfig {
  apiToken: string;
  accountId: string;
  bucketName: string;
  workerName: string;
}

/**
 * Wrapper around the Cloudflare SDK for infrastructure provisioning.
 */
export class CloudflareClient {
  private client: Cloudflare;
  private accountId: string;

  constructor(apiToken: string, accountId: string) {
    this.client = new Cloudflare({ apiToken });
    this.accountId = accountId;
  }

  /**
   * List available accounts to auto-detect account ID.
   */
  async listAccounts(): Promise<Array<{ id: string; name: string }>> {
    const accounts = await this.client.accounts.list();
    const result: Array<{ id: string; name: string }> = [];
    for await (const account of accounts) {
      result.push({ id: account.id, name: account.name });
    }
    return result;
  }

  /**
   * Create an R2 bucket (idempotent — returns existing if it already exists).
   */
  async ensureBucket(bucketName: string): Promise<{ name: string; created: boolean }> {
    try {
      // Check if bucket already exists
      const buckets = await this.client.r2.buckets.list({ account_id: this.accountId });
      const existing = buckets.buckets?.find((b) => b.name === bucketName);
      if (existing) {
        return { name: bucketName, created: false };
      }
    } catch {
      // List failed, try creating
    }

    await this.client.r2.buckets.create({
      account_id: this.accountId,
      name: bucketName,
    });
    return { name: bucketName, created: true };
  }

  /**
   * Delete an R2 bucket.
   */
  async deleteBucket(bucketName: string): Promise<void> {
    await this.client.r2.buckets.delete(bucketName, {
      account_id: this.accountId,
    });
  }

  /**
   * Deploy a Worker script.
   * For MVP, we upload a pre-built worker bundle.
   */
  async deployWorker(
    workerName: string,
    scriptContent: string,
    bindings: {
      r2BucketName: string;
      authSecret: string;
    },
  ): Promise<{ url: string }> {
    // Upload the worker script
    // The Cloudflare SDK handles the multipart form upload
    await this.client.workers.scripts.update(workerName, {
      account_id: this.accountId,
      metadata: {
        main_module: "index.js",
        bindings: [
          {
            type: "r2_bucket",
            name: "BUCKET",
            bucket_name: bindings.r2BucketName,
          },
          {
            type: "secret_text",
            name: "AUTH_SECRET",
            text: bindings.authSecret,
          },
        ],
      },
      files: {
        "index.js": new File([scriptContent], "index.js", { type: "application/javascript" }),
      },
    });

    // Enable the workers.dev route
    const subdomain = `${workerName}.${this.accountId.slice(0, 8)}.workers.dev`;
    return { url: `https://${subdomain}` };
  }

  /**
   * Delete a Worker.
   */
  async deleteWorker(workerName: string): Promise<void> {
    await this.client.workers.scripts.delete(workerName, {
      account_id: this.accountId,
    });
  }

  /**
   * Generate an HMAC-based auth token for a device.
   */
  static async generateToken(authSecret: string, deviceId: string): Promise<string> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(authSecret),
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
}
