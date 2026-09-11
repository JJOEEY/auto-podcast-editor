import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { spawn } from 'node:child_process';
import { DEFAULT_PERFORMANCE_THRESHOLDS, evaluatePerformanceGate, type PerformanceSample } from '../core/performance.ts';
import { createDefaultSettings } from '../core/defaults.ts';
import { createState, reduce } from '../src/state/reducer.ts';
import type { Clip, Project } from '../core/types.ts';

const root = resolve(process.cwd());
const ffmpeg = resolve(root, 'assets/bin/ffmpeg.exe');

function option(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

function run(command: string, args: string[], logPath: string): Promise<{ code: number; elapsedSec: number; stderr: string }> {
  return new Promise((resolveRun, reject) => {
    const started = performance.now();
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', reject);
    child.on('close', async (code) => {
      await writeFile(logPath, stderr, 'utf8');
      resolveRun({ code: code ?? -1, elapsedSec: (performance.now() - started) / 1000, stderr });
    });
  });
}

async function assertFile(filePath: string): Promise<void> {
  const info = await stat(filePath);
  if (info.size <= 0) throw new Error(`empty output: ${filePath}`);
}

async function measureTimelineP95(): Promise<number> {
  const base = createState({ name: 'performance', sourcePath: 'fixture.mp4', durationSec: 3600, preset: 'horizontal', settings: createDefaultSettings() });
  const clips: Clip[] = Array.from({ length: 120 }, (_, index) => ({
    id: `clip-${index}`,
    track: 'V1',
    start: index * 30,
    end: index * 30 + 20,
    label: `clip-${index}`,
  }));
  let state = reduce(base, { type: 'apply-auto-cuts', clips });
  const samples: number[] = [];
  for (let index = 0; index < 1000; index += 1) {
    const started = performance.now();
    state = reduce(state, { type: 'move-clip', id: `clip-${index % clips.length}`, delta: 1 / 30 });
    samples.push(performance.now() - started);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.95))];
}

async function measureFixture(fixtureId: string, inputPath: string, outputRoot: string): Promise<Record<string, unknown>> {
  const fixtureRoot = join(outputRoot, fixtureId);
  await mkdir(fixtureRoot, { recursive: true });
  const preview = await run(ffmpeg, [
    '-v', 'error', '-ss', '0', '-t', '60', '-i', inputPath,
    '-vf', 'scale=1280:-2', '-an', '-f', 'null', 'NUL',
  ], join(fixtureRoot, 'preview-throughput.log'));
  if (preview.code !== 0) throw new Error(`preview throughput failed: ${preview.stderr.slice(-1200)}`);
  const previewFps = 60 * 30 / preview.elapsedSec;
  const exportPath = join(fixtureRoot, 'export-10min-4k-h264.mp4');
  const exportResult = await run(ffmpeg, [
    '-y', '-v', 'error', '-ss', '0', '-t', '600', '-i', inputPath,
    '-map', '0:v:0', '-map', '0:a:0?',
    '-vf', 'scale=3840:2160:force_original_aspect_ratio=decrease,pad=3840:2160:(ow-iw)/2:(oh-ih)/2',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', exportPath,
  ], join(fixtureRoot, 'export-4k.log'));
  if (exportResult.code !== 0) throw new Error(`4K export failed: ${exportResult.stderr.slice(-1200)}`);
  const export4k10MinSec = exportResult.elapsedSec;
  await assertFile(exportPath);
  const timelineP95Ms = await measureTimelineP95();
  const sample: PerformanceSample = {
    fixtureId,
    whisper60MinSec: Number.NaN,
    previewFps,
    export4k10MinSec,
    timelineP95Ms,
    stabilityHours: Number.NaN,
  };
  return {
    fixtureId,
    inputPath,
    exportPath,
    measured: sample,
    methods: {
      preview: 'FFmpeg decode/scale of 60 seconds to 1280px width; Player capture still separate.',
      export: 'FFmpeg encode of the first 10 minutes at 3840x2160 H.264 from the real fixture; this measures export backend, not Player UI.',
      timeline: '1000 reducer edits on a 120-clip project; p95 of individual move-clip calls.',
      stability: 'not run; requires a real 2-hour unattended session.',
    },
    elapsedSec: { preview: preview.elapsedSec, export4k10Min: export4k10MinSec },
  };
}

async function main(): Promise<void> {
  const fixtureId = option('--fixture', 'slow-camera-mic') as string;
  const fixturePath = resolve(option('--media', join('qa/product-candidate/fixtures', fixtureId, 'media.mp4')) as string);
  const outputRoot = resolve(option('--out', 'qa/product-candidate/performance') as string);
  await mkdir(outputRoot, { recursive: true });
  const detail = await measureFixture(fixtureId, fixturePath, outputRoot);
  let previousDetails: Array<Record<string, unknown>> = [];
  try {
    const previous = JSON.parse(await readFile(join(outputRoot, 'report.json'), 'utf8')) as { fixtureResults?: Array<Record<string, unknown>> };
    previousDetails = (previous.fixtureResults ?? []).filter((item) => item.fixtureId !== fixtureId);
  } catch {
    // First performance fixture.
  }
  const fixtureResults = [...previousDetails, detail];
  const measured = fixtureResults.map((item) => item.measured as PerformanceSample);
  const result = {
    generatedAt: new Date().toISOString(),
    machine: { cpu: 'current host', gpu: 'NVIDIA GeForce RTX 2060', vramGiB: 4, ramGiB: 16 },
    thresholds: DEFAULT_PERFORMANCE_THRESHOLDS,
    fixtureResults,
    gate: evaluatePerformanceGate(measured),
    note: 'NaN metrics are intentionally serialized as null and fail closed; add real Whisper/stability measurements before release.',
  };
  await writeFile(join(outputRoot, 'report.json'), JSON.stringify(result, (_key, value) => typeof value === 'number' && !Number.isFinite(value) ? null : value, 2), 'utf8');
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(`Performance gate failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
