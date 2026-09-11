import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chooseCollisionFreeStem } from '../electron/outputPaths.js';

describe('export output paths', () => {
  it('adds a suffix instead of overwriting an existing media file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ape-output-'));
    writeFileSync(join(dir, 'episode.mp4'), 'old');
    writeFileSync(join(dir, 'episode_1.mp4'), 'old');
    await expect(chooseCollisionFreeStem(dir, 'episode', '.mp4')).resolves.toBe('episode_2');
  });
});
