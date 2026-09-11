import { app } from 'electron';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { spawn } from 'node:child_process';
import { runtimeAssetPath, requiredRuntimeReady, validateRuntimeManifest, type RuntimeAssetManifest, type RuntimeAssetSpec, type RuntimeAssetState } from '../core/runtimeAssets.js';

export interface RuntimeAssetProgress {
  assetId: string;
  label: string;
  completedBytes: number;
  totalBytes: number;
  assetFraction: number;
  overallFraction: number;
  state: 'downloading' | 'extracting' | 'ready' | 'failed';
  error?: string;
}

let manifestPromise: Promise<RuntimeAssetManifest> | null = null;

function manifestPath(): string {
  return join(app.getAppPath(), 'assets', 'runtime-manifest.json');
}

function localRoot(): string {
  const localAppData = process.env.LOCALAPPDATA || app.getPath('userData');
  return join(localAppData, 'Auto Podcast Editor', 'runtime');
}

export function runtimeRootPath(): string {
  return localRoot();
}

export async function loadRuntimeManifest(): Promise<RuntimeAssetManifest> {
  manifestPromise ??= readFile(manifestPath(), 'utf8').then((raw) => validateRuntimeManifest(JSON.parse(raw)));
  return manifestPromise;
}

function assetInstallPath(asset: RuntimeAssetSpec): string {
  return runtimeAssetPath(localRoot(), asset);
}

function legacyCandidates(asset: RuntimeAssetSpec): string[] {
  const legacyRelative = asset.installPath.replace(/^runtime[/\\]/, '');
  return [
    assetInstallPath(asset),
    join(process.resourcesPath ?? '', legacyRelative),
    join(app.getAppPath(), 'assets', legacyRelative),
  ];
}

function existingAssetPath(asset: RuntimeAssetSpec): string | null {
  return legacyCandidates(asset).find((candidate) => existsSync(candidate)) ?? null;
}

async function isFileReady(asset: RuntimeAssetSpec, path: string): Promise<boolean> {
  try {
    const info = await stat(path);
    if (!info.isFile() || info.size !== asset.bytes) return false;
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
    return hash.digest('hex').toLowerCase() === asset.sha256.toLowerCase();
  } catch {
    return false;
  }
}

async function isDirectoryReady(asset: RuntimeAssetSpec, path: string): Promise<boolean> {
  try {
    const info = await stat(path);
    return info.isDirectory() && existsSync(join(path, asset.entryPath ?? 'READY'));
  } catch {
    return false;
  }
}

export async function runtimeAssetStates(): Promise<RuntimeAssetState[]> {
  const manifest = await loadRuntimeManifest();
  return Promise.all(manifest.assets.map(async (asset) => {
    const path = existingAssetPath(asset) ?? assetInstallPath(asset);
    const ready = asset.kind === 'zip' ? await isDirectoryReady(asset, path) : await isFileReady(asset, path);
    return { ...asset, path, ready };
  }));
}

export async function runtimeAssetReport(): Promise<{ root: string; baseUrlConfigured: boolean; ready: boolean; assets: RuntimeAssetState[] }> {
  const manifest = await loadRuntimeManifest();
  const assets = await runtimeAssetStates();
  return { root: localRoot(), baseUrlConfigured: Boolean(manifest.baseUrl.trim()), ready: requiredRuntimeReady(assets), assets };
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex').toLowerCase();
}

function runPowerShell(script: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script, ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(stderr.trim() || `PowerShell exit ${code ?? -1}`)));
  });
}

async function extractZip(archivePath: string, destination: string): Promise<void> {
  const staging = `${destination}.staging-${randomUUID()}`;
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });
  await runPowerShell('param($archive,$destination); Expand-Archive -LiteralPath $archive -DestinationPath $destination -Force', [archivePath, staging]);
  await rm(destination, { recursive: true, force: true });
  await rename(staging, destination);
  await rm(archivePath, { force: true });
  await import('node:fs/promises').then(({ writeFile }) => writeFile(join(destination, 'READY'), new Date().toISOString(), 'utf8'));
}

interface RemoteDownload {
  id: string;
  label: string;
  remotePath: string;
  bytes: number;
  sha256: string;
  destination: string;
}

async function downloadRemoteFile(download: RemoteDownload, baseUrl: string, onProgress: (completedBytes: number, totalBytes: number) => void): Promise<string> {
  const destination = download.destination;
  const tempPath = `${destination}.part`;
  await mkdir(dirname(destination), { recursive: true });
  let downloaded = 0;
  try { downloaded = (await stat(tempPath)).size; } catch { downloaded = 0; }
  const headers: Record<string, string> = downloaded > 0 ? { Range: `bytes=${downloaded}-` } : {};
  const response = await fetch(new URL(download.remotePath.replace(/^[/\\]+/, ''), `${baseUrl.trim().replace(/[/\\]+$/, '')}/`), { headers, redirect: 'follow' });
  if (!response.ok && response.status !== 206) throw new Error(`Tải ${download.label} thất bại: HTTP ${response.status}`);
  const append = downloaded > 0 && response.status === 206;
  if (!append) downloaded = 0;
  const totalBytes = download.bytes;
  if (!response.body) throw new Error(`Máy chủ không trả dữ liệu cho ${download.label}`);
  const stream = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
  let received = downloaded;
  stream.on('data', (chunk) => {
    received += Buffer.byteLength(chunk);
    onProgress(received, totalBytes);
  });
  await pipeline(stream, (await import('node:fs')).createWriteStream(tempPath, { flags: append ? 'a' : 'w' }));
  if ((await stat(tempPath)).size !== download.bytes) throw new Error(`Kích thước ${download.label} không khớp manifest`);
  if ((await sha256File(tempPath)) !== download.sha256.toLowerCase()) throw new Error(`SHA-256 ${download.label} không khớp manifest`);
  await rename(tempPath, destination);
  return destination;
}

async function downloadFile(asset: RuntimeAssetSpec, baseUrl: string, onProgress: (progress: RuntimeAssetProgress) => void): Promise<string> {
  const destination = asset.kind === 'zip' ? join(localRoot(), 'downloads', `${asset.id}.zip`) : assetInstallPath(asset);
  return downloadRemoteFile({ id: asset.id, label: asset.label, remotePath: asset.remotePath, bytes: asset.bytes, sha256: asset.sha256, destination }, baseUrl, (completedBytes, totalBytes) => {
    onProgress({ assetId: asset.id, label: asset.label, completedBytes, totalBytes, assetFraction: Math.min(1, completedBytes / Math.max(1, totalBytes)), overallFraction: 0, state: 'downloading' });
  });
}

async function downloadSplitFile(asset: RuntimeAssetSpec, baseUrl: string, onProgress: (progress: RuntimeAssetProgress) => void): Promise<string> {
  if (!asset.parts?.length) throw new Error(`Runtime asset split-file thiếu parts: ${asset.id}`);
  const destination = assetInstallPath(asset);
  const staging = `${destination}.assembling-${randomUUID()}`;
  await mkdir(dirname(destination), { recursive: true });
  await rm(staging, { force: true });
  let completedBytes = 0;
  for (let index = 0; index < asset.parts.length; index += 1) {
    const part = asset.parts[index];
    const partPath = join(localRoot(), 'downloads', `${asset.id}.part${String(index + 1).padStart(3, '0')}`);
    await downloadRemoteFile({ id: `${asset.id}-${index + 1}`, label: `${asset.label} (${index + 1}/${asset.parts.length})`, remotePath: part.remotePath, bytes: part.bytes, sha256: part.sha256, destination: partPath }, baseUrl, (partCompleted) => {
      const current = completedBytes + partCompleted;
      onProgress({ assetId: asset.id, label: asset.label, completedBytes: current, totalBytes: asset.bytes, assetFraction: Math.min(1, current / Math.max(1, asset.bytes)), overallFraction: 0, state: 'downloading' });
    });
    await pipeline(createReadStream(partPath), (await import('node:fs')).createWriteStream(staging, { flags: 'a' }));
    await rm(partPath, { force: true });
    completedBytes += part.bytes;
  }
  if ((await stat(staging)).size !== asset.bytes) throw new Error(`Kích thước ${asset.label} sau ghép không khớp manifest`);
  if ((await sha256File(staging)) !== asset.sha256.toLowerCase()) throw new Error(`SHA-256 ${asset.label} sau ghép không khớp manifest`);
  await rename(staging, destination);
  return destination;
}

export async function downloadRuntimeAssets(onProgress: (progress: RuntimeAssetProgress) => void): Promise<Awaited<ReturnType<typeof runtimeAssetReport>>> {
  const manifest = await loadRuntimeManifest();
  const states = await runtimeAssetStates();
  const pending = states.filter((asset) => !asset.ready);
  const totalBytes = pending.reduce((sum, asset) => sum + asset.bytes, 0);
  let completedBytes = 0;
  for (const asset of pending) {
    try {
      onProgress({ assetId: asset.id, label: asset.label, completedBytes, totalBytes, assetFraction: 0, overallFraction: completedBytes / Math.max(1, totalBytes), state: 'downloading' });
      const downloadedPath = asset.kind === 'split-file'
        ? await downloadSplitFile(asset, manifest.baseUrl, (progress) => onProgress({ ...progress, overallFraction: (completedBytes + progress.completedBytes) / Math.max(1, totalBytes) }))
        : await downloadFile(asset, manifest.baseUrl, (progress) => onProgress({ ...progress, overallFraction: (completedBytes + progress.completedBytes) / Math.max(1, totalBytes) }));
      if (asset.kind === 'zip') {
        onProgress({ assetId: asset.id, label: asset.label, completedBytes: asset.bytes, totalBytes: asset.bytes, assetFraction: 1, overallFraction: (completedBytes + asset.bytes) / Math.max(1, totalBytes), state: 'extracting' });
        await extractZip(downloadedPath, assetInstallPath(asset));
      }
      completedBytes += asset.bytes;
      onProgress({ assetId: asset.id, label: asset.label, completedBytes, totalBytes, assetFraction: 1, overallFraction: completedBytes / Math.max(1, totalBytes), state: 'ready' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onProgress({ assetId: asset.id, label: asset.label, completedBytes, totalBytes, assetFraction: 0, overallFraction: completedBytes / Math.max(1, totalBytes), state: 'failed', error: message });
      throw new Error(`${asset.label}: ${message}`);
    }
  }
  return runtimeAssetReport();
}

export function runtimePathForId(id: string): string | null {
  const known: Record<string, string> = {
    ffmpeg: join('bin', 'ffmpeg.exe'),
    ffprobe: join('bin', 'ffprobe.exe'),
    'whisper-cli': join('bin', 'whisper-cli.exe'),
    'llama-cli': join('bin', 'llm', 'llama-cli.exe'),
    'whisper-base': join('models', 'ggml-base.bin'),
    'llm-model': join('models', 'Qwen3-4B-Q4_K_M.gguf'),
    'remotion-browser': join('remotion-browser', 'chrome-headless-shell.exe'),
  };
  const relativePath = known[id];
  if (!relativePath) return null;
  const path = join(localRoot(), relativePath);
  return existsSync(path) ? path : null;
}

export function runtimeBrowserPath(): string | null {
  return runtimePathForId('remotion-browser');
}
