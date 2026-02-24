import { MAX_CONCURRENT_TRANSFERS, MAX_RETRIES, RETRY_BACKOFF_MS } from "@obsidian-r2-sync/shared";

interface QueueTask<T> {
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  retries: number;
}

/**
 * Concurrent task queue with retry logic for file transfers.
 */
export class TransferQueue {
  private queue: QueueTask<unknown>[] = [];
  private active = 0;
  private concurrency: number;

  constructor(concurrency = MAX_CONCURRENT_TRANSFERS) {
    this.concurrency = concurrency;
  }

  /**
   * Add a task to the queue.
   */
  enqueue<T>(execute: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        execute: execute as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
        retries: 0,
      });
      this.processNext();
    });
  }

  /**
   * Process the next task in the queue.
   */
  private processNext(): void {
    if (this.active >= this.concurrency || this.queue.length === 0) return;

    const task = this.queue.shift()!;
    this.active++;

    task
      .execute()
      .then((result) => {
        task.resolve(result);
      })
      .catch((error) => {
        if (task.retries < MAX_RETRIES) {
          task.retries++;
          const delay = RETRY_BACKOFF_MS * Math.pow(2, task.retries - 1);
          setTimeout(() => {
            this.queue.unshift(task);
            this.processNext();
          }, delay);
        } else {
          task.reject(error instanceof Error ? error : new Error(String(error)));
        }
      })
      .finally(() => {
        this.active--;
        this.processNext();
      });
  }

  /** Number of tasks currently active */
  get activeCount(): number {
    return this.active;
  }

  /** Number of tasks waiting in queue */
  get pendingCount(): number {
    return this.queue.length;
  }
}
