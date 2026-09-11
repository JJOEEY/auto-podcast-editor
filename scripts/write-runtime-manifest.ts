import { createHash } from 'node:crypto';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createReadStream as openReadStream } from 'node:fs';

const root = resolve(process.cwd());
const payloadRoot = resolve(root, process.env.RUNTIME_PAYLOAD_DIR ?? 'runtime-payload');
const output = resolve(root, 'assets/runtime-manifest.json');
const baseUrl = (process.env.RUNTIME_ASSET_BASE_URL ?? '').trim();
const version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as { version: string };
const remotePrefix = process.env.RUNTIME_ASSET_REMOTE_PREFIX === undefined
  ? `runtime/${version.version}`
  : process.env.RUNTIME_ASSET_REMOTE_PREFIX.trim().replace(/^[/\\]+|[/\\]+$/g, '');
const remotePath = (file: string) => [remotePrefix, file].filter(Boolean).join('/');

async function digest(path: string): Promise<{ bytes: number; sha256: string }> {
  const info = await stat(path);
  const hash = createHash('sha256');
  await new Promise<void>((resolvePromise, reject) => {
    const stream = openReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolvePromise);
  });
  return { bytes: info.size, sha256: hash.digest('hex') };
}

const zipDefinitions = [
  { id: 'core-runtime', label: 'FFmpeg, FFprobe, Whisper và llama.cpp', file: 'core-runtime.zip', installPath: 'bin', entryPath: 'ffmpeg.exe' },
  { id: 'remotion-browser', label: 'Remotion browser', file: 'remotion-browser.zip', installPath: 'remotion-browser', entryPath: 'chrome-headless-shell.exe' },
  { id: 'sfx-library', label: 'SFX bundled', file: 'sfx.zip', installPath: 'sfx', entryPath: 'whoosh.wav' },
] as const;

const assets: Array<Record<string, unknown>> = [];
for (const definition of zipDefinitions) {
  const info = await digest(join(payloadRoot, definition.file));
  assets.push({ id: definition.id, label: definition.label, kind: 'zip', remotePath: remotePath(definition.file), installPath: definition.installPath, entryPath: definition.entryPath, ...info, required: true });
}

const whisperPath = join(root, 'assets/models/ggml-base.bin');
assets.push({ id: 'whisper-base', label: 'Whisper base tiếng Việt', kind: 'file', remotePath: remotePath('ggml-base.bin'), installPath: 'models/ggml-base.bin', ...(await digest(whisperPath)), required: true });

const qwenFile = 'Qwen3-4B-Q4_K_M.gguf';
const qwenPath = join(root, 'assets/models', qwenFile);
const qwenInfo = await digest(qwenPath);
const partFiles = (await readdir(payloadRoot)).filter((name) => name.startsWith(`${qwenFile}.part`)).sort();
if (partFiles.length < 2) throw new Error(`Thiếu parts của ${qwenFile}; hãy chạy npm run runtime:split trước`);
const parts = [];
for (const file of partFiles) parts.push({ remotePath: remotePath(file), ...(await digest(join(payloadRoot, file))) });
if (parts.reduce((sum, part) => sum + part.bytes, 0) !== qwenInfo.bytes) throw new Error('Tổng kích thước Qwen parts không khớp file gốc');
assets.push({ id: 'llm-model', label: 'Qwen local LLM', kind: 'split-file', remotePath: remotePath(qwenFile), installPath: `models/${qwenFile}`, parts, ...qwenInfo, required: true });

await writeFile(output, JSON.stringify({ schema: 1, version: version.version, baseUrl, assets }, null, 2), 'utf8');
console.log(JSON.stringify({ output, baseUrlConfigured: Boolean(baseUrl), remotePrefix, assets: assets.length, qwenParts: parts.length }, null, 2));
