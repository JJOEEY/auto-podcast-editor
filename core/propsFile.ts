import { rename, writeFile } from 'node:fs/promises';
import type { CaptionLine, Clip } from './types.js';

export interface RenderProps {
  sourcePath: string;
  clips: Clip[];
  captions: CaptionLine[];
}

/** Props passed to the Remotion composition for preview AND render (single source of truth). */
export function buildRenderProps(sourcePath: string, clips: Clip[], captions: CaptionLine[]): RenderProps {
  return {
    sourcePath,
    clips: clips.map((c) => ({ ...c })),
    captions: captions.map((c) => ({ ...c })),
  };
}

export async function writePropsFile(filePath: string, props: RenderProps): Promise<void> {
  const tmpPath = `${filePath}.tmp`;
  await writeFile(tmpPath, JSON.stringify(props, null, 2), 'utf8');
  await rename(tmpPath, filePath);
}
