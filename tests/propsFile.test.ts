import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildRenderProps, writePropsFile } from '../core/propsFile.js';

describe('buildRenderProps', () => {
  it('picks source, clips, captions and deep-copies', () => {
    const clips = [{ id: 'k1', track: 'V1' as const, start: 0, end: 5, label: 'k' }];
    const caps = [{ id: 'c1', start: 0, end: 1, text: 'hi' }];
    const props = buildRenderProps('s.mp4', clips, caps);
    expect(props.sourcePath).toBe('s.mp4');
    clips[0].end = 99;
    expect(props.clips[0].end).toBe(5);
  });

  it('round-trips through writePropsFile', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ape-props-'));
    const file = join(dir, 'props.json');
    const props = buildRenderProps('s.mp4', [], []);
    await writePropsFile(file, props);
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(props);
  });
});
