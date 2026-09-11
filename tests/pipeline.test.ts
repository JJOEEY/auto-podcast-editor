import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { chunkCaption } from '../core/caption.js';
import { proposeCuts } from '../core/cutDetection.js';
import { DEFAULT_SETTINGS } from '../core/defaults.js';
import { buildCaptionTxt, buildSrt } from '../core/exportText.js';
import { loadProject, saveProject } from '../core/projectFile.js';
import { migrateProject } from '../core/projectFile.js';
import type { Project } from '../core/types.js';

describe('sample pipeline', () => {
  it('goes from transcript fixture to export texts and saved project', async () => {
    const words = [
      { text: 'xin', start: 0.0, end: 0.3 },
      { text: 'chào', start: 0.4, end: 0.7 },
      { text: 'ừm', start: 0.8, end: 1.1 },
      { text: 'các', start: 2.5, end: 2.7 },
      { text: 'bạn', start: 2.8, end: 3.0 },
    ];
    const proposals = proposeCuts(words, [], DEFAULT_SETTINGS);
    expect(proposals.some((p) => p.kind === 'filler')).toBe(true);
    expect(proposals.some((p) => p.kind === 'silence')).toBe(true);
    const kept = words.filter((w) => !proposals.some((p) => p.kind === 'filler' && p.start === w.start));
    const captions = chunkCaption(kept);
    expect(buildSrt(captions)).toContain('xin chào');
    const dir = mkdtempSync(join(tmpdir(), 'ape-pipe-'));
    const project: Project = {
      version: 1, name: 'sample', sourcePath: 'sample.mp4', durationSec: 4,
      clips: [], proposals, captions, preset: 'vertical', settings: DEFAULT_SETTINGS,
    };
    const file = join(dir, 'sample.ape.json');
    await saveProject(file, project);
    expect(await loadProject(file)).toEqual(migrateProject(project));
    expect(buildCaptionTxt('Sample', ['#a', '#b', '#c', '#d'])).toContain('#d');
  });
});
