import { readFile, rename, writeFile } from 'node:fs/promises';
import type { Project } from './types.js';

export async function saveProject(filePath: string, project: Project): Promise<void> {
  const tmpPath = `${filePath}.tmp`;
  await writeFile(tmpPath, JSON.stringify(project, null, 2), 'utf8');
  await rename(tmpPath, filePath);
}

export async function loadProject(filePath: string): Promise<Project> {
  const raw = await readFile(filePath, 'utf8');
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('invalid project file');
  const candidate = parsed as Partial<Project>;
  if (candidate.version !== 1) throw new Error(`unsupported project version: ${String(candidate.version)}`);
  if (!Array.isArray(candidate.clips) || typeof candidate.settings !== 'object' || candidate.settings === null) {
    throw new Error('invalid project shape');
  }
  return candidate as Project;
}
