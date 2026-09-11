import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd());
const electron = resolve(root, 'node_modules/electron/dist/electron.exe');
const ffmpeg = resolve(root, 'assets/bin/ffmpeg.exe');

function option(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

function run(command: string, args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stdout.on('data', (chunk) => process.stdout.write(String(chunk)));
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', reject);
    child.on('close', (code) => resolveRun({ code: code ?? -1, stderr }));
  });
}

async function assertFile(filePath: string): Promise<void> {
  const info = await stat(filePath);
  if (info.size <= 0) throw new Error(`empty artifact: ${filePath}`);
}

async function main(): Promise<void> {
  const projectPath = resolve(option('--project') ?? '');
  const reference = resolve(option('--reference') ?? '');
  const outputDir = resolve(option('--out', 'qa/player-golden') as string);
  const frameStep = Number(option('--frame-step', '10'));
  const sourceOverride = option('--source-override');
  if (!projectPath || !reference || !Number.isInteger(frameStep) || frameStep <= 0) {
    throw new Error('Usage: npm run golden:player -- --project project.json --reference export.mp4 --out qa/player-golden [--source-override proxy.mp4]');
  }
  await mkdir(outputDir, { recursive: true });
  const capture = await run(electron, [
    join(root, 'out/main/index.js'),
    '--player-capture', projectPath, outputDir, String(frameStep), ...(sourceOverride ? [resolve(sourceOverride)] : []),
  ]);
  if (capture.code !== 0) throw new Error(`Electron Player capture failed (${capture.code}): ${capture.stderr.slice(-1500)}`);
  const manifest = JSON.parse(await readFile(join(outputDir, 'manifest.json'), 'utf8')) as { frames: number[] };
  if (!Array.isArray(manifest.frames) || manifest.frames.length === 0) throw new Error('Player capture produced no frames');
  const playerVideo = join(outputDir, 'player-sampled.mp4');
  const referenceVideo = join(outputDir, 'reference-sampled.mp4');
  const fps = 30 / frameStep;
  const playerVideoResult = await run(ffmpeg, [
    '-y', '-v', 'error', '-framerate', String(fps), '-i', join(outputDir, 'player-frame-%04d.png'),
    '-vf', 'scale=480:270:flags=lanczos', '-frames:v', String(manifest.frames.length), '-an',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', String(fps), playerVideo,
  ]);
  if (playerVideoResult.code !== 0) throw new Error(`Player video assembly failed: ${playerVideoResult.stderr.slice(-1500)}`);
  const referenceVideoResult = await run(ffmpeg, [
    '-y', '-v', 'error', '-i', reference, '-vf', `fps=${fps},scale=480:270:flags=lanczos`,
    '-frames:v', String(manifest.frames.length), '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', String(fps), referenceVideo,
  ]);
  if (referenceVideoResult.code !== 0) throw new Error(`Reference sampling failed: ${referenceVideoResult.stderr.slice(-1500)}`);
  await assertFile(playerVideo);
  await assertFile(referenceVideo);
  const report = join(outputDir, 'report.json');
  const compare = await run(process.execPath, [
    '--experimental-strip-types', join(root, 'scripts/compare-golden-video.ts'),
    '--reference', referenceVideo, '--candidate', playerVideo, '--ffmpeg', ffmpeg, '--min-ssim', '0.98', '--report', report,
  ]);
  if (compare.code !== 0) throw new Error(`Player/export golden gate failed (${compare.code}): ${compare.stderr.slice(-1500)}`);
  console.log(JSON.stringify({ passed: true, projectPath, reference, outputDir, frameCount: manifest.frames.length, frameStep, fps, report }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
