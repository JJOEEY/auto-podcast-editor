import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import { JobQueue } from './jobs.js';
import { spawnSync } from 'node:child_process';
import { buildAudioExtractArgs, runFfprobe } from './media.js';
import { buildWhisperArgs, whisperJsonPath } from './whisper.js';
import { buildRemotionRenderArgs, buildRenderOutputs, checkSpawn, compIdForPreset } from './render.js';

const queue = new JobQueue();

async function createWindow(): Promise<void> {
  const win = new BrowserWindow({ width: 1400, height: 900, webPreferences: { preload: join(__dirname, '../preload/index.mjs') } });
  if (process.env['ELECTRON_RENDERER_URL']) await win.loadURL(process.env['ELECTRON_RENDERER_URL']);
}

ipcMain.handle('media:probe', (_e, filePath: string) =>
  queue.enqueue('probe', async () =>
    runFfprobe(filePath, (cmd, args) => {
      const r = spawnSync(cmd, args, { encoding: 'utf8' });
      checkSpawn(cmd, r);
      return { stdout: r.stdout as string };
    }),
  ),
);

ipcMain.handle('ai:transcribe', (_e, filePath: string, workDir: string, modelPath: string) =>
  queue.enqueue('transcribe', async () => {
    const wav = `${workDir}/audio16k.wav`;
    const ffmpeg = spawnSync('ffmpeg', buildAudioExtractArgs(filePath, wav), { stdio: 'ignore' });
    checkSpawn('ffmpeg', ffmpeg);
    const outBase = `${workDir}/transcript`;
    const whisper = spawnSync('whisper-cli', buildWhisperArgs(modelPath, wav, outBase), { stdio: 'ignore' });
    checkSpawn('whisper-cli', whisper);
    return whisperJsonPath(outBase);
  }),
);

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
