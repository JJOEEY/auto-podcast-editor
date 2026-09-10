import { bundle } from '@remotion/bundler';
import { makeCancelSignal, renderMedia, selectComposition } from '@remotion/renderer';
import { join } from 'node:path';
import type { RenderProps } from '../core/propsFile.js';

export interface ProgrammaticRenderOptions {
  appRoot: string;
  compId: 'PodcastVertical' | 'PodcastHorizontal';
  props: RenderProps;
  outputPath: string;
  codec: 'h264' | 'h265' | 'vp9' | 'prores';
  scale: number;
  muted: boolean;
  videoBitrate?: string;
  audioCodec?: 'aac' | 'opus' | 'pcm-16';
  onProgress?: (fraction: number) => void;
  onKill?: (kill: () => void) => void;
  width?: number;
  height?: number;
}

let bundlePromise: Promise<string> | null = null;

export async function renderRemotion(options: ProgrammaticRenderOptions): Promise<void> {
  bundlePromise ??= bundle({
    entryPoint: join(options.appRoot, 'src', 'remotion', 'entry.ts'),
    onProgress: (fraction) => options.onProgress?.(fraction * 0.15),
  });
  const serveUrl = await bundlePromise;
  const cancel = makeCancelSignal();
  options.onKill?.(cancel.cancel);
  const composition = await selectComposition({
    serveUrl,
    id: options.compId,
    inputProps: options.props as unknown as Record<string, unknown>,
  });
  const sizedComposition = options.width && options.height ? { ...composition, width: options.width, height: options.height } : composition;
  await renderMedia({
    composition: sizedComposition,
    serveUrl,
    inputProps: options.props as unknown as Record<string, unknown>,
    codec: options.codec,
    outputLocation: options.outputPath,
    scale: options.scale,
    muted: options.muted,
    videoBitrate: options.videoBitrate,
    audioCodec: options.audioCodec,
    overwrite: true,
    licenseKey: 'free-license',
    onProgress: (progress) => options.onProgress?.(0.15 + progress.progress * 0.65),
  });
}
