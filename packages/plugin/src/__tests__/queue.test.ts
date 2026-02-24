import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TransferQueue } from "../sync/queue.js";

describe("TransferQueue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("executes a single task", async () => {
    const queue = new TransferQueue(2);
    const result = await queue.enqueue(() => Promise.resolve(42));
    expect(result).toBe(42);
  });

  it("respects concurrency limit", async () => {
    const queue = new TransferQueue(2);
    let running = 0;
    let maxRunning = 0;

    const makeTask = () =>
      queue.enqueue(async () => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await new Promise((r) => {
          setTimeout(r, 10);
        });
        await vi.advanceTimersByTimeAsync(10);
        running--;
        return running;
      });

    const promises = [makeTask(), makeTask(), makeTask(), makeTask()];
    await vi.advanceTimersByTimeAsync(100);
    await Promise.all(promises);

    expect(maxRunning).toBeLessThanOrEqual(2);
  });

  it("executes tasks in FIFO order", async () => {
    const queue = new TransferQueue(1);
    const order: number[] = [];

    const p1 = queue.enqueue(async () => {
      order.push(1);
    });
    const p2 = queue.enqueue(async () => {
      order.push(2);
    });
    const p3 = queue.enqueue(async () => {
      order.push(3);
    });

    await Promise.all([p1, p2, p3]);
    expect(order).toEqual([1, 2, 3]);
  });

  it("retries on failure up to MAX_RETRIES", async () => {
    const queue = new TransferQueue(1);
    let attempts = 0;

    const promise = queue.enqueue(async () => {
      attempts++;
      if (attempts < 4) throw new Error("fail");
      return "ok";
    });

    // Advance through retry backoff delays: 1000ms, 2000ms, 4000ms
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(4000);

    const result = await promise;
    expect(result).toBe("ok");
    expect(attempts).toBe(4); // 1 initial + 3 retries
  });

  it("rejects after retries are exhausted", async () => {
    const queue = new TransferQueue(1);

    const promise = queue.enqueue(async () => {
      throw new Error("always fails");
    });

    // Catch immediately to prevent unhandled rejection warnings
    const resultPromise = promise.catch((e: Error) => e);

    // Advance through all retry backoff delays
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(4000);

    const error = await resultPromise;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("always fails");
  });

  it("uses exponential backoff delays", async () => {
    const queue = new TransferQueue(1);
    const timeouts: number[] = [];

    // Spy on setTimeout before enqueuing
    const origSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, "setTimeout").mockImplementation((fn: any, delay?: number) => {
      if (delay && delay >= 1000) {
        timeouts.push(delay);
      }
      return origSetTimeout(fn, delay);
    });

    const promise = queue.enqueue(async () => {
      throw new Error("fail");
    });

    // Catch immediately to prevent unhandled rejection warnings
    const resultPromise = promise.catch((e: Error) => e);

    // Advance through all retries
    await vi.advanceTimersByTimeAsync(10000);

    const error = await resultPromise;
    expect(error).toBeInstanceOf(Error);

    // Backoff delays should be: 1000 * 2^0 = 1000, 1000 * 2^1 = 2000, 1000 * 2^2 = 4000
    expect(timeouts).toEqual([1000, 2000, 4000]);

    vi.restoreAllMocks();
  });

  it("reports accurate activeCount and pendingCount", async () => {
    vi.useRealTimers(); // This test doesn't need fake timers

    const queue = new TransferQueue(1);

    expect(queue.activeCount).toBe(0);
    expect(queue.pendingCount).toBe(0);

    let resolveTask!: () => void;
    const blockingPromise = new Promise<void>((r) => {
      resolveTask = r;
    });

    const p1 = queue.enqueue(() => blockingPromise);
    const p2 = queue.enqueue(() => Promise.resolve());

    // p1 is active, p2 is pending (synchronous check, before any microtask runs)
    expect(queue.activeCount).toBe(1);
    expect(queue.pendingCount).toBe(1);

    resolveTask();
    await p1;
    // Allow the .finally() microtask and subsequent p2 processing to complete
    await p2;
    // Yield one more microtask tick for .finally() on p2
    await new Promise((r) => setTimeout(r, 0));

    expect(queue.activeCount).toBe(0);
    expect(queue.pendingCount).toBe(0);
  });

  it("wraps non-Error throws in Error", async () => {
    const queue = new TransferQueue(1);

    const promise = queue.enqueue(async () => {
      throw "string error"; // eslint-disable-line no-throw-literal
    });

    // Catch immediately to prevent unhandled rejection warnings
    const resultPromise = promise.catch((e: unknown) => e);

    // Advance through all retries
    await vi.advanceTimersByTimeAsync(10000);

    const error = await resultPromise;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("string error");
  });
});
