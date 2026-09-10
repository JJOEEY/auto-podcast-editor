import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import { JobQueue } from './jobs.js';
import { runFfprobe } from './media.js';
import { spawnSync } from 'node:child_process';
import { buildAudioExtractArgs } from './media.js';
import { buildWhisperArgs, whisperJsonPath } from './whisper.js';
import { buildRemotionRenderArgs, buildRenderOutputs } from './render.js';

const queue = new JobQueue();

async function createWindow(): Promise<void> {
  const win = new BrowserWindow({ width: 1400, height: 900, webPreferences: { preload: join(__dirname, '../preload/index.mjs') } });
  if (process.env['ELECTRON_RENDERER_URL']) await win.loadURL(process.env['ELECTRON_RENDERER_URL']);
}

ipcMain.handle('media:probe', (_e, filePath: string) =>
  queue.enqueue('probe', async () =>
    runFfprobe(filePath, (cmd, args) => ({ stdout: spawnSync(cmd, args, { encoding: 'utf8' }).stdout as string })),
  ),
);

ipcMain.handle('ai:transcribe', (_e, filePath: string, workDir: string, modelPath: string) =>
  queue.enqueue('transcribe', async () => {
    const wav = `${workDir}/audio16k.wav`;
    spawnSync('ffmpeg', buildAudioExtractArgs(filePath, wav), { stdio: 'ignore' });
    const outBase = `${workDir}/transcript`;
    spawnSync('whisper-cli', buildWhisperArgs(modelPath, wav, outBase), { stdio: 'ignore' });
    return whisperJsonPath(outBase);
  }),
);

ipcMain.handle('job:render', (_e, projectPath: string, preset: 'vertical' | 'horizontal', propsPath: string) =>
  queue.enqueue('render', async () => {
    const out = buildRenderOutputs(projectPath, preset);
    spawnSync('npx', buildRemotionRenderArgs('PodcastVertical', out.mp4, propsPath), { stdio: 'inherit' });
    return out;
  }),
);

void app.whenReady().then(createWindow);
