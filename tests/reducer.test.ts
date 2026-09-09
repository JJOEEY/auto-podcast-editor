import { describe, expect, it } from 'vitest';
import { createState, reduce } from '../src/state/reducer.js';
import { DEFAULT_SETTINGS } from '../core/defaults.js';

describe('reducer undo', () => {
  it('applies a cut and undoes the whole auto batch at once', () => {
    let s = createState({ name: 'ep1', sourcePath: 'x.mp4', durationSec: 100, preset: 'vertical', settings: DEFAULT_SETTINGS });
    s = reduce(s, {
      type: 'apply-auto-cuts',
      clips: [
        { id: 'k1', track: 'V1', start: 0, end: 10, label: 'keep 1' },
        { id: 'k2', track: 'V1', start: 20, end: 100, label: 'keep 2' },
      ],
    });
    expect(s.present.clips).toHaveLength(2);
    s = reduce(s, { type: 'undo' });
    expect(s.present.clips).toHaveLength(0);
  });

  it('splits a clip at a frame boundary', () => {
    let s = createState({ name: 'ep1', sourcePath: 'x.mp4', durationSec: 100, preset: 'vertical', settings: DEFAULT_SETTINGS });
    s = reduce(s, { type: 'apply-auto-cuts', clips: [{ id: 'k1', track: 'V1', start: 0, end: 10, label: 'keep' }] });
    s = reduce(s, { type: 'split-clip', id: 'k1', at: 4 });
    expect(s.present.clips.map((c) => [c.start, c.end])).toEqual([[0, 4], [4, 10]]);
  });
});
