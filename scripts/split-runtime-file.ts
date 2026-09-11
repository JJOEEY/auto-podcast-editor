import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';

const root = resolve(process.cwd());
const source = resolve(root, process.env.RUNTIME_SPLIT_SOURCE ?? 'assets/models/Qwen3-4B-Q4_K_M.gguf');
const outputDir = resolve(root, process.env.RUNTIME_SPLIT_OUTPUT ?? 'runtime-payload');
const partSize = Number(process.env.RUNTIME_SPLIT_PART_BYTES ?? 1_900_000_000);

if (!Number.isSafeInteger(partSize) || partSize < 1_000_000) throw new Error('RUNTIME_SPLIT_PART_BYTES không hợp lệ');
const sourceInfo = await stat(source);
await mkdir(outputDir, { recursive: true });
const stem = basename(source);
const oldParts = (await import('node:fs/promises')).readdir(outputDir).then((names) => names.filter((name) => name.startsWith(`${stem}.part`)));
for (const name of await oldParts) await rm(join(outputDir, name), { force: true });

const parts: Array<{ file: string; bytes: number; sha256: string }> = [];
let offset = 0;
let index = 1;
while (offset < sourceInfo.size) {
  const end = Math.min(sourceInfo.size, offset + partSize);
  const file = `${stem}.part${String(index).padStart(3, '0')}`;
  const output = join(outputDir, file);
  await pipeline(createReadStream(source, { start: offset, end: end - 1 }), createWriteStream(output));
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(output)) hash.update(chunk as Buffer);
  parts.push({ file, bytes: end - offset, sha256: hash.digest('hex') });
  offset = end;
  index += 1;
}

const fullHash = createHash('sha256');
for await (const chunk of createReadStream(source)) fullHash.update(chunk as Buffer);
console.log(JSON.stringify({ source, bytes: sourceInfo.size, sha256: fullHash.digest('hex'), parts }, null, 2));
