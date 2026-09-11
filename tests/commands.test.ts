import { describe, expect, it } from 'vitest';
import { applyEditorCommands, simulateEditorCommands } from '../core/commands.js';
import { toEditorCommands } from '../core/commandAdapter.js';
import { parseEditCommand } from '../core/commandParser.js';
import type { ProjectV2 } from '../core/types.js';

const project = (): ProjectV2 => ({
  version: 2,
  name: 'demo',
  sourcePath: 'demo.mp4',
  durationSec: 10,
  clips: [],
  proposals: [],
  captions: [],
  preset: 'vertical',
  settings: { silenceSec: 0.6, fillerMaxSec: 1, lowAudioDb: -40, topicPauseSec: 2, model: 'base' },
  subtitleStyle: 'karaoke',
  timebase: { fpsNum: 30, fpsDen: 1 },
  assets: [{ id: 'source', path: 'demo.mp4', kind: 'video', durationSec: 10 }],
  tracks: [{ id: 'V1', kind: 'video', name: 'Video 1', index: 0 }, { id: 'A1', kind: 'audio', name: 'Voice', index: 0 }],
  items: [
    { id: 'a', trackId: 'V1', assetId: 'source', label: 'a', startFrame: 0, durationFrames: 90, source: { sourceIn: 0, sourceOut: 3, handleBeforeFrames: 18, handleAfterFrames: 18 } },
    { id: 'b', trackId: 'V1', assetId: 'source', label: 'b', startFrame: 120, durationFrames: 90, source: { sourceIn: 4, sourceOut: 7, handleBeforeFrames: 18, handleAfterFrames: 18 } },
  ],
  markers: [],
  audioChains: [],
  proxies: {},
  appliedCommandIds: [],
});

describe('editor commands', () => {
  it('dry-runs without mutating the source and reports ripple scope', () => {
    const before = project();
    const result = simulateEditorCommands(before, [{ id: 'cut-1', type: 'remove-timeline-range', fromFrame: 90, toFrame: 120 }]);
    expect(result.ok).toBe(true);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.warnings.some((warning) => warning.includes('ripple affects'))).toBe(true);
    expect(before.items[1].startFrame).toBe(120);
    expect(result.project.items[1].startFrame).toBe(90);
  });

  it('blocks invalid commands before apply', () => {
    const result = simulateEditorCommands(project(), [{ id: 'bad', type: 'remove-timeline-range', fromFrame: 120, toFrame: 90 }]);
    expect(result.ok).toBe(false);
    expect(() => applyEditorCommands(project(), [{ id: 'bad', type: 'remove-timeline-range', fromFrame: 120, toFrame: 90 }])).toThrow('positive integer frames');
  });

  it('detects duplicate command ids and applies valid commands atomically in memory', () => {
    const first = applyEditorCommands(project(), [{ id: 'style-1', type: 'set-subtitle-style', style: 'neon' }]);
    const dryRun = simulateEditorCommands(first, [{ id: 'style-1', type: 'set-subtitle-style', style: 'box' }]);
    expect(dryRun.requiresConfirmation).toBe(true);
    expect(dryRun.warnings[0]).toContain('duplicated');
    expect(first.subtitleStyle).toBe('neon');
  });

  it('converts a parsed command into a dry-runnable proposal command', () => {
    const withProposal = { ...project(), proposals: [{ id: 'p1', start: 3, end: 4, kind: 'silence' as const, reason: 'pause', confidence: 0.9 }] };
    const commands = toEditorCommands(parseEditCommand('remove long pauses'), withProposal, 'test');
    expect(commands).toEqual([{ id: 'test-1-remove-silence', type: 'apply-cut-proposals', proposalIds: ['p1'] }]);
    expect(simulateEditorCommands(withProposal, commands).ok).toBe(true);
  });

  it('blocks dry-run edits that would touch a locked track', () => {
    const locked = { ...project(), tracks: project().tracks.map((track) => track.id === 'V1' ? { ...track, locked: true } : track) };
    const result = simulateEditorCommands(locked, [{ id: 'locked-cut', type: 'remove-timeline-range', fromFrame: 0, toFrame: 30 }]);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('track is locked: V1');
  });
});
