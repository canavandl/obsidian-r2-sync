/**
 * In-memory mock of Cloudflare R2Bucket for testing.
 * Supports get, put, head, and delete with ETag tracking.
 */

interface StoredObject {
  body: string;
  etag: string;
  httpEtag: string;
  httpMetadata?: Record<string, string>;
}

let etagCounter = 0;

function generateEtag(): string {
  etagCounter++;
  return `etag-${etagCounter}-${Date.now()}`;
}

export class MockR2Bucket {
  private store = new Map<string, StoredObject>();

  async get(key: string): Promise<MockR2Object | null> {
    const stored = this.store.get(key);
    if (!stored) return null;
    return new MockR2Object(stored);
  }

  async put(
    key: string,
    value: string | ReadableStream | ArrayBuffer | null,
    options?: {
      onlyIf?: { etagMatches?: string };
      httpMetadata?: Record<string, string>;
    },
  ): Promise<MockR2Object | null> {
    // Handle conditional put (onlyIf etagMatches)
    if (options?.onlyIf?.etagMatches) {
      const existing = this.store.get(key);
      if (!existing || existing.etag !== options.onlyIf.etagMatches) {
        return null; // Condition not met
      }
    }

    const body = typeof value === "string" ? value : "";
    const etag = generateEtag();
    const stored: StoredObject = {
      body,
      etag,
      httpEtag: `"${etag}"`,
      httpMetadata: options?.httpMetadata,
    };
    this.store.set(key, stored);
    return new MockR2Object(stored);
  }

  async head(key: string): Promise<MockR2ObjectHead | null> {
    const stored = this.store.get(key);
    if (!stored) return null;
    return new MockR2ObjectHead(stored);
  }

  async delete(keys: string | string[]): Promise<void> {
    const keyArray = Array.isArray(keys) ? keys : [keys];
    for (const key of keyArray) {
      this.store.delete(key);
    }
  }

  /** Reset the store (for test isolation) */
  clear(): void {
    this.store.clear();
  }
}

class MockR2Object {
  readonly etag: string;
  readonly httpEtag: string;
  private body: string;

  constructor(stored: StoredObject) {
    this.etag = stored.etag;
    this.httpEtag = stored.httpEtag;
    this.body = stored.body;
  }

  async json<T = unknown>(): Promise<T> {
    return JSON.parse(this.body) as T;
  }

  async text(): Promise<string> {
    return this.body;
  }
}

class MockR2ObjectHead {
  readonly etag: string;
  readonly httpEtag: string;

  constructor(stored: StoredObject) {
    this.etag = stored.etag;
    this.httpEtag = stored.httpEtag;
  }
}
