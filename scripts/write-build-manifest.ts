import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

const root = resolve(process.cwd());
const output = join(root, 'assets', 'build-manifest.json');
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as { version: string };
const includeRoots = ['package.json', 'package-lock.json', 'core', 'electron', 'src', 'assets'];
const excluded = new Set(['assets/build-manifest.json']);

async function filesIn(path: string): Promise<string[]> {
  const absolute = join(root, path);
  const info = await stat(absolute);
  if (info.isFile()) return [path];
  const entries = await readdir(absolute, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) files.push(...await filesIn(child));
    else files.push(child);
  }
  return files;
}

const files = (await Promise.all(includeRoots.map(filesIn))).flat().filter((file) => !excluded.has(file)).sort();
const hash = createHash('sha256');
const entries: Array<{ path: string; sha256: string; bytes: number }> = [];
for (const file of files) {
  const absolute = join(root, file);
  const fileInfo = await stat(absolute);
  const fileHash = createHash('sha256');
  await new Promise<void>((resolvePromise, reject) => {
    const stream = createReadStream(absolute);
    stream.on('data', (chunk) => { fileHash.update(chunk); hash.update(chunk); });
    stream.on('error', reject);
    stream.on('end', () => resolvePromise());
  });
  const digest = fileHash.digest('hex');
  entries.push({ path: relative(root, absolute).replaceAll('\\', '/'), sha256: digest, bytes: fileInfo.size });
  hash.update(file).update('\0');
}
const manifest = { schema: 1, version: packageJson.version, buildId: hash.digest('hex').slice(0, 24), generatedAt: new Date().toISOString(), files: entries };
await writeFile(output, JSON.stringify(manifest, null, 2), 'utf8');
console.log(JSON.stringify({ version: manifest.version, buildId: manifest.buildId, fileCount: entries.length, output }, null, 2));
