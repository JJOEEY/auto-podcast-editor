import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { basename, extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { JobQueue } from './jobs.js';
import { spawn, spawnSync } from 'node:child_process';
import { buildAudioExtractArgs, buildPeaksArgs, runFfprobe } from './media.js';
import { buildWhisperArgs, parseProgressLine, whisperJsonPath } from './whisper.js';
import { parseWhisperJson } from '../core/whisperJson.js';
import { buildRenderProps, writePropsFile } from '../core/propsFile.js';
import { loadProject, saveProject } from '../core/projectFile.js';
import { importSfx, listSfx } from './sfxLibrary.js';
import { buildCaptionTxt, buildSrt } from '../core/exportText.js';
import { extensionForFormat, validateExportRequest, type ExportRequest } from '../core/export.js';
import { buildAudioGraphPlan, buildAudioMixFilter, volumeFilter } from '../core/audioGraph.js';
import { buildAudioPreviewFilter } from '../core/audioPreview.js';
import type { AudioChain, Track } from '../core/types.js';
import { migrateProject } from '../core/projectMigration.js';
import { buildCapabilitySnapshot, parseVramBytes } from './capabilities.js';
import type { Project } from '../core/types.js';
import { compressTimeline } from '../core/compressedTimeline.js';
import { spawnAsync } from './spawnAsync.js';
import { assertMeaningfulPath } from './paths.js';
import { checkSpawn, compIdForPreset } from './render.js';
import { renderRemotion } from './remotionRenderer.js';
import { chooseCollisionFreeStem } from './outputPaths.js';
import { buildWaveformCacheFromPeaks } from '../core/waveform.js';
import { timelineDurationFrames } from '../core/timelineDuration.js';
import { buildLocalLlmPrompt } from '../core/localLlm.js';
import { runLocalLlm } from './localLlmRunner.js';
import { downloadRuntimeAssets, runtimeAssetReport, runtimeBrowserPath, runtimePathForId } from './runtimeAssets.js';

const queue = new JobQueue();
let win: BrowserWindow | null = null;

interface PlayerCaptureRequest {
  projectPath: string;
  outputDir: string;
  frameStep: number;
  sourceOverride?: string;
}

function playerCaptureRequest(): PlayerCaptureRequest | null {
  const index = process.argv.indexOf('--player-capture');
  if (index < 0) return null;
  const projectPath = process.argv[index + 1];
  const outputDir = process.argv[index + 2];
  const frameStep = Number(process.argv[index + 3] ?? 10);
  const sourceOverride = process.argv[index + 4];
  if (!projectPath || !outputDir || !Number.isInteger(frameStep) || frameStep <= 0) {
    throw new Error('player capture requires --player-capture <project> <outputDir> [frameStep] [sourceOverride]');
  }
  return { projectPath, outputDir, frameStep, sourceOverride };
}

const captureRequest = playerCaptureRequest();
let captureProject: Project | null = null;

function runtimeBinary(name: string): string {
  const runtimeId = name === 'llama-cli' ? 'llama-cli' : name;
  const downloaded = runtimePathForId(runtimeId);
  if (downloaded) return downloaded;
  if (app.isPackaged) {
    const llmPackaged = join(process.resourcesPath, 'bin', 'llm', `${name}.exe`);
    if (name === 'llama-cli' && existsSync(llmPackaged)) return llmPackaged;
    const packaged = join(process.resourcesPath, 'bin', `${name}.exe`);
    if (existsSync(packaged)) return packaged;
  }
  if (name === 'llama-cli') {
    const local = join(app.getAppPath(), 'assets', 'bin', 'llm', 'llama-cli.exe');
    if (existsSync(local)) return local;
  }
  return name;
}

function defaultModelPath(): string | null {
  const downloaded = runtimePathForId('whisper-base');
  if (downloaded) return downloaded;
  const packaged = join(process.resourcesPath, 'models', 'ggml-base.bin');
  const local = join(app.getAppPath(), 'assets', 'models', 'ggml-base.bin');
  if (app.isPackaged && existsSync(packaged)) return packaged;
  return existsSync(local) ? local : null;
}

function defaultLlmModelPath(): string | null {
  const downloaded = runtimePathForId('llm-model');
  if (downloaded) return downloaded;
  const packaged = join(process.resourcesPath, 'models', 'Qwen3-4B-Q4_K_M.gguf');
  const local = join(app.getAppPath(), 'assets', 'models', 'Qwen3-4B-Q4_K_M.gguf');
  if (app.isPackaged && existsSync(packaged)) return packaged;
  return existsSync(local) ? local : null;
}

function bundledBrowserPath(): string | null {
  const downloaded = runtimeBrowserPath();
  if (downloaded) return downloaded;
  const candidates = [
    join(process.resourcesPath, 'remotion-browser', 'chrome-headless-shell.exe'),
    join(app.getAppPath(), 'assets', 'remotion-browser', 'chrome-headless-shell.exe'),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function detectVramBytes(): number | null {
  const powershell = spawnSync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    '(Get-CimInstance Win32_VideoController | ForEach-Object { $_.AdapterRAM })',
  ], { encoding: 'utf8' });
  if (powershell.status === 0 && !powershell.error) {
    const detected = parseVramBytes(String(powershell.stdout ?? ''));
    if (detected !== null) return detected;
  }
  const wmic = spawnSync('wmic.exe', ['path', 'win32_VideoController', 'get', 'AdapterRAM', '/value'], { encoding: 'utf8' });
  return wmic.status === 0 && !wmic.error ? parseVramBytes(String(wmic.stdout ?? '')) : null;
}

function bundledSmokeTestedFormats(): string[] {
  const reportPath = join(app.getAppPath(), 'assets', 'codec-smoke-report.json');
  if (!existsSync(reportPath)) return [];
  try {
    const report = JSON.parse(readFileSync(reportPath, 'utf8')) as { testedFormats?: unknown };
    return Array.isArray(report.testedFormats) ? report.testedFormats.filter((format): format is string => typeof format === 'string') : [];
  } catch {
    return [];
  }
}

function dbToLinear(db: number | undefined): number {
  const value = db ?? 0;
  if (!Number.isFinite(value)) throw new RangeError('track volume must be finite');
  return Math.pow(10, value / 20);
}

function isAudioTrackAudible(tracks: Track[], trackId: string): boolean {
  const audioTracks = tracks.filter((track) => track.kind === 'audio' || track.kind === 'sfx');
  const solos = audioTracks.filter((track) => track.solo);
  const track = tracks.find((candidate) => candidate.id === trackId);
  if (!track || track.muted) return false;
  return solos.length === 0 || Boolean(track.solo);
}

queue.onEvent((e) => {
  if (e.type === 'progress') win?.webContents.send('job:progress', { name: e.name, fraction: e.fraction });
});

async function createWindow(): Promise<void> {
  if (captureRequest) {
    captureProject = await loadProject(captureRequest.projectPath);
    if (captureRequest.sourceOverride) captureProject.sourcePath = captureRequest.sourceOverride;
  }
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: !captureRequest,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      // Electron's sandboxed preload cannot execute the ESM bundle emitted by electron-vite.
      // The preload still exposes only the explicit contextBridge API below.
      sandbox: false,
      webSecurity: !captureRequest,
    },
  });
  if (captureRequest) {
    win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      console.error(`Player capture did-fail-load: ${errorCode} ${errorDescription} ${validatedURL}`);
    });
    win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      console.error(`Player capture console[${level}] ${sourceId}:${line}: ${message}`);
    });
    win.webContents.on('render-process-gone', (_event, details) => {
      console.error(`Player capture render-process-gone: ${details.reason} ${details.exitCode}`);
    });
  }
  if (captureRequest) win.webContents.once('did-finish-load', () => { void capturePlayerFrames(); });
  if (process.env['ELECTRON_RENDERER_URL']) {
    await win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    await win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function capturePlayerFrames(): Promise<void> {
  if (!win || !captureRequest) return;
  try {
    await mkdir(captureRequest.outputDir, { recursive: true });
    let ready = false;
    for (let attempt = 0; attempt < 300 && !ready; attempt += 1) {
      ready = Boolean(await win.webContents.executeJavaScript('Boolean(window.__autoPodcastPlayerCapture?.ready)'));
      if (!ready) await sleep(200);
    }
    if (!ready) {
      const diagnostic = await win.webContents.executeJavaScript(`JSON.stringify({
        readyState: document.readyState,
        hasApi: Boolean(window.api),
        bodyText: document.body?.innerText?.slice(0, 500) ?? '',
        hasPreview: Boolean(document.querySelector('[data-player-surface]')),
        hasBridge: Boolean(window.__autoPodcastPlayerCapture),
      })`).catch(() => '{}');
      throw new Error(`Player capture bridge did not become ready; diagnostic=${diagnostic}`);
    }
    await sleep(1500);
    const captureInfo = await win.webContents.executeJavaScript('window.__autoPodcastPlayerCapture.info()') as { durationInFrames: number; rect: { x: number; y: number; width: number; height: number } };
    const rect = {
      x: Math.max(0, Math.round(captureInfo.rect.x)),
      y: Math.max(0, Math.round(captureInfo.rect.y)),
      width: Math.max(1, Math.round(captureInfo.rect.width)),
      height: Math.max(1, Math.round(captureInfo.rect.height)),
    };
    const frames: number[] = [];
    const seekStates: Array<{ requestedFrame: number; state: unknown }> = [];
    for (let frame = 0; frame < captureInfo.durationInFrames; frame += captureRequest.frameStep) {
      const seekState = await win.webContents.executeJavaScript(`window.__autoPodcastPlayerCapture.seek(${frame})`);
      if (seekStates.length < 3) seekStates.push({ requestedFrame: frame, state: seekState });
      await sleep(120);
      const image = await win.webContents.capturePage(rect);
      const framePath = join(captureRequest.outputDir, `player-frame-${String(frames.length).padStart(4, '0')}.png`);
      await writeFile(framePath, image.toPNG());
      frames.push(frame);
    }
    await writeFile(join(captureRequest.outputDir, 'manifest.json'), JSON.stringify({
      projectPath: captureRequest.projectPath,
      sourceOverride: captureRequest.sourceOverride ?? null,
      frameStep: captureRequest.frameStep,
      durationInFrames: captureInfo.durationInFrames,
      rect,
      frames,
      seekStates,
      capturedAt: new Date().toISOString(),
    }, null, 2), 'utf8');
    console.log(JSON.stringify({ outputDir: captureRequest.outputDir, frameCount: frames.length, durationInFrames: captureInfo.durationInFrames }));
    app.quit();
  } catch (error) {
    console.error(`Player capture failed: ${error instanceof Error ? error.message : String(error)}`);
    app.exit(1);
  }
}

ipcMain.handle('job:cancel', () => {
  queue.cancelAll();
});

ipcMain.handle('job:reset', () => {
  queue.reset();
});

ipcMain.handle('capture:is-mode', () => Boolean(captureRequest));
ipcMain.handle('capture:project', () => captureProject);

ipcMain.handle('runtime:assets', () => runtimeAssetReport());
ipcMain.handle('runtime:download', (event) => downloadRuntimeAssets((progress) => event.sender.send('runtime:asset-progress', progress)));

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

ipcMain.handle('model:default', () => defaultModelPath());

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

ipcMain.handle('dialog:open-media', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'], filters: [{ name: 'Media', extensions: ['mp4','mov','mkv','webm','wav','mp3','m4a','aac','flac','ogg','opus','png','jpg','jpeg','webp'] }] });
  return result.canceled ? [] : result.filePaths;
});
ipcMain.handle('media:inspect', async (_event, filePath: string) => {
  assertMeaningfulPath(filePath, 'media source');
  const info = await stat(filePath);
  if (!info.isFile()) throw new Error('Nguồn không phải file.');
  const image = ['.png','.jpg','.jpeg','.webp'].includes(extname(filePath).toLowerCase());
  const raw = await new Promise<string>((resolve, reject) => {
    const child = spawn(runtimeBinary('ffprobe'), ['-v','error','-show_format','-show_streams','-of','json',filePath], { windowsHide: true });
    let output = ''; child.stdout.on('data', chunk => { output += String(chunk); });
    child.on('error', reject); child.on('close', code => code === 0 ? resolve(output) : reject(new Error('Không đọc được nguồn.')));
  });
  const metadata = JSON.parse(raw);
  const video = metadata.streams.find((stream: { codec_type: string }) => stream.codec_type === 'video');
  const durationSec = image ? 5 : Number(metadata.format.duration);
  if (!Number.isFinite(durationSec) || durationSec <= 0) throw new Error('Thời lượng nguồn không hợp lệ.');
  return { id: createHash('sha256').update(filePath.toLowerCase()).digest('hex').slice(0,24), path: filePath, kind: image ? 'image' : video ? 'video' : 'audio', durationSec, width: video?.width, height: video?.height, fingerprint: `${info.size}:${info.mtimeMs}` };
});

ipcMain.handle('dialog:open-project', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Auto Podcast project', extensions: ['ape.json'] }],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('dialog:save-project', async (_e, suggestedName: string) => {
  const result = await dialog.showSaveDialog({
    defaultPath: suggestedName.endsWith('.ape.json') ? suggestedName : `${suggestedName}.ape.json`,
    filters: [{ name: 'Auto Podcast project', extensions: ['ape.json'] }],
  });
  return result.canceled ? null : result.filePath;
});

ipcMain.handle('project:load', (_e, filePath: string) => loadProject(filePath));
ipcMain.handle('project:save', (_e, filePath: string, project: Project) => saveProject(filePath, project));

ipcMain.handle('sfx:list', () => {
  const runtimeSfx = join(process.env.LOCALAPPDATA || app.getPath('userData'), 'Auto Podcast Editor', 'runtime', 'sfx');
  const bundledSfx = join(app.getAppPath(), 'assets', 'sfx', 'bundled');
  return listSfx(app.getPath('userData'), existsSync(runtimeSfx) ? runtimeSfx : bundledSfx);
});
ipcMain.handle('sfx:import', (_e, sourcePath: string) => importSfx(app.getPath('userData'), sourcePath));

ipcMain.handle('ffmpeg:capabilities', () => {
  const binary = runtimeBinary('ffmpeg');
  const run = (args: string[]) => String(spawnSync(binary, args, { encoding: 'utf8' }).stdout ?? '');
  return buildCapabilitySnapshot(run(['-hide_banner', '-encoders']), run(['-hide_banner', '-filters']), run(['-hide_banner', '-hwaccels']), detectVramBytes(), bundledSmokeTestedFormats());
});

ipcMain.handle('runtime:doctor', () => {
  const check = (name: string, command: string, args: string[]) => {
    const executable = command.includes('\\') || command.includes('/') ? command : runtimeBinary(command);
    const result = spawnSync(executable, args, { encoding: 'utf8' });
    return { name, ok: result.status === 0 && !result.error, path: executable, error: result.error?.message ?? null };
  };
  const vramBytes = detectVramBytes();
  return {
    ffmpeg: check('FFmpeg', 'ffmpeg', ['-version']),
    ffprobe: check('FFprobe', 'ffprobe', ['-version']),
    whisper: check('Whisper CLI', 'whisper-cli', ['--version']),
    model: { name: 'Whisper base model', ok: Boolean(defaultModelPath()), path: defaultModelPath() },
    localLlm: { name: 'Local LLM', ok: Boolean(defaultLlmModelPath()) && check('llama.cpp', 'llama-cli', ['--version']).ok, path: defaultLlmModelPath() },
    remotion: { name: 'Remotion renderer', ok: Boolean(bundledBrowserPath()), path: bundledBrowserPath() },
    gpu: { name: 'GPU VRAM', ok: vramBytes !== null, vramBytes, llmMode: vramBytes !== null && vramBytes >= 8 * 1024 ** 3 ? 'gpu' : 'rule-based' },
  };
});

ipcMain.handle('media:probe', (_e, filePath: string) =>
  queue.enqueue('probe', async () =>
    runFfprobe(filePath, (cmd, args) => {
      const r = spawnSync(runtimeBinary(cmd), args, { encoding: 'utf8' });
      checkSpawn(cmd, r);
      return { stdout: r.stdout as string };
    }),
  ),
);

ipcMain.handle('media:url', (_e, filePath: string) => {
  if (/^(https?|file):\/\//i.test(filePath)) return filePath;
  return pathToFileURL(filePath).href;
});

ipcMain.handle('media:waveform', (_e, filePath: string) => {
  assertMeaningfulPath(filePath, 'filePath');
  return queue.enqueue('waveform', async (ctx) => {
    const durationSec = await runFfprobe(filePath, (cmd, args) => {
      const r = spawnSync(runtimeBinary(cmd), args, { encoding: 'utf8' });
      checkSpawn(cmd, r);
      return { stdout: r.stdout as string };
    });
    const child = spawn(runtimeBinary('ffmpeg'), buildPeaksArgs(filePath), { stdio: ['ignore', 'pipe', 'pipe'] });
    ctx.onKill(() => child.kill());
    const peaks = await new Promise<number[]>((resolve, reject) => {
      const windowSize = Math.max(1, Math.floor(8000 / 50));
      let pending: Buffer<ArrayBufferLike> = Buffer.alloc(0);
      let sum = 0;
      let count = 0;
      const rmsPeaks: number[] = [];
      child.stdout.on('data', (chunk: Buffer) => {
        const data = pending.length > 0 ? Buffer.concat([pending, chunk]) : chunk;
        const usable = data.length - (data.length % 2);
        for (let offset = 0; offset < usable; offset += 2) {
          const sample = data.readInt16LE(offset) / 32768;
          sum += sample * sample;
          count += 1;
          if (count >= windowSize) {
            rmsPeaks.push(Math.sqrt(sum / count));
            sum = 0;
            count = 0;
          }
        }
        pending = usable < data.length ? data.subarray(usable) : Buffer.alloc(0);
      });
      child.stderr.on('data', () => undefined);
      child.on('error', reject);
      child.on('close', (code) => {
        if (count > 0) rmsPeaks.push(Math.sqrt(sum / count));
        if (code === 0) resolve(rmsPeaks);
        else reject(new Error(`ffmpeg waveform exited with code ${code ?? -1}`));
      });
    });
    ctx.report(1);
    return buildWaveformCacheFromPeaks(peaks, durationSec, 50);
  });
});

ipcMain.handle('audio:preview', (_e, filePath: string, preset: 'none' | 'clean' | 'podcast' | 'broadcast' | 'warm', chain?: AudioChain) => {
  assertMeaningfulPath(filePath, 'filePath');
  return queue.enqueue('audio-preview', async (ctx) => {
    const filter = buildAudioPreviewFilter({ preset, chain });
    const fingerprint = createHash('sha256').update(JSON.stringify({ filePath, preset, chain: chain ?? null })).digest('hex');
    const previewDir = join(app.getPath('userData'), 'audio-preview-cache');
    const outputPath = join(previewDir, `${fingerprint}.wav`);
    await mkdir(previewDir, { recursive: true });
    try {
      const existing = await stat(outputPath);
      if (existing.size > 0) return { path: outputPath, cacheHit: true };
    } catch {
      // Cache miss.
    }
    const args = ['-y', '-i', filePath, '-map', '0:a:0', '-vn'];
    if (filter) args.push('-af', filter);
    args.push('-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', outputPath);
    const ffmpeg = spawnAsync(runtimeBinary('ffmpeg'), args);
    ctx.onKill(ffmpeg.kill);
    checkSpawn('ffmpeg', { status: await ffmpeg.done });
    await assertOutput(outputPath);
    ctx.report(1);
    return { path: outputPath, cacheHit: false };
  });
});

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

ipcMain.handle('ai:command', (_e, text: string, project: Project, cpuOptIn: boolean) => {
  const projectV2 = migrateProject(project);
  const startedAt = Date.now();
  const vram = detectVramBytes();
  const gpuMode = vram !== null && vram >= 8 * 1024 ** 3;
  if (!gpuMode && !cpuOptIn) throw new Error('Local LLM đang ở chế độ giới hạn. Hãy bật CPU LLM thủ công trong cài đặt.');
  const modelPath = defaultLlmModelPath();
  if (!modelPath) throw new Error('Chưa có model local LLM trong gói cài đặt.');
  return queue.enqueue('ai-command', async (ctx) => {
    const binary = runtimeBinary('llama-cli');
    const commands = await runLocalLlm({
      binary,
      modelPath,
      prompt: buildLocalLlmPrompt(text, projectV2),
      deadlineMs: startedAt + 120_000,
      gpuLayers: gpuMode ? 99 : 0,
      onKill: ctx.onKill,
    });
    if (Date.now() > startedAt + 120_000) throw new Error('local LLM timeout');
    return { commands, revision: projectV2.revision ?? 0, mode: gpuMode ? 'gpu' as const : 'cpu' as const };
  });
});

ipcMain.handle('job:render', (_e, project: Project, request: ExportRequest) => {
  validateExportRequest(request);
  return queue.enqueue('render', async (ctx) => {
    const projectV2 = migrateProject(project);
    const safeName = request.fileName.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/\.[^.]+$/, '');
    const outputDir = request.dir;
    await mkdir(outputDir, { recursive: true });
    const extension = extensionForFormat(request.format);
    const outputStem = await chooseCollisionFreeStem(outputDir, safeName, extension);
    const mediaPath = join(outputDir, `${outputStem}${extension}`);
    const basePath = join(outputDir, outputStem);
    const propsPath = join(app.getPath('userData'), 'jobs', `${outputStem}-props.json`);
    await mkdir(join(app.getPath('userData'), 'jobs'), { recursive: true });
    const burnCaptions = request.captions === 'burn' || request.captions === 'both';
    const voiceTrack = projectV2.tracks.find((track) => track.id === 'A1');
    const voiceAudible = isAudioTrackAudible(projectV2.tracks, 'A1');
    const sfx = (project.sfx ?? [])
      .filter((clip) => !clip.muted && isAudioTrackAudible(projectV2.tracks, clip.trackId ?? 'A2'))
      .map((clip) => ({
        ...clip,
        trackId: clip.trackId ?? 'A2',
        volume: clip.volume * dbToLinear(projectV2.tracks.find((track) => track.id === (clip.trackId ?? 'A2'))?.volumeDb),
      }));
    const duckingActive = Boolean(request.target !== 'video-mute' && request.ducking?.enabled && sfx.length > 0);
    const renderProps = buildRenderProps(
      project.sourcePath,
      project.clips,
      burnCaptions ? project.captions : [],
      duckingActive ? [] : sfx,
      project.subtitleStyle ?? 'karaoke',
      projectV2.items,
      projectV2.tracks,
      projectV2.timebase,
      projectV2.assets,
    );
    renderProps.originalAudioVolume = voiceAudible ? dbToLinear(voiceTrack?.volumeDb) : 0;
    renderProps.durationInFrames = timelineDurationFrames({ items: projectV2.items, tracks: projectV2.tracks, clips: projectV2.clips, captions: projectV2.captions, sfx: projectV2.sfx ?? [], timebase: projectV2.timebase });
    await writePropsFile(propsPath, renderProps);
    const compId = compIdForPreset(project.preset);
    const scale = request.quality === '720p' ? 2 / 3 : request.quality === '2k' ? 4 / 3 : request.quality === '4k' ? 2 : request.quality === '8k' ? 4 : 1;
    const advanced = ['mp4-av1', 'mp4-vvc', 'mov-dnxhr', 'mkv-ffv1'].includes(request.format);
    const isAudio = request.target === 'audio';
    const renderPath = isAudio || advanced ? join(app.getPath('userData'), 'jobs', `${outputStem}-intermediate.mp4`) : mediaPath;
    const bitrate = request.bitrateMode === 'custom' && request.customMbps ? `${request.customMbps}M` : undefined;
    const codec = isAudio || advanced ? 'h264' : request.format === 'mp4-hevc' ? 'h265' : request.format === 'webm-vp9' ? 'vp9' : request.format === 'mov-prores' ? 'prores' : 'h264';
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
      width: request.quality === 'custom' ? request.customWidth : undefined,
      height: request.quality === 'custom' ? request.customHeight : undefined,
      onProgress: (fraction) => ctx.report(0.1 + fraction * 0.7),
      onKill: ctx.onKill,
    });
    ctx.report(0.8);

    const audioPlan = buildAudioGraphPlan({
      voiceTrackId: 'A1',
      voicePreset: request.audioBypass ? 'none' : request.voicePreset ?? projectV2.voicePreset ?? 'podcast',
      trackChains: projectV2.audioChains,
    });
    const voiceChain = audioPlan.trackFilters.find((track) => track.trackId === audioPlan.voiceTrackId)?.filter;
    const voiceFilter = [audioPlan.voiceFilter, voiceChain]
      .filter((filter): filter is string => Boolean(filter)).join(',') || null;
    if (duckingActive && request.ducking) {
      const backgroundLabels: string[] = [];
      const filterParts: string[] = [];
      const inputArgs: string[] = [];
      sfx.forEach((clip, index) => {
        inputArgs.push('-i', clip.path);
        const label = `bg${index}`;
        const sourceIn = Math.max(0, clip.sourceIn ?? 0);
        const duration = Math.max(0.01, clip.sourceOut !== undefined ? clip.sourceOut - sourceIn : clip.duration);
        const delayMs = Math.max(0, Math.round(clip.start * 1000));
        const fadeIn = Math.max(0, clip.fadeInSec ?? 0);
        const fadeOut = Math.max(0, clip.fadeOutSec ?? 0);
        const fadeOutStart = Math.max(0, duration - fadeOut);
        filterParts.push(`[${index + 1}:a]atrim=start=${sourceIn}:duration=${duration},asetpts=PTS-STARTPTS,volume=${Math.max(0, clip.volume)},${fadeIn > 0 ? `afade=t=in:st=0:d=${fadeIn},` : ''}${fadeOut > 0 ? `afade=t=out:st=${fadeOutStart}:d=${fadeOut},` : ''}adelay=${delayMs}:all=1[${label}]`);
        backgroundLabels.push(label);
      });
      const mixFilter = buildAudioMixFilter({ voiceLabel: 'voice0', backgroundLabels, ducking: request.ducking, voiceFilter });
      filterParts.unshift('[0:a]anull[voice0]');
      const duckedPath = `${renderPath}.ducked.mp4`;
      const ducked = spawnAsync(runtimeBinary('ffmpeg'), ['-y', '-i', renderPath, ...inputArgs, '-filter_complex', [...filterParts, mixFilter].join(';'), '-map', '0:v:0?', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-shortest', duckedPath]);
      ctx.onKill(ducked.kill);
      checkSpawn('ffmpeg', { status: await ducked.done });
      await rm(renderPath, { force: true });
      await rename(duckedPath, renderPath);
    }

    if (advanced) {
      const transcodeArgs = request.format === 'mp4-av1'
        ? ['-y', '-i', renderPath, '-c:v', 'libsvtav1', '-crf', '30', '-c:a', 'aac', mediaPath]
        : request.format === 'mp4-vvc'
          ? ['-y', '-i', renderPath, '-c:v', 'libvvenc', '-c:a', 'aac', mediaPath]
          : request.format === 'mov-dnxhr'
            ? ['-y', '-i', renderPath, '-c:v', 'dnxhd', '-profile:v', 'dnxhr_hq', '-c:a', 'pcm_s16le', mediaPath]
            : ['-y', '-i', renderPath, '-c:v', 'ffv1', '-level', '3', '-c:a', 'flac', mediaPath];
      const transcoded = spawnAsync(runtimeBinary('ffmpeg'), transcodeArgs);
      ctx.onKill(transcoded.kill);
      checkSpawn('ffmpeg', { status: await transcoded.done });
    }

    if (isAudio) {
      const audioArgs = request.format === 'mp3'
        ? ['-y', '-i', renderPath, '-vn', '-codec:a', 'libmp3lame', '-b:a', '192k', mediaPath]
        : request.format === 'flac'
          ? ['-y', '-i', renderPath, '-vn', '-c:a', 'flac', mediaPath]
          : request.format === 'aac'
            ? ['-y', '-i', renderPath, '-vn', '-c:a', 'aac', '-b:a', '192k', mediaPath]
            : request.format === 'opus'
              ? ['-y', '-i', renderPath, '-vn', '-c:a', 'libopus', '-b:a', '128k', mediaPath]
              : ['-y', '-i', renderPath, '-vn', '-c:a', 'pcm_s16le', mediaPath];
      const audio = spawnAsync(runtimeBinary('ffmpeg'), audioArgs);
      ctx.onKill(audio.kill);
      checkSpawn('ffmpeg', { status: await audio.done });
    }

    if (voiceFilter && !duckingActive && request.target !== 'video-mute') {
      const filteredPath = `${mediaPath}.voice${extension}`;
      const filtered = spawnAsync(runtimeBinary('ffmpeg'), ['-y', '-i', mediaPath, '-map', '0:v:0?', '-map', '0:a:0?', '-c:v', 'copy', '-af', voiceFilter, filteredPath]);
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
