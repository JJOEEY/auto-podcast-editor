import { describe, expect, it } from 'vitest';
import { createState, reduce } from '../src/state/reducer.js';
import { DEFAULT_SETTINGS, createDefaultSettings } from '../core/defaults.js';

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

describe('reducer robustness', () => {
  const init = () => createState({ name: 'ep1', sourcePath: 'x.mp4', durationSec: 100, preset: 'vertical', settings: DEFAULT_SETTINGS });

  it('keeps ids unique across double splits', () => {
    let s = reduce(init(), { type: 'apply-auto-cuts', clips: [{ id: 'k1', track: 'V1', start: 0, end: 10, label: 'k' }] });
    s = reduce(s, { type: 'split-clip', id: 'k1', at: 4 });
    s = reduce(s, { type: 'split-clip', id: 'k1', at: 2 });
    const ids = s.present.clips.map((c) => c.id);
    expect(s.present.clips.map((c) => c.id)).toEqual(['k1', 'k1@2', 'k1@4']);
    expect(s.present.clips.map((c) => [c.start, c.end])).toEqual([[0, 2], [2, 4], [4, 10]]);
    const after = reduce(s, { type: 'delete-clip', id: ids[1] });
    expect(after.present.clips).toHaveLength(2);
  });

  it('redo round-trips an undone split', () => {
    let s = reduce(init(), { type: 'apply-auto-cuts', clips: [{ id: 'k1', track: 'V1', start: 0, end: 10, label: 'k' }] });
    s = reduce(s, { type: 'split-clip', id: 'k1', at: 4 });
    s = reduce(s, { type: 'undo' });
    expect(s.present.clips).toHaveLength(1);
    s = reduce(s, { type: 'redo' });
    expect(s.present.clips.map((c) => [c.start, c.end])).toEqual([[0, 4], [4, 10]]);
  });

  it('treats no-op delete/split as identity (same reference, redo kept)', () => {
    let s = reduce(init(), { type: 'apply-auto-cuts', clips: [{ id: 'k1', track: 'V1', start: 0, end: 10, label: 'k' }] });
    expect(reduce(s, { type: 'delete-clip', id: 'missing' })).toBe(s);
    expect(reduce(s, { type: 'split-clip', id: 'missing', at: 4 })).toBe(s);
    expect(reduce(s, { type: 'split-clip', id: 'k1', at: 0 })).toBe(s);
  });
});

describe('reducer input hardening', () => {
  const init = () => createState({ name: 'ep1', sourcePath: 'x.mp4', durationSec: 100, preset: 'vertical', settings: DEFAULT_SETTINGS });

  it('rejects non-finite split points', () => {
    const s = reduce(init(), { type: 'apply-auto-cuts', clips: [{ id: 'k1', track: 'V1', start: 0, end: 10, label: 'k' }] });
    expect(reduce(s, { type: 'split-clip', id: 'k1', at: NaN })).toBe(s);
  });

  it('deep-copies clips on apply (caller mutation cannot leak)', () => {
    const clips = [{ id: 'k1', track: 'V1' as const, start: 0, end: 10, label: 'k' }];
    const s = reduce(init(), { type: 'apply-auto-cuts', clips });
    clips[0].end = 99;
    clips.push({ id: 'k2', track: 'V1' as const, start: 20, end: 30, label: 'x' });
    expect(s.present.clips).toHaveLength(1);
    expect(s.present.clips[0].end).toBe(10);
  });

  it('preserves the redo stack across no-ops', () => {
    let s = reduce(init(), { type: 'apply-auto-cuts', clips: [{ id: 'k1', track: 'V1', start: 0, end: 10, label: 'k' }] });
    s = reduce(s, { type: 'split-clip', id: 'k1', at: 4 });
    s = reduce(s, { type: 'undo' });
    expect(s.future).toHaveLength(1);
    s = reduce(s, { type: 'delete-clip', id: 'missing' });
    expect(s.future).toHaveLength(1);
    s = reduce(s, { type: 'redo' });
    expect(s.present.clips).toHaveLength(2);
  });

  it('rejects infinite split points too', () => {
    const s = reduce(init(), { type: 'apply-auto-cuts', clips: [{ id: 'k1', track: 'V1', start: 0, end: 10, label: 'k' }] });
    expect(reduce(s, { type: 'split-clip', id: 'k1', at: Infinity })).toBe(s);
  });

  it('isolates init.settings (caller mutation cannot leak)', () => {
    const settings = createDefaultSettings();
    const s = createState({ name: 'e', sourcePath: 'x', durationSec: 1, preset: 'vertical', settings });
    settings.silenceSec = 9;
    expect(s.present.settings.silenceSec).toBe(0.6);
  });
});
