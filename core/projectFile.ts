import { readFile, rename, writeFile } from 'node:fs/promises';
import type { Project } from './types.js';

export async function saveProject(filePath: string, project: Project): Promise<void> {
  const tmpPath = `${filePath}.tmp`;
  await writeFile(tmpPath, JSON.stringify(project, null, 2), 'utf8');
  await rename(tmpPath, filePath);
}

export async function loadProject(filePath: string): Promise<Project> {
  const raw = await readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw) as Project;
  if (parsed.version !== 1) throw new Error(`unsupported project version: ${String(parsed.version)}`);
  return parsed;
}
