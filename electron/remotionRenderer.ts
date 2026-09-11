import { bundle } from '@remotion/bundler';
import { makeCancelSignal, renderMedia, selectComposition } from '@remotion/renderer';
import { extname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import type { RenderProps } from '../core/propsFile.js';
import { startLocalAssetServer } from './localAssetServer.ts';
import { runtimeBrowserPath } from './runtimeAssets.js';

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

function bundledBrowser(appRoot: string): string | undefined {
  const downloaded = runtimeBrowserPath();
  if (downloaded) return downloaded;
  const candidates = [
    join(process.resourcesPath ?? '', 'remotion-browser', 'chrome.exe'),
    join(process.resourcesPath ?? '', 'remotion-browser', 'chrome-headless-shell.exe'),
    join(appRoot, 'assets', 'remotion-browser', 'chrome.exe'),
  ];
  return candidates.find((candidate) => candidate && existsSync(candidate));
}

export async function renderRemotion(options: ProgrammaticRenderOptions): Promise<void> {
  bundlePromise ??= bundle({
    entryPoint: join(options.appRoot, 'src', 'remotion', 'entry.ts'),
    onProgress: (fraction) => options.onProgress?.(fraction * 0.15),
  });
  const serveUrl = await bundlePromise;
  const cancel = makeCancelSignal();
  options.onKill?.(cancel.cancel);
  const browserExecutable = bundledBrowser(options.appRoot);
  const assetServer = await startLocalAssetServer([options.props.sourcePath, options.props.previewAudioPath, ...(options.props.sfx ?? []).map((clip) => clip.path)].filter((path): path is string => Boolean(path)));
  const renderProps: RenderProps = {
    ...options.props,
    sourcePath: assetServer.urlFor(options.props.sourcePath),
    previewAudioPath: options.props.previewAudioPath ? assetServer.urlFor(options.props.previewAudioPath) : undefined,
    sfx: (options.props.sfx ?? []).map((clip) => ({ ...clip, path: assetServer.urlFor(clip.path) })),
  };
  try {
    const composition = await selectComposition({
      serveUrl,
      id: options.compId,
      inputProps: renderProps as unknown as Record<string, unknown>,
      browserExecutable: browserExecutable ?? undefined,
      chromeMode: 'headless-shell',
    });
    const sizedComposition = options.width && options.height ? { ...composition, width: options.width, height: options.height } : composition;
    const outputPart = `${options.outputPath}.part${extname(options.outputPath) || '.mp4'}`;
    await rm(outputPart, { force: true });
    await renderMedia({
      composition: sizedComposition,
      serveUrl,
      inputProps: renderProps as unknown as Record<string, unknown>,
      codec: options.codec,
      outputLocation: outputPart,
      scale: options.scale,
      muted: options.muted,
      videoBitrate: options.videoBitrate,
      audioCodec: options.audioCodec,
      overwrite: true,
      licenseKey: 'free-license',
      cancelSignal: cancel.cancelSignal,
      browserExecutable: browserExecutable ?? undefined,
      chromeMode: 'headless-shell',
      onProgress: (progress) => options.onProgress?.(0.15 + progress.progress * 0.65),
    });
    await rm(options.outputPath, { force: true });
    await rename(outputPart, options.outputPath);
  } finally {
    await rm(`${options.outputPath}.part${extname(options.outputPath) || '.mp4'}`, { force: true });
    await assetServer.close();
  }
}
