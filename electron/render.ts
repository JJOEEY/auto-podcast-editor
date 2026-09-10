import { join } from 'node:path';

export interface RenderOutputs { mp4: string; srt: string; captionTxt: string; thumb: string; }

export function buildRenderOutputs(projectPath: string, preset: 'vertical' | 'horizontal'): RenderOutputs {
  const dir = projectPath.replace(/\.ape\.json$/, '');
  const suffix = preset === 'vertical' ? 'vertical' : 'horizontal';
  return {
    mp4: join(dir, `${suffix}.mp4`),
    srt: join(dir, 'captions.srt'),
    captionTxt: join(dir, 'caption.txt'),
    thumb: join(dir, 'thumb.png'),
  };
}

export function buildRemotionRenderArgs(compId: string, outMp4: string, propsPath: string): string[] {
  return ['remotion', 'render', compId, outMp4, '--props', propsPath];
}

export interface SpawnResult {
  status: number | null;
  error?: Error;
}

export function checkSpawn(cmd: string, result: SpawnResult): void {
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${cmd} exited with code ${String(result.status)}`);
}
