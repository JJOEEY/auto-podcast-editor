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

  it('cancel keeps finished work and stops the rest', async () => {
    const q = new JobQueue();
    const ran: string[] = [];
    const slow = q.enqueue('transcribe', async () => { await new Promise((r) => setTimeout(r, 30)); ran.push('slow'); });
    const p2 = q.enqueue('render', async () => { ran.push('never'); });
    q.cancelAll();
    await expect(p2).rejects.toThrow('cancelled');
    await slow;
    expect(ran).toEqual(['slow']);
  });
});

describe('JobQueue lifecycle', () => {
  it('accepts new jobs after reset following a cancel', async () => {
    const q = new JobQueue();
    const ran: string[] = [];
    const slow = q.enqueue('transcribe', async () => { await new Promise((r) => setTimeout(r, 20)); ran.push('slow'); });
    const dropped = q.enqueue('render', async () => { ran.push('never'); });
    q.cancelAll();
    await expect(dropped).rejects.toThrow('cancelled');
    await slow;
    q.reset();
    await q.enqueue('render2', async () => { ran.push('render2'); });
    expect(ran).toEqual(['slow', 'render2']);
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
    await slow;
    expect(events).toContain('cancelled:render');
  });
});
