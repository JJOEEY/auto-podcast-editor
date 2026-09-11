import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { benchmarkWhisperWords, type BenchmarkWord, type FillerEvent } from '../core/whisperBenchmark.ts';
import { parseWhisperJsonWithStats } from '../core/whisperJson.ts';
import { DEFAULT_WHISPER_PROFILES, resolveWhisperProfile, type WhisperProfile } from '../core/whisperProfiles.ts';
import type { Word } from '../core/types.ts';

const MEDIA_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.wav', '.mp3', '.m4a', '.flac']);
const MIN_FIXTURES = 3;
const MIN_DURATION_SEC = 30 * 60;

interface GroundTruth {
  fixtureId?: string;
  durationSec?: number;
  words: BenchmarkWord[];
  fillers: FillerEvent[];
}

interface Fixture {
  id: string;
  mediaPath: string;
  groundTruthPath?: string;
  groundTruth?: GroundTruth;
  durationSec: number;
}

function argValue(args: string[], name: string, fallback: string): string {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function normalizeWord(text: string): string {
  return text.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, '');
}

function fillerProposals(words: Word[]): Array<FillerEvent & { confidence: number }> {
  const lexicon = new Set(['ừm', 'ừ', 'à', 'ờ', 'ơ', 'nhỉ', 'um', 'uh', 'ờm']);
  return words
    .filter((word) => lexicon.has(normalizeWord(word.text)) && word.end - word.start <= 1)
    .map((word) => ({ startSec: word.start, endSec: word.end, text: word.text, confidence: 0.85 }));
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    // Whisper writes progress to stdout. Consume it even when the benchmark
    // does not need to display it, otherwise the pipe can fill on long audio
    // and block the child process indefinitely.
    child.stdout.on('data', () => {});
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolveRun() : reject(new Error(`${basename(command)} thất bại (${code ?? -1}): ${stderr.slice(-1000)}`)));
  });
}

async function probeDuration(ffprobe: string, filePath: string): Promise<number> {
  return new Promise((resolveProbe, reject) => {
    const child = spawn(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', reject);
    child.on('close', (code) => {
      const duration = Number(stdout.trim());
      if (code !== 0 || !Number.isFinite(duration)) reject(new Error(`Không đọc được duration của ${filePath}: ${stderr.slice(-500)}`));
      else resolveProbe(duration);
    });
  });
}

async function loadFixtures(fixturesRoot: string, ffprobe: string, preliminary: boolean): Promise<Fixture[]> {
  const entries = await readdir(fixturesRoot, { withFileTypes: true });
  const fixtures: Fixture[] = [];
  for (const entry of entries.filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const directory = join(fixturesRoot, entry.name);
    const files = await readdir(directory);
    const mediaName = files.find((file) => MEDIA_EXTENSIONS.has(extname(file).toLowerCase()));
    const groundTruthPath = join(directory, 'ground-truth.json');
    if (!mediaName) throw new Error(`Fixture ${entry.name} thiếu media file`);
    let groundTruth: GroundTruth | undefined;
    try {
      groundTruth = JSON.parse(await readFile(groundTruthPath, 'utf8')) as GroundTruth;
      if (!Array.isArray(groundTruth.words) || !Array.isArray(groundTruth.fillers)) throw new Error(`Fixture ${entry.name} thiếu words/fillers trong ground-truth.json`);
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
      if (!preliminary || code !== 'ENOENT') throw error;
    }
    const mediaPath = join(directory, mediaName);
    const durationSec = await probeDuration(ffprobe, mediaPath);
    if (durationSec < MIN_DURATION_SEC) throw new Error(`Fixture ${entry.name} chỉ dài ${durationSec.toFixed(1)}s; cần tối thiểu 1800s`);
    fixtures.push({ id: entry.name, mediaPath, groundTruthPath: groundTruth ? groundTruthPath : undefined, groundTruth, durationSec });
  }
  const minimum = preliminary ? 2 : MIN_FIXTURES;
  if (fixtures.length < minimum) throw new Error(`Cần tối thiểu ${minimum} fixture; hiện có ${fixtures.length}`);
  return fixtures;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const root = resolve(argValue(args, '--root', process.cwd()));
  const fixturesRoot = resolve(root, argValue(args, '--fixtures', 'qa/whisper-fixtures'));
  const modelsRoot = resolve(root, argValue(args, '--models', 'assets/models'));
  const outputRoot = resolve(root, argValue(args, '--out', 'qa/whisper-results'));
  const preliminary = args.includes('--preliminary');
  const profileIds = argValue(args, '--tiers', DEFAULT_WHISPER_PROFILES.join(',')).split(',').map((tier) => tier.trim()).filter(Boolean);
  const profiles: WhisperProfile[] = profileIds.map(resolveWhisperProfile);
  const whisper = resolve(root, argValue(args, '--whisper', 'assets/bin/whisper-cli.exe'));
  const ffmpeg = resolve(root, argValue(args, '--ffmpeg', 'assets/bin/ffmpeg.exe'));
  const ffprobe = resolve(root, argValue(args, '--ffprobe', 'assets/bin/ffprobe.exe'));
  const fixtures = await loadFixtures(fixturesRoot, ffprobe, preliminary);
  for (const profile of profiles) {
    const model = resolve(modelsRoot, `ggml-${profile.modelTier}.bin`);
    try { await stat(model); } catch { throw new Error(`Thiếu model cho profile ${profile.id}: ${model}`); }
  }
  await mkdir(outputRoot, { recursive: true });
  const workRoot = await import('node:fs/promises').then(({ mkdtemp }) => mkdtemp(join(tmpdir(), 'ape-whisper-benchmark-')));
  const report: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    mode: preliminary ? 'preliminary' : 'official',
    groundTruthRequired: !preliminary,
    fixtures: fixtures.map((fixture) => ({ id: fixture.id, mediaPath: fixture.mediaPath, durationSec: fixture.durationSec, groundTruthAvailable: Boolean(fixture.groundTruth) })),
    models: [],
  };
  try {
    for (const profile of profiles) {
      const model = resolve(modelsRoot, `ggml-${profile.modelTier}.bin`);
      const profileOutput = join(outputRoot, profile.outputKey);
      await mkdir(profileOutput, { recursive: true });
      const fixtureResults: unknown[] = [];
      for (const fixture of fixtures) {
        const wav = join(workRoot, `${fixture.id}-${profile.outputKey}.wav`);
        const outBase = join(profileOutput, fixture.id);
        const started = Date.now();
        const extractStarted = Date.now();
        await run(ffmpeg, ['-y', '-v', 'error', '-i', fixture.mediaPath, '-vn', '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav]);
        const extractElapsedSec = (Date.now() - extractStarted) / 1000;
        const whisperStarted = Date.now();
        await run(whisper, ['-m', model, '-l', 'vi', '-f', wav, ...profile.args, '--print-progress', '--output-json-full', '--output-file', outBase]);
        const whisperElapsedSec = (Date.now() - whisperStarted) / 1000;
        const parsed = parseWhisperJsonWithStats(JSON.parse(await readFile(`${outBase}.json`, 'utf8')));
        const actualWords = parsed.words;
        const metrics = fixture.groundTruth
          ? benchmarkWhisperWords(fixture.groundTruth.words, actualWords, fixture.groundTruth.fillers, fillerProposals(actualWords))
          : null;
        const result = {
          fixtureId: fixture.id,
          tier: profile.id,
          modelTier: profile.modelTier,
          whisperArgs: profile.args,
          durationSec: fixture.durationSec,
          extractElapsedSec,
          whisperElapsedSec,
          elapsedSec: (Date.now() - started) / 1000,
          rawTokenCount: parsed.stats.rawTokenCount,
          nonSpecialTokenCount: parsed.stats.nonSpecialTokenCount,
          zeroDurationTokenCount: parsed.stats.zeroDurationTokenCount,
          zeroDurationRate: parsed.stats.rawTokenCount === 0 ? 0 : parsed.stats.zeroDurationTokenCount / parsed.stats.rawTokenCount,
          invalidDurationTokenCount: parsed.stats.invalidDurationTokenCount,
          groundTruthAvailable: Boolean(fixture.groundTruth),
          wordErrorRate: metrics?.wordErrorRate ?? null,
          medianBoundaryDeviationMs: metrics?.medianBoundaryDeviationMs ?? null,
          p95BoundaryDeviationMs: metrics?.p95BoundaryDeviationMs ?? null,
          fillerPrecision: metrics?.fillerPrecision ?? null,
          fillerRecall: metrics?.fillerRecall ?? null,
          confidenceCalibrationError: metrics?.confidenceCalibrationError ?? null,
          passesReviewFirstGate: metrics?.passesReviewFirstGate ?? false,
          alignedWordCount: metrics?.alignedWordCount ?? null,
          referenceWordCount: metrics?.referenceWordCount ?? null,
          actualWordCount: metrics?.actualWordCount ?? actualWords.length,
        };
        fixtureResults.push(result);
        await writeFile(join(profileOutput, `${fixture.id}.metrics.json`), JSON.stringify(result, null, 2), 'utf8');
        console.log(JSON.stringify(result));
      }
      (report.models as unknown[]).push({ tier: profile.id, modelTier: profile.modelTier, whisperArgs: profile.args, fixtures: fixtureResults });
    }
  } finally {
    await rm(workRoot, { recursive: true, force: true });
  }
  await writeFile(join(outputRoot, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
}

main().catch((error) => {
  console.error(`Whisper benchmark không chạy: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
