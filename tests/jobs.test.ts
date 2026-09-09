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
