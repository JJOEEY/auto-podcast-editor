import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { basename, extname, join } from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { JobQueue } from './jobs.js';
import { spawnSync } from 'node:child_process';
import { buildAudioExtractArgs, runFfprobe } from './media.js';
import { buildWhisperArgs, parseProgressLine, whisperJsonPath } from './whisper.js';
import { parseWhisperJson } from '../core/whisperJson.js';
import { spawnAsync } from './spawnAsync.js';
import { assertMeaningfulPath } from './paths.js';
import { buildRemotionRenderArgs, buildRenderOutputs, checkSpawn, compIdForPreset } from './render.js';

const queue = new JobQueue();
let win: BrowserWindow | null = null;

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

ipcMain.handle('media:probe', (_e, filePath: string) =>
  queue.enqueue('probe', async () =>
    runFfprobe(filePath, (cmd, args) => {
      const r = spawnSync(cmd, args, { encoding: 'utf8' });
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
    const ffmpeg = spawnAsync('ffmpeg', buildAudioExtractArgs(filePath, wav));
    ctx.onKill(ffmpeg.kill);
    checkSpawn('ffmpeg', { status: await ffmpeg.done });
    ctx.report(0.05);

    const outBase = join(workDir, 'transcript');
    const whisper = spawnAsync('whisper-cli', buildWhisperArgs(modelPath, wav, outBase), {
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

ipcMain.handle('job:render', (_e, projectPath: string, preset: 'vertical' | 'horizontal', propsPath: string) =>
  queue.enqueue('render', async () => {
    const out = buildRenderOutputs(projectPath, preset);
    const compId = compIdForPreset(preset);
    const rendered = spawnSync('npx', buildRemotionRenderArgs(compId, out.mp4, propsPath), { stdio: 'inherit' });
    checkSpawn('remotion', rendered);
    return out;
  }),
);

void app.whenReady().then(createWindow);
