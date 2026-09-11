import { copyFile, readFile, rename, stat, writeFile } from 'node:fs/promises';
import type { Project, ProjectV2 } from './types.js';
import { migrateProject, syncProjectTimeline } from './projectMigration.js';

export { migrateProject, syncProjectTimeline } from './projectMigration.js';

export async function saveProject(filePath: string, project: Project): Promise<void> {
  const tmpPath = `${filePath}.tmp`;
  const backupPath = `${filePath}.bak`;
  try {
    await stat(filePath);
    await copyFile(filePath, backupPath);
  } catch {
    // First save has no previous version to back up.
  }
  await writeFile(tmpPath, JSON.stringify(project, null, 2), 'utf8');
  await rename(tmpPath, filePath);
}

export async function loadProject(filePath: string): Promise<ProjectV2> {
  const raw = await readFile(filePath, 'utf8');
  const parsed: unknown = JSON.parse(raw);
  assertProjectShape(parsed);
  return migrateProject(parsed);
}

export async function loadProjectV2(filePath: string): Promise<ProjectV2> {
  return loadProject(filePath);
}

function assertProjectShape(value: unknown): asserts value is Project {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('invalid project file');
  const candidate = value as Partial<Project>;
  if (candidate.version !== 1 && candidate.version !== 2) throw new Error(`unsupported project version: ${String(candidate.version)}`);
  if (typeof candidate.name !== 'string' || typeof candidate.sourcePath !== 'string' || typeof candidate.durationSec !== 'number' || !Number.isFinite(candidate.durationSec)) {
    throw new Error('invalid project shape');
  }
  if (!Array.isArray(candidate.clips) || !Array.isArray(candidate.captions) || !Array.isArray(candidate.proposals) || typeof candidate.settings !== 'object' || candidate.settings === null) {
    throw new Error('invalid project shape');
  }
}
