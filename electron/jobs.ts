export type JobEvent = { type: 'started' | 'queued' | 'done' | 'failed' | 'cancelled'; name: string };

export class JobQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private pending = 0;
  private cancelled = false;
  private listeners: Array<(e: JobEvent) => void> = [];

  onEvent(fn: (e: JobEvent) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  private emit(e: JobEvent): void {
    for (const fn of [...this.listeners]) {
      try {
        fn(e);
      } catch {
        /* listener errors must not break job flow */
      }
    }
  }

  enqueue<T>(name: string, job: () => Promise<T>): Promise<T> {
    if (this.cancelled) return Promise.reject(new Error('cancelled'));
    // Captured at enqueue: the head job counts as current work and is allowed
    // to finish after cancelAll(); only jobs that waited behind it are stopped.
    // (Must be captured here — the chained callback runs on a later microtask,
    // so by the time it runs a synchronous cancelAll() has already set the flag.)
    const wasQueued = this.pending > 0;
    if (wasQueued) this.emit({ type: 'queued', name });
    this.pending += 1;
    const run = this.tail.then(async () => {
      if (this.cancelled && wasQueued) {
        this.pending -= 1;
        this.emit({ type: 'cancelled', name });
        throw new Error('cancelled');
      }
      this.emit({ type: 'started', name });
      try {
        const result = await job();
        this.emit({ type: 'done', name });
        return result;
      } catch (err) {
        this.emit({ type: 'failed', name });
        throw err;
      } finally {
        this.pending -= 1;
      }
    });
    this.tail = run.catch(() => undefined);
    return run;
  }

  cancelAll(): void {
    this.cancelled = true;
    this.emit({ type: 'cancelled', name: 'all' });
  }

  reset(): void {
    if (this.pending > 0) throw new Error('reset while jobs running');
    this.cancelled = false;
  }
}
