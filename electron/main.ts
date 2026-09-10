import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { basename, extname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { JobQueue } from './jobs.js';
import { spawnSync } from 'node:child_process';
import { buildAudioExtractArgs, runFfprobe } from './media.js';
import { buildWhisperArgs, parseProgressLine, whisperJsonPath } from './whisper.js';
import { parseWhisperJson } from '../core/whisperJson.js';
import { buildRenderProps, writePropsFile } from '../core/propsFile.js';
import { importSfx, listSfx } from './sfxLibrary.js';
import { buildCaptionTxt, buildSrt } from '../core/exportText.js';
import { extensionForFormat, validateExportRequest, type ExportRequest } from '../core/export.js';
import { audioFilterForPreset } from '../core/audioPresets.js';
import type { Project } from '../core/types.js';
import { compressTimeline } from '../core/compressedTimeline.js';
import { spawnAsync } from './spawnAsync.js';
import { assertMeaningfulPath } from './paths.js';
import { checkSpawn, compIdForPreset } from './render.js';
import { renderRemotion } from './remotionRenderer.js';

const queue = new JobQueue();
let win: BrowserWindow | null = null;

function runtimeBinary(name: string): string {
  if (app.isPackaged) {
    const packaged = join(process.resourcesPath, 'bin', `${name}.exe`);
    if (existsSync(packaged)) return packaged;
  }
  return name;
}

queue.onEvent((e) => {
  if (e.type === 'progress') win?.webContents.send('job:progress', { name: e.name, fraction: e.fraction });
});

async function createWindow(): Promise<void> {
  win = new BrowserWindow({ width: 1400, height: 900, webPreferences: { preload: join(__dirname, '../preload/index.mjs') } });
  if (process.env['ELECTRON_RENDERER_URL']) {
    await win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    await win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

ipcMain.handle('job:cancel', () => {
  queue.cancelAll();
});

ipcMain.handle('job:reset', () => {
  queue.reset();
});

ipcMain.handle('dialog:open-video', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi'] }],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('dialog:open-model', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Whisper model', extensions: ['bin'] }],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('dialog:open-directory', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('dialog:open-sfx', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'SFX audio', extensions: ['wav', 'mp3', 'ogg', 'm4a', 'aac', 'flac'] }],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('sfx:list', () => listSfx(app.getPath('userData'), join(app.getAppPath(), 'assets', 'sfx', 'bundled')));
ipcMain.handle('sfx:import', (_e, sourcePath: string) => importSfx(app.getPath('userData'), sourcePath));

ipcMain.handle('media:probe', (_e, filePath: string) =>
  queue.enqueue('probe', async () =>
    runFfprobe(filePath, (cmd, args) => {
      const r = spawnSync(runtimeBinary(cmd), args, { encoding: 'utf8' });
      checkSpawn(cmd, r);
      return { stdout: r.stdout as string };
    }),
  ),
);

ipcMain.handle('ai:transcribe', (_e, filePath: string, modelPath: string) => {
  assertMeaningfulPath(filePath, 'filePath');
  assertMeaningfulPath(modelPath, 'modelPath');
  return queue.enqueue('transcribe', async (ctx) => {
    const stem = basename(filePath, extname(filePath)).replace(/[^a-zA-Z0-9_-]+/g, '-');
    const workDir = join(app.getPath('userData'), 'jobs', stem || 'video');
    await mkdir(workDir, { recursive: true });
    const wav = join(workDir, 'audio16k.wav');
    const ffmpeg = spawnAsync(runtimeBinary('ffmpeg'), buildAudioExtractArgs(filePath, wav));
    ctx.onKill(ffmpeg.kill);
    checkSpawn('ffmpeg', { status: await ffmpeg.done });
    ctx.report(0.05);

    const outBase = join(workDir, 'transcript');
    const whisper = spawnAsync(runtimeBinary('whisper-cli'), buildWhisperArgs(modelPath, wav, outBase), {
      onLine: (line) => {
        const percent = parseProgressLine(line);
        if (percent !== null) ctx.report(0.05 + percent * 0.0095);
      },
    });
    ctx.onKill(whisper.kill);
    checkSpawn('whisper-cli', { status: await whisper.done });
    const jsonPath = whisperJsonPath(outBase);
    const words = parseWhisperJson(JSON.parse(await readFile(jsonPath, 'utf8')));
    ctx.report(1);
    return { jsonPath, words };
  });
});

ipcMain.handle('job:render', (_e, project: Project, request: ExportRequest) => {
  validateExportRequest(request);
  return queue.enqueue('render', async (ctx) => {
    const safeName = request.fileName.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/\.[^.]+$/, '');
    const outputDir = request.dir;
    await mkdir(outputDir, { recursive: true });
    const extension = extensionForFormat(request.format);
    const mediaPath = join(outputDir, `${safeName}${extension}`);
    const basePath = join(outputDir, safeName);
    const propsPath = join(app.getPath('userData'), 'jobs', `${safeName}-props.json`);
    await mkdir(join(app.getPath('userData'), 'jobs'), { recursive: true });
    const burnCaptions = request.captions === 'burn' || request.captions === 'both';
    const renderProps = buildRenderProps(project.sourcePath, project.clips, burnCaptions ? project.captions : [], project.sfx ?? [], project.subtitleStyle ?? 'karaoke');
    await writePropsFile(propsPath, renderProps);
    const compId = compIdForPreset(project.preset);
    const scale = request.quality === '720p' ? 2 / 3 : request.quality === '2k' ? 4 / 3 : request.quality === '4k' ? 2 : 1;
    const isAudio = request.target === 'audio';
    const renderPath = isAudio ? join(app.getPath('userData'), 'jobs', `${safeName}-intermediate.mp4`) : mediaPath;
    const bitrate = request.bitrateMode === 'custom' && request.customMbps ? `${request.customMbps}M` : undefined;
    const codec = isAudio ? 'h264' : request.format === 'mp4-hevc' ? 'h265' : request.format === 'webm-vp9' ? 'vp9' : request.format === 'mov-prores' ? 'prores' : 'h264';
    await renderRemotion({
      appRoot: app.getAppPath(),
      compId,
      props: renderProps,
      outputPath: renderPath,
      codec,
      scale,
      muted: request.target === 'video-mute',
      videoBitrate: bitrate,
      audioCodec: request.format === 'webm-vp9' ? 'opus' : request.format === 'mov-prores' ? 'pcm-16' : 'aac',
      onProgress: (fraction) => ctx.report(0.1 + fraction * 0.7),
      onKill: ctx.onKill,
    });
    ctx.report(0.8);

    if (isAudio) {
      const audioArgs = request.format === 'mp3'
        ? ['-y', '-i', renderPath, '-vn', '-codec:a', 'libmp3lame', '-b:a', '192k', mediaPath]
        : ['-y', '-i', renderPath, '-vn', '-c:a', 'pcm_s16le', mediaPath];
      const audio = spawnAsync(runtimeBinary('ffmpeg'), audioArgs);
      ctx.onKill(audio.kill);
      checkSpawn('ffmpeg', { status: await audio.done });
    }

    const audioFilter = audioFilterForPreset(request.voicePreset ?? 'podcast');
    if (audioFilter && request.target !== 'video-mute') {
      const filteredPath = `${mediaPath}.voice${extension}`;
      const filtered = spawnAsync(runtimeBinary('ffmpeg'), ['-y', '-i', mediaPath, '-map', '0:v:0?', '-map', '0:a:0?', '-c:v', 'copy', '-af', audioFilter, filteredPath]);
      ctx.onKill(filtered.kill);
      checkSpawn('ffmpeg', { status: await filtered.done });
      await rm(mediaPath, { force: true });
      await rename(filteredPath, mediaPath);
    }

    const srtPath = `${basePath}.srt`;
    if (request.captions === 'srt' || request.captions === 'both') {
      const timeline = compressTimeline(project.clips, project.captions);
      await writeFile(srtPath, buildSrt(timeline.captions.map((caption) => ({
        id: `${caption.item.id}-${caption.outStart}`,
        start: caption.outStart,
        end: caption.outEnd,
        text: caption.item.text,
      }))), 'utf8');
      await assertOutput(srtPath);
    }
    const captionPath = `${basePath}.caption.txt`;
    await writeFile(captionPath, buildCaptionTxt(project.name, request.hashtags), 'utf8');
    await assertOutput(captionPath);
    const thumbPath = `${basePath}.png`;
    if (!isAudio) {
      const thumb = spawnAsync(runtimeBinary('ffmpeg'), ['-y', '-ss', String(Math.max(0, request.thumbSec)), '-i', mediaPath, '-frames:v', '1', '-update', '1', thumbPath]);
      ctx.onKill(thumb.kill);
      checkSpawn('ffmpeg', { status: await thumb.done });
      await assertOutput(thumbPath);
    }
    await assertOutput(mediaPath);
    ctx.report(1);
    return { media: mediaPath, srt: request.captions === 'srt' || request.captions === 'both' ? srtPath : null, caption: captionPath, thumb: isAudio ? null : thumbPath };
  });
});

async function assertOutput(filePath: string): Promise<void> {
  try {
    const info = await stat(filePath);
    if (info.size === 0) throw new Error(`output is empty: ${filePath}`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('output is empty:')) throw error;
    throw new Error(`output was not created: ${filePath}`);
  }
}

void app.whenReady().then(createWindow);
