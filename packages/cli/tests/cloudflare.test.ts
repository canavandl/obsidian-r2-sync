import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CloudflareClient } from "../src/lib/cloudflare.js";

const { transport } = vi.hoisted(() => ({ transport: vi.fn() }));

// Use the real SDK request routing and error handling with a mocked transport.
vi.mock("cloudflare", async (importOriginal) => {
  const { default: Cloudflare } = await importOriginal<typeof import("cloudflare")>();
  return {
    default: class extends Cloudflare {
      constructor(options: ConstructorParameters<typeof Cloudflare>[0]) {
        super({ ...options, fetch: transport, maxRetries: 0 });
      }
    },
  };
});

function response(result: unknown) {
  return new Response(JSON.stringify({ success: true, result }), {
    headers: { "Content-Type": "application/json" },
  });
}

function prepareDeployment(subdomainResponse: Response) {
  transport
    .mockResolvedValueOnce(response({})) // Upload the Worker.
    .mockResolvedValueOnce(response({})) // Enable its workers.dev route.
    .mockResolvedValueOnce(subdomainResponse);
  const client = new CloudflareClient("test-api-token", "test-account");
  return client.deployWorker("test-worker", "export default {}", {
    r2BucketName: "test-bucket",
    authSecret: "test-auth-secret",
  });
}

describe("Worker deployment endpoint", () => {
  beforeEach(() => {
    transport.mockReset();
    vi.stubGlobal("fetch", vi.fn(() => {
      throw new Error("Unexpected raw fetch: deployment must use the SDK");
    }));
  });

  afterEach(() => vi.unstubAllGlobals());

  it("uses the account subdomain endpoint to return the deployed Worker URL", async () => {
    await expect(prepareDeployment(response({ subdomain: "my-account" }))).resolves.toEqual({
      url: "https://test-worker.my-account.workers.dev",
    });
    expect(transport).toHaveBeenCalledTimes(3);
    expect(transport).toHaveBeenLastCalledWith(
      "https://api.cloudflare.com/client/v4/accounts/test-account/workers/subdomain",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ authorization: "Bearer test-api-token" }),
      }),
    );
  });

  it("propagates a failed subdomain lookup instead of returning a Worker URL", async () => {
    const denied = new Response(JSON.stringify({
      success: false,
      errors: [{ code: 10000, message: "Authentication error" }],
    }), { status: 403, headers: { "Content-Type": "application/json" } });
    await expect(prepareDeployment(denied)).rejects.toMatchObject({ status: 403 });
  });

  it.each([{}, { subdomain: "" }, { subdomain: " \t\n" }])(
    "rejects a missing or blank subdomain: %j",
    async (result) => {
      await expect(prepareDeployment(response(result))).rejects.toThrow(
        "Cloudflare did not return a workers.dev subdomain",
      );
    },
  );
});
