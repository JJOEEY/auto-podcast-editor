import { join } from 'node:path';
import type { ExportFormat, ExportQuality } from '../core/export.js';

export interface RenderOutputs { mp4: string; srt: string; captionTxt: string; thumb: string; }

export interface RenderOptions {
  format?: ExportFormat;
  quality?: ExportQuality;
  videoBitrate?: string;
  muted?: boolean;
  scale?: number;
  audioCodec?: string;
}

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

export function buildRemotionRenderArgs(compId: string, outMp4: string, propsPath: string, options: RenderOptions = {}): string[] {
  const args = ['remotion', 'render', compId, outMp4, '--props', propsPath];
  if (options.format) {
    const codec = options.format === 'mp4-hevc' ? 'h265'
      : options.format === 'webm-vp9' ? 'vp9'
        : options.format === 'mov-prores' ? 'prores' : 'h264';
    args.push('--codec', codec);
  }
  if (options.scale) args.push('--scale', String(options.scale));
  if (options.videoBitrate) args.push('--video-bitrate', options.videoBitrate);
  if (options.audioCodec) args.push('--audio-codec', options.audioCodec);
  if (options.muted) args.push('--muted');
  return args;
}

export interface SpawnResult {
  status: number | null;
  error?: Error;
}

export function checkSpawn(cmd: string, result: SpawnResult): void {
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${cmd} exited with code ${String(result.status)}`);
}

export function compIdForPreset(preset: 'vertical' | 'horizontal'): 'PodcastVertical' | 'PodcastHorizontal' {
  return preset === 'vertical' ? 'PodcastVertical' : 'PodcastHorizontal';
}
