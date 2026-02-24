import type {
  HealthResponse,
  ManifestResponse,
  PresignedUrlResponse,
  SyncManifest,
} from "@obsidian-r2-sync/shared";
import { API_ROUTES } from "@obsidian-r2-sync/shared";
import { requestUrl } from "obsidian";

/**
 * HTTP client for the R2 Sync Worker API.
 * Uses Obsidian's requestUrl for mobile compatibility.
 */
export class ApiClient {
  constructor(
    private endpoint: string,
    private token: string,
  ) {}

  updateConfig(endpoint: string, token: string): void {
    this.endpoint = endpoint;
    this.token = token;
  }

  async health(): Promise<HealthResponse> {
    const res = await this.request("GET", API_ROUTES.HEALTH, { skipAuth: true });
    return res.json;
  }

  async getManifest(): Promise<ManifestResponse> {
    const res = await this.request("GET", API_ROUTES.MANIFEST);
    return {
      manifest: res.json.manifest,
      etag: res.json.etag ?? res.headers?.["etag"] ?? null,
    };
  }

  async putManifest(manifest: SyncManifest, etag: string | null): Promise<{ etag: string }> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (etag) {
      headers["If-Match"] = etag;
    }
    const res = await this.request("PUT", API_ROUTES.MANIFEST, {
      body: JSON.stringify(manifest),
      headers,
    });
    return {
      etag: res.json.etag ?? res.headers?.["etag"] ?? "",
    };
  }

  async getUploadUrl(path: string, hash: string): Promise<PresignedUrlResponse> {
    const res = await this.request("POST", API_ROUTES.UPLOAD_URL, {
      body: JSON.stringify({ path, hash }),
    });
    return res.json;
  }

  async getDownloadUrl(path: string): Promise<PresignedUrlResponse> {
    const res = await this.request("POST", API_ROUTES.DOWNLOAD_URL, {
      body: JSON.stringify({ path }),
    });
    return res.json;
  }

  async deleteFiles(paths: string[]): Promise<void> {
    await this.request("POST", API_ROUTES.DELETE_FILES, {
      body: JSON.stringify({ paths }),
    });
  }

  private async request(
    method: string,
    path: string,
    options: {
      body?: string;
      headers?: Record<string, string>;
      skipAuth?: boolean;
    } = {},
  ) {
    const url = `${this.endpoint}${path}`;
    const headers: Record<string, string> = {
      ...options.headers,
    };

    if (!options.skipAuth) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    if (options.body && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    const response = await requestUrl({
      url,
      method,
      headers,
      body: options.body,
      throw: false,
    });

    if (response.status >= 400) {
      const errorBody = response.json?.error ?? response.text ?? "Unknown error";
      if (response.status === 412) {
        throw new ManifestConflictError(errorBody);
      }
      throw new ApiError(response.status, errorBody);
    }

    return response;
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(`API error ${status}: ${message}`);
    this.name = "ApiError";
  }
}

export class ManifestConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManifestConflictError";
  }
}
