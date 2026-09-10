import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import { JobQueue } from './jobs.js';
import { runFfprobe } from './media.js';
import { spawnSync } from 'node:child_process';

const queue = new JobQueue();

async function createWindow(): Promise<void> {
  const win = new BrowserWindow({ width: 1400, height: 900, webPreferences: { preload: join(__dirname, 'preload.js') } });
  if (process.env['ELECTRON_RENDERER_URL']) await win.loadURL(process.env['ELECTRON_RENDERER_URL']);
}

ipcMain.handle('media:probe', (_e, filePath: string) =>
  queue.enqueue('probe', async () =>
    runFfprobe(filePath, (cmd, args) => ({ stdout: spawnSync(cmd, args, { encoding: 'utf8' }).stdout as string })),
  ),
);

void app.whenReady().then(createWindow);
