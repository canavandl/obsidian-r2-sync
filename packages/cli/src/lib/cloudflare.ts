import Cloudflare from "cloudflare";
import { createHash } from "node:crypto";
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
    // Use a single page request instead of the auto-paginating iterator,
    // which has a bug where it infinitely re-fetches the same page.
    const page = await this.client.accounts.list();
    const result: Array<{ id: string; name: string }> = [];
    for (const account of page.result) {
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
   * Create an R2-scoped API token and derive S3 credentials from it.
   *
   * Uses the account-level token API (POST /accounts/{id}/tokens) instead of
   * the user-level API, so it only requires normal account permissions — no
   * special "User API Tokens: Edit" permission needed.
   *
   * The Cloudflare API token's `id` becomes the Access Key ID,
   * and `SHA-256(token value)` becomes the Secret Access Key.
   */
  async createR2Token(bucketName: string): Promise<{
    accessKeyId: string;
    secretAccessKey: string;
    tokenId: string;
  }> {
    // Step 1: Find the R2 permission group IDs via the account-level endpoint.
    // Use .result directly to avoid the SDK's auto-paginating iterator bug.
    const permissionGroupsPage = await this.client.accounts.tokens.permissionGroups.list({
      account_id: this.accountId,
    });
    const permissionGroups = [...permissionGroupsPage.result];

    // Look for R2 object read/write permissions (scoped to r2.bucket)
    const r2WriteGroup = permissionGroups.find(
      (g) => g.name?.includes("Workers R2 Storage Bucket Item Write"),
    );

    const r2ReadGroup = permissionGroups.find(
      (g) => g.name?.includes("Workers R2 Storage Bucket Item Read") &&
             !g.name?.includes("Write"),
    );

    if (!r2WriteGroup?.id) {
      throw new Error(
        "Could not find R2 write permission group. " +
        "Available groups: " +
        permissionGroups
          .filter((g) => g.name?.includes("R2"))
          .map((g) => g.name)
          .join(", "),
      );
    }

    // Step 2: Create the token with R2 bucket-scoped permissions
    const policyPermissions: Array<{ id: string }> = [{ id: r2WriteGroup.id }];
    if (r2ReadGroup?.id && r2ReadGroup.id !== r2WriteGroup.id) {
      policyPermissions.push({ id: r2ReadGroup.id });
    }

    const token = await this.client.accounts.tokens.create({
      account_id: this.accountId,
      name: `obsidian-r2-sync-${bucketName}`,
      policies: [
        {
          effect: "allow",
          permission_groups: policyPermissions,
          resources: {
            [`com.cloudflare.edge.r2.bucket.${this.accountId}_default_${bucketName}`]: "*",
          },
        },
      ],
    });

    const tokenValue = (token as unknown as { value: string }).value;
    const tokenId = token.id as string;

    // Step 3: Derive S3 credentials
    // Access Key ID = token ID
    // Secret Access Key = SHA-256(token value)
    const secretAccessKey = createHash("sha256").update(tokenValue).digest("hex");

    return {
      accessKeyId: tokenId,
      secretAccessKey,
      tokenId,
    };
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
      cfAccountId?: string;
      cfAccessKeyId?: string;
      cfSecretAccessKey?: string;
    },
  ): Promise<{ url: string }> {
    // Build the bindings list
    // Using `as never` to work around the SDK's strict union types for bindings
    const workerBindings = [
      {
        type: "r2_bucket" as const,
        name: "BUCKET",
        bucket_name: bindings.r2BucketName,
      },
      {
        type: "secret_text" as const,
        name: "AUTH_SECRET",
        text: bindings.authSecret,
      },
      {
        type: "plain_text" as const,
        name: "BUCKET_NAME",
        text: bindings.r2BucketName,
      },
      ...(bindings.cfAccountId
        ? [{ type: "secret_text" as const, name: "CF_ACCOUNT_ID", text: bindings.cfAccountId }]
        : []),
      ...(bindings.cfAccessKeyId
        ? [{ type: "secret_text" as const, name: "CF_ACCESS_KEY_ID", text: bindings.cfAccessKeyId }]
        : []),
      ...(bindings.cfSecretAccessKey
        ? [{ type: "secret_text" as const, name: "CF_SECRET_ACCESS_KEY", text: bindings.cfSecretAccessKey }]
        : []),
    ];

    // Upload the worker script as an ES module
    await this.client.workers.scripts.update(workerName, {
      account_id: this.accountId,
      metadata: {
        main_module: "index.js",
        compatibility_date: "2025-02-01",
        bindings: workerBindings as never,
      },
      files: {
        "index.js": new File([scriptContent], "index.js", {
          type: "application/javascript+module",
        }),
      },
    });

    // Enable the workers.dev route
    await this.client.workers.scripts.subdomain.create(workerName, {
      account_id: this.accountId,
      enabled: true,
    });

    // Get the account's workers.dev subdomain to build the URL
    const subdomainInfo = await this.client.workers.accountSettings.get({
      account_id: this.accountId,
    });
    const accountSubdomain = (subdomainInfo as unknown as { subdomain: string }).subdomain;
    return { url: `https://${workerName}.${accountSubdomain}.workers.dev` };
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
