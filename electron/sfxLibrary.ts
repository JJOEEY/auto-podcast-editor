import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, extname, join } from 'node:path';
import type { SfxAsset } from '../core/sfxLibrary.js';

const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac']);

function indexPath(root: string): string {
  return join(root, 'media', 'sfx', 'index.json');
}

export async function listSfx(root: string, bundledRoot?: string): Promise<SfxAsset[]> {
  let bundled: SfxAsset[] = [];
  if (bundledRoot) {
    try {
      const entries = JSON.parse(await readFile(join(bundledRoot, 'index.json'), 'utf8')) as SfxAsset[];
      bundled = entries.map((asset) => ({ ...asset, path: join(bundledRoot, basename(asset.path)) }));
    } catch {
      bundled = [];
    }
  }
  try {
    const user = JSON.parse(await readFile(indexPath(root), 'utf8')) as SfxAsset[];
    return [...bundled, ...user];
  } catch {
    return bundled;
  }
}

export async function importSfx(root: string, sourcePath: string): Promise<SfxAsset> {
  const ext = extname(sourcePath).toLowerCase();
  if (!AUDIO_EXTENSIONS.has(ext)) throw new Error(`unsupported SFX format: ${ext}`);
  const bytes = await readFile(sourcePath);
  const id = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
  const targetDir = join(root, 'media', 'sfx', 'user');
  await mkdir(targetDir, { recursive: true });
  const target = join(targetDir, `${id}${ext}`);
  await copyFile(sourcePath, target);
  const assets = await listSfx(root);
  const existing = assets.find((asset) => asset.id === id);
  if (existing) return existing;
  const asset: SfxAsset = {
    id,
    name: basename(sourcePath, extname(sourcePath)),
    path: target,
    category: 'user',
    duration: 1,
    license: 'user-imported',
    source: sourcePath,
  };
  const next = [...assets, asset];
  const file = indexPath(root);
  await mkdir(join(root, 'media', 'sfx'), { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(next, null, 2), 'utf8');
  await rename(tmp, file);
  return asset;
}
