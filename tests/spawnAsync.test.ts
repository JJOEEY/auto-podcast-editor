import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { spawnAsync } from '../electron/spawnAsync.js';

class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  kill = vi.fn(() => true);
}

const fakeSpawn = (child: FakeChild) => () => child as unknown as ChildProcess;

describe('spawnAsync', () => {
  it('streams complete lines to onLine', async () => {
    const child = new FakeChild();
    const lines: string[] = [];
    const { done } = spawnAsync('x', [], { onLine: (l) => lines.push(l), spawnFn: fakeSpawn(child) });
    child.stdout.emit('data', 'progress = 10%\nprogress = 20%\n');
    child.emit('close', 0);
    expect(await done).toBe(0);
    expect(lines).toEqual(['progress = 10%', 'progress = 20%']);
  });

  it('buffers partial lines and flushes remainder on close', async () => {
    const child = new FakeChild();
    const lines: string[] = [];
    const { done } = spawnAsync('x', [], { onLine: (l) => lines.push(l), spawnFn: fakeSpawn(child) });
    child.stderr.emit('data', 'half');
    child.stderr.emit('data', ' line\n');
    child.emit('close', 0);
    await done;
    expect(lines).toEqual(['half line']);
  });

  it('rejects on error and exposes kill', async () => {
    const child = new FakeChild();
    const { done, kill } = spawnAsync('x', [], { spawnFn: fakeSpawn(child) });
    kill();
    expect(child.kill).toHaveBeenCalled();
    child.emit('error', new Error('ENOENT'));
    await expect(done).rejects.toThrow('ENOENT');
  });
});
