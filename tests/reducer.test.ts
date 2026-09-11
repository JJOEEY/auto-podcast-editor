import { describe, expect, it } from 'vitest';
import { createState, reduce } from '../src/state/reducer.js';
import { DEFAULT_SETTINGS, createDefaultSettings } from '../core/defaults.js';

describe('apply-analysis', () => {
  const init = () => createState({ name: 'ep1', sourcePath: 'x.mp4', durationSec: 100, preset: 'vertical', settings: DEFAULT_SETTINGS });

  it('applies clips+captions+proposals as one undo step', () => {
    let s = init();
    s = reduce(s, {
      type: 'apply-analysis',
      clips: [{ id: 'k1', track: 'V1', start: 0, end: 10, label: 'k' }],
      captions: [{ id: 'c1', start: 0, end: 1, text: 'hi' }],
      proposals: [{ id: 'p1', start: 10, end: 12, kind: 'silence', reason: 't', confidence: 1 }],
    });
    expect(s.present.clips).toHaveLength(1);
    expect(s.present.items).toHaveLength(1);
    expect(s.present.items[0]).toMatchObject({ id: 'k1', startFrame: 0, durationFrames: 300 });
    expect(s.present.captions).toHaveLength(1);
    expect(s.present.proposals).toHaveLength(1);
    s = reduce(s, { type: 'undo' });
    expect(s.present.clips).toHaveLength(0);
    expect(s.present.captions).toHaveLength(0);
    expect(s.present.proposals).toHaveLength(0);
  });

  it('open-project replaces state and clears history', () => {
    let s = reduce(init(), { type: 'split-clip', id: 'nope', at: 1 });
    s = reduce(s, {
      type: 'open-project',
      project: {
        version: 1, name: 'ep2', sourcePath: 'y.mp4', durationSec: 50, preset: 'vertical',
        settings: DEFAULT_SETTINGS, clips: [], proposals: [], captions: [],
      },
    });
    expect(s.present.name).toBe('ep2');
  });
});

describe('manual timeline edits', () => {
  it('moves and trims a clip', () => {
    let s = createState({ name: 'ep', sourcePath: 'x', durationSec: 20, preset: 'vertical', settings: DEFAULT_SETTINGS });
    s = reduce(s, { type: 'apply-auto-cuts', clips: [{ id: 'k', track: 'V1', start: 2, end: 8, label: 'k' }] });
    s = reduce(s, { type: 'move-clip', id: 'k', delta: 1 });
    s = reduce(s, { type: 'trim-clip', id: 'k', edge: 'end', delta: 2 });
    expect(s.present.clips[0]).toMatchObject({ start: 3, end: 11 });
    expect(s.present.items[0]).toMatchObject({ id: 'k', startFrame: 90, durationFrames: 240 });
  });

  it('moves a multi-selection atomically, changes track, and ripple-deletes', () => {
    let s = createState({ name: 'ep', sourcePath: 'x', durationSec: 20, preset: 'vertical', settings: DEFAULT_SETTINGS });
    s = reduce(s, { type: 'apply-auto-cuts', clips: [
      { id: 'a', track: 'V1', start: 0, end: 2, label: 'a' },
      { id: 'b', track: 'V1', start: 3, end: 5, label: 'b' },
    ] });
    s = reduce(s, { type: 'move-clips', ids: ['a', 'b'], delta: 1 });
    expect(s.present.clips.map((clip) => clip.start)).toEqual([1, 4]);
    s = reduce(s, { type: 'set-clip-track', id: 'a', track: 'A1' });
    expect(s.present.clips[0].track).toBe('A1');
    s = reduce(s, { type: 'ripple-delete-clip', id: 'b' });
    expect(s.present.clips.find((clip) => clip.id === 'b')).toBeUndefined();
  });

  it('applies a validated editor project as one undoable transaction', () => {
    const initial = createState({ name: 'ep', sourcePath: 'x', durationSec: 20, preset: 'vertical', settings: DEFAULT_SETTINGS });
    const edited = { ...initial.present, subtitleStyle: 'neon' as const };
    const next = reduce(initial, { type: 'apply-editor-project', project: edited });
    expect(next.present.subtitleStyle).toBe('neon');
    expect(next.past).toHaveLength(1);
    expect(reduce(next, { type: 'undo' }).present.subtitleStyle).toBe('karaoke');
  });

  it('changes audio track mute, solo and volume as undoable edits', () => {
    let s = createState({ name: 'ep', sourcePath: 'x', durationSec: 20, preset: 'vertical', settings: DEFAULT_SETTINGS });
    s = reduce(s, { type: 'set-track-muted', id: 'A1', muted: true });
    s = reduce(s, { type: 'set-track-solo', id: 'A1', solo: true });
    s = reduce(s, { type: 'set-track-volume', id: 'A1', volumeDb: -6 });
    expect(s.present.tracks.find((track) => track.id === 'A1')).toMatchObject({ muted: true, solo: true, volumeDb: -6 });
    expect(s.past).toHaveLength(3);
  });

  it('edits and duplicates SFX as undoable timeline actions', () => {
    let s = createState({ name: 'ep', sourcePath: 'x', durationSec: 20, preset: 'vertical', settings: DEFAULT_SETTINGS });
    s = reduce(s, { type: 'add-sfx', clip: { id: 'sfx-1', path: 'whoosh.wav', start: 1, duration: 2, volume: 0.75 } });
    s = reduce(s, { type: 'update-sfx', id: 'sfx-1', patch: { start: 3, fadeInSec: 0.2, muted: true } });
    s = reduce(s, { type: 'duplicate-sfx', id: 'sfx-1' });
    expect(s.present.sfx).toHaveLength(2);
    expect(s.present.sfx?.[0]).toMatchObject({ start: 3, fadeInSec: 0.2, muted: true });
    expect(s.present.sfx?.[1].start).toBe(5);
  });

  it('increments the project revision for edits so command previews can expire', () => {
    let s = createState({ name: 'ep', sourcePath: 'x', durationSec: 20, preset: 'vertical', settings: DEFAULT_SETTINGS });
    const before = s.present.revision ?? 0;
    s = reduce(s, { type: 'set-preset', preset: 'horizontal' });
    expect(s.present.revision).toBe(before + 1);
    s = reduce(s, { type: 'undo' });
    expect(s.present.revision).toBe(before);
  });
});

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

  it('does not edit a locked track through direct reducer actions', () => {
    let s = reduce(init(), { type: 'apply-auto-cuts', clips: [{ id: 'locked-clip', track: 'V1', start: 0, end: 10, label: 'locked' }] });
    s = reduce(s, { type: 'set-track-locked', id: 'V1', locked: true });
    const before = s;
    expect(reduce(s, { type: 'move-clip', id: 'locked-clip', delta: 1 })).toBe(before);
    expect(reduce(s, { type: 'trim-clip', id: 'locked-clip', edge: 'end', delta: 1 })).toBe(before);
    expect(reduce(s, { type: 'split-clip', id: 'locked-clip', at: 4 })).toBe(before);
    expect(reduce(s, { type: 'delete-clip', id: 'locked-clip' })).toBe(before);
  });
});
