export type JobEvent =
  | { type: 'started' | 'queued' | 'done' | 'failed'; name: string }
  | { type: 'cancelled'; name: string }
  | { type: 'progress'; name: string; fraction: number };

export interface JobContext {
  readonly signal: { readonly cancelled: boolean };
  report: (fraction: number) => void;
  onKill: (fn: () => void) => void;
}

export interface EnqueueOpts {
  onProgress?: (fraction: number) => void;
}

export class JobQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private pending = 0;
  private cancelled = false;
  private cancelState = { cancelled: false };
  private killer: (() => void) | null = null;
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

  enqueue<T>(name: string, job: (ctx: JobContext) => Promise<T>, opts?: EnqueueOpts): Promise<T> {
    if (this.cancelled) return Promise.reject(new Error('cancelled'));
    if (this.pending > 0) this.emit({ type: 'queued', name });
    this.pending += 1;
    const run = this.tail.then(async () => {
      if (this.cancelled) {
        this.pending -= 1;
        this.emit({ type: 'cancelled', name });
        throw new Error('cancelled');
      }
      this.emit({ type: 'started', name });
      const ctx: JobContext = {
        signal: this.cancelState,
        report: (fraction: number) => {
          opts?.onProgress?.(fraction);
          this.emit({ type: 'progress', name, fraction });
        },
        onKill: (fn: () => void) => {
          this.killer = fn;
        },
      };
      try {
        const result = await job(ctx);
        if (this.cancelState.cancelled) {
          this.emit({ type: 'cancelled', name });
          throw new Error('cancelled');
        }
        this.emit({ type: 'done', name });
        return result;
      } catch (err) {
        if (this.cancelState.cancelled) {
          this.emit({ type: 'cancelled', name });
          throw new Error('cancelled');
        }
        this.emit({ type: 'failed', name });
        throw err;
      } finally {
        this.pending -= 1;
        this.killer = null;
      }
    });
    this.tail = run.catch(() => undefined);
    return run;
  }

  cancelAll(): void {
    this.emit({ type: 'cancelled', name: 'all' });
    if (this.pending === 0) return;
    this.cancelled = true;
    this.cancelState.cancelled = true;
    try {
      this.killer?.();
    } catch {
      /* killer must not break cancel */
    }
  }

  reset(): void {
    if (this.pending > 0) throw new Error('reset while jobs running');
    this.cancelled = false;
    this.cancelState.cancelled = false;
  }
}
