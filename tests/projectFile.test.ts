import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadProject, loadProjectV2, migrateProject, saveProject } from '../core/projectFile.js';
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
    expect(await loadProject(file)).toEqual(migrateProject(project));
  });

  it('rejects non-object JSON and wrong-shape projects', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ape-'));
    const bad = join(dir, 'bad.ape.json');
    writeFileSync(bad, '"just a string"', 'utf8');
    await expect(loadProject(bad)).rejects.toThrow();
    writeFileSync(bad, JSON.stringify({ version: 1, name: 'x' }), 'utf8');
    await expect(loadProject(bad)).rejects.toThrow('invalid project shape');
  });

  it('migrates a v1 project to an additive v2 timeline model', async () => {
    const migrated = migrateProject({
      ...project,
      clips: [{ id: 'keep-1', track: 'V1', start: 1, end: 4, label: 'keep 1', transitionOut: { type: 'fade', durationFrames: 10 } }],
    });
    expect(migrated.version).toBe(2);
    expect(migrated.timebase).toEqual({ fpsNum: 30, fpsDen: 1 });
    expect(migrated.assets[0]).toMatchObject({ id: 'source-asset', path: project.sourcePath, kind: 'video' });
    expect(migrated.items[0]).toMatchObject({ id: 'keep-1', trackId: 'V1', startFrame: 30, durationFrames: 90, transitionKind: 'fade' });
    expect(migrated.items[0].source).toMatchObject({ sourceIn: 1, sourceOut: 4, handleBeforeFrames: 18, handleAfterFrames: 18 });
  });

  it('normalizes an incomplete v2 file without discarding legacy timeline data', () => {
    const normalized = migrateProject({
      ...project,
      version: 2,
      clips: [{ id: 'clip-1', track: 'V1', start: 2, end: 5, label: 'clip 1' }],
    });
    expect(normalized.version).toBe(2);
    expect(normalized.items[0]).toMatchObject({ id: 'clip-1', startFrame: 60, durationFrames: 90 });
    expect(normalized.tracks.map((track) => track.id)).toEqual(['V1', 'A1', 'A2', 'CC']);
    expect(normalized.audioChains).toEqual([]);
    expect(normalized.appliedCommandIds).toEqual([]);
  });

  it('keeps the previous project as a backup before replacing the main file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ape-backup-'));
    const file = join(dir, 'ep1.ape.json');
    await saveProject(file, project);
    await saveProject(file, { ...project, name: 'new-name' });
    expect(existsSync(`${file}.bak`)).toBe(true);
    expect(JSON.parse(readFileSync(`${file}.bak`, 'utf8')).name).toBe('demo');
    expect(JSON.parse(readFileSync(file, 'utf8')).name).toBe('new-name');
  });

  it('loads v1 files through the v2 migration boundary', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ape-v2-'));
    const file = join(dir, 'ep1.ape.json');
    await saveProject(file, project);
    const migrated = await loadProjectV2(file);
    expect(migrated.version).toBe(2);
    expect(migrated.tracks.map((track) => track.id)).toEqual(['V1', 'A1', 'A2', 'CC']);
  });
});
