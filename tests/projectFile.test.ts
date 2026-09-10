import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveProject, loadProject } from '../core/projectFile.js';
import type { Project } from '../core/types.js';

const project: Project = {
  version: 1,
  name: 'demo',
  sourcePath: 'C:/vids/ep1.mp4',
  durationSec: 120,
  clips: [],
  proposals: [],
  captions: [],
  preset: 'vertical',
  settings: { silenceSec: 0.6, fillerMaxSec: 1.0, lowAudioDb: -40, topicPauseSec: 2.0, model: 'base' },
};

describe('projectFile', () => {
  it('round-trips a project through save/load', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ape-'));
    const file = join(dir, 'ep1.ape.json');
    await saveProject(file, project);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(project);
    expect(await loadProject(file)).toEqual(project);
  });

  it('rejects non-object JSON and wrong-shape projects', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ape-'));
    const bad = join(dir, 'bad.ape.json');
    writeFileSync(bad, '"just a string"', 'utf8');
    await expect(loadProject(bad)).rejects.toThrow();
    writeFileSync(bad, JSON.stringify({ version: 1, name: 'x' }), 'utf8');
    await expect(loadProject(bad)).rejects.toThrow('invalid project shape');
  });
});
