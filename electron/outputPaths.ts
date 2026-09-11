import { join } from 'node:path';
import { stat } from 'node:fs/promises';

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'ENOENT') return false;
    throw error;
  }
}

export async function chooseCollisionFreeStem(dir: string, stem: string, extension: string): Promise<string> {
  let candidate = stem;
  let suffix = 0;
  while (await exists(join(dir, `${candidate}${extension}`))) {
    suffix += 1;
    candidate = `${stem}_${suffix}`;
  }
  return candidate;
}
