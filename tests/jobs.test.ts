import { describe, expect, it } from 'vitest';
import { JobQueue } from '../electron/jobs.js';

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('JobQueue', () => {
  it('runs only one heavy job at a time, in order', async () => {
    const order: string[] = [];
    const q = new JobQueue();
    const a = q.enqueue('transcribe', async () => { order.push('a-start'); await tick(); order.push('a-end'); });
    const b = q.enqueue('render', async () => { order.push('b-start'); await tick(); order.push('b-end'); });
    await Promise.all([a, b]);
    expect(order).toEqual(['a-start', 'a-end', 'b-start', 'b-end']);
  });

  it('reports queue position for waiting jobs', async () => {
    const q = new JobQueue();
    q.enqueue('transcribe', async () => { await tick(); });
    const events: string[] = [];
    q.onEvent((e) => events.push(`${e.type}:${e.name}`));
    q.enqueue('render', async () => { await tick(); });
    expect(events).toContain('queued:render');
  });

  it('cancel aborts running and queued jobs', async () => {
    const q = new JobQueue();
    const slow = q.enqueue('transcribe', async () => { await new Promise((r) => setTimeout(r, 30)); return 'slow'; });
    const p2 = q.enqueue('render', async () => 'never');
    q.cancelAll();
    await expect(slow).rejects.toThrow('cancelled');
    await expect(p2).rejects.toThrow('cancelled');
  });
});

describe('JobQueue lifecycle', () => {
  it('accepts new jobs after reset following a cancel', async () => {
    const q = new JobQueue();
    const ran: string[] = [];
    const slow = q.enqueue('transcribe', async () => { await new Promise((r) => setTimeout(r, 20)); ran.push('slow'); return 'slow'; });
    const dropped = q.enqueue('render', async () => { ran.push('never'); return 'never'; });
    q.cancelAll();
    await expect(dropped).rejects.toThrow('cancelled');
    await expect(slow).rejects.toThrow('cancelled');
    q.reset();
    await q.enqueue('render2', async () => { ran.push('render2'); });
    expect(ran).toContain('render2');
  });

  it('isolates throwing listeners and supports unsubscribe', async () => {
    const q = new JobQueue();
    const seen: string[] = [];
    q.onEvent(() => { throw new Error('boom'); });
    const off = q.onEvent((e) => { seen.push(`${e.type}:${e.name}`); });
    off();
    const seen2: string[] = [];
    q.onEvent((e) => { seen2.push(`${e.type}:${e.name}`); });
    await q.enqueue('job', async () => 'ok');
    expect(seen).toEqual([]);
    expect(seen2).toContain('done:job');
  });

  it('emits cancelled per dropped job', async () => {
    const q = new JobQueue();
    const events: string[] = [];
    q.onEvent((e) => { events.push(`${e.type}:${e.name}`); });
    const slow = q.enqueue('transcribe', async () => { await new Promise((r) => setTimeout(r, 20)); });
    const dropped = q.enqueue('render', async () => undefined);
    q.cancelAll();
    await expect(dropped).rejects.toThrow('cancelled');
    await expect(slow).rejects.toThrow('cancelled');
    expect(events).toContain('cancelled:render');
  });
});

describe('JobQueue progress + kill', () => {
  it('forwards progress reports as events', async () => {
    const q = new JobQueue();
    const seen: string[] = [];
    q.onEvent((e) => {
      if (e.type === 'progress') seen.push(`${e.name}:${e.fraction}`);
    });
    await q.enqueue('job', async (ctx) => {
      ctx.report(0.5);
    });
    expect(seen).toEqual(['job:0.5']);
  });

  it('zero-arg jobs still work (backward compat)', async () => {
    const q = new JobQueue();
    expect(await q.enqueue('job', async () => 42)).toBe(42);
  });

  it('cancelAll kills the running child and rejects queued', async () => {
    const q = new JobQueue();
    const killed: string[] = [];
    const slow = q.enqueue('slow', async (ctx) => {
      ctx.onKill(() => killed.push('slow'));
      await new Promise((r) => setTimeout(r, 30));
      return 'done';
    });
    const queued = q.enqueue('next', async () => 'never');
    // let the head job start so onKill registers before cancel
    await new Promise((r) => setTimeout(r, 5));
    q.cancelAll();
    await expect(queued).rejects.toThrow('cancelled');
    await expect(slow).rejects.toThrow('cancelled');
    expect(killed).toEqual(['slow']);
  });

  it('cancel on idle queue does not brick future jobs', async () => {
    const q = new JobQueue();
    q.cancelAll();
    expect(await q.enqueue('job', async () => 'ok')).toBe('ok');
  });
});
