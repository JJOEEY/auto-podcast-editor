import { spawn, type ChildProcess } from 'node:child_process';

export interface AsyncSpawnOpts {
  onLine?: (line: string) => void;
  spawnFn?: (cmd: string, args: string[]) => ChildProcess;
}

export interface AsyncSpawn {
  done: Promise<number>;
  kill: () => void;
}

export function spawnAsync(cmd: string, args: string[], opts: AsyncSpawnOpts = {}): AsyncSpawn {
  const child = (opts.spawnFn ?? spawn)(cmd, args);
  let buffer = '';
  const feed = (chunk: unknown) => {
    buffer += String(chunk);
    const parts = buffer.split(/\r?\n/);
    buffer = parts.pop() ?? '';
    for (const line of parts) opts.onLine?.(line);
  };
  child.stdout?.on('data', feed);
  child.stderr?.on('data', feed);
  const done = new Promise<number>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code: number | null) => {
      if (buffer) opts.onLine?.(buffer);
      buffer = '';
      resolve(code ?? -1);
    });
  });
  return {
    done,
    kill: () => {
      child.kill();
    },
  };
}
