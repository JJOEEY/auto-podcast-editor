import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { buildAudioGraphPlan, buildAudioMixFilter } from '../core/audioGraph.ts';
import { comparePcm16 } from '../core/audioEquivalence.ts';

const execFileAsync = promisify(execFile);
const root = resolve(process.cwd());
const ffmpeg = resolve(root, 'assets/bin/ffmpeg.exe');
const ffprobe = resolve(root, 'assets/bin/ffprobe.exe');

function option(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return resolve(index >= 0 ? process.argv[index + 1] ?? fallback : fallback);
}

async function run(binary: string, args: string[], label: string): Promise<void> {
  try {
    await execFileAsync(binary, args, { windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
  } catch (error) {
    const details = error as { stderr?: string; stdout?: string; message?: string };
    throw new Error(`${label} failed: ${details.stderr ?? details.stdout ?? details.message ?? String(error)}`);
  }
}

function pcmPayload(wav: Uint8Array): Uint8Array {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  let offset = 12;
  while (offset + 8 <= wav.byteLength) {
    const size = view.getUint32(offset + 4, true);
    const id = String.fromCharCode(wav[offset] ?? 0, wav[offset + 1] ?? 0, wav[offset + 2] ?? 0, wav[offset + 3] ?? 0);
    if (id === 'data') return wav.slice(offset + 8, Math.min(wav.byteLength, offset + 8 + size));
    offset += 8 + size + (size % 2);
  }
  throw new Error('WAV does not contain a data chunk');
}

async function main(): Promise<void> {
  const source = option('--source', 'qa/product-candidate/e2e/slow-camera-mic/work/render-source.mp4');
  const sfx = option('--sfx', 'assets/sfx/bundled/whoosh.wav');
  const outputDir = option('--out', 'qa/product-candidate/audio-stem');
  await mkdir(outputDir, { recursive: true });

  const plan = buildAudioGraphPlan({ voiceTrackId: 'A1', voicePreset: 'podcast', trackChains: [] });
  const voiceFilter = plan.voiceFilter;
  const filterParts = [
    '[0:a]atrim=start=0:duration=4,asetpts=PTS-STARTPTS[voice0]',
    '[1:a]atrim=start=0:duration=0.75,asetpts=PTS-STARTPTS,volume=0.4,afade=t=in:st=0:d=0.05,afade=t=out:st=0.55:d=0.2,adelay=2000:all=1[bg0]',
    buildAudioMixFilter({
      voiceLabel: 'voice0',
      backgroundLabels: ['bg0'],
      ducking: { enabled: true, voiceTrackId: 'A1', backgroundTrackIds: ['A2'], threshold: 0.04, ratio: 8, attackMs: 20, releaseMs: 250 },
      voiceFilter,
    }),
  ];
  const filter = filterParts.join(';');
  const audioOnly = join(outputDir, 'audio-only.wav');
  const videoWithPcm = join(outputDir, 'video-with-pcm.mkv');
  const videoStem = join(outputDir, 'video-stem.wav');

  await run(ffmpeg, ['-y', '-v', 'error', '-i', source, '-i', sfx, '-filter_complex', filter, '-map', '[aout]', '-t', '4', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', audioOnly], 'audio-only render');
  await run(ffmpeg, ['-y', '-v', 'error', '-i', source, '-i', sfx, '-filter_complex', filter, '-map', '0:v:0', '-map', '[aout]', '-t', '4', '-c:v', 'copy', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', '-shortest', videoWithPcm], 'video render with PCM stem');
  await run(ffmpeg, ['-y', '-v', 'error', '-i', videoWithPcm, '-vn', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', videoStem], 'video stem extraction');
  await run(ffprobe, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_name,sample_rate,channels', '-of', 'json', audioOnly], 'audio-only probe');

  const expected = pcmPayload(new Uint8Array(await readFile(audioOnly)));
  const actual = pcmPayload(new Uint8Array(await readFile(videoStem)));
  const pcm = comparePcm16(expected, actual, { minSnrDb: 60, maxAbsoluteError: 2 / 32768 });
  const report = {
    source,
    sfx,
    filter,
    artifacts: { audioOnly, videoWithPcm, videoStem },
    pcm,
    passed: pcm.passed && (await stat(audioOnly)).size > 44 && (await stat(videoStem)).size > 44,
    generatedAt: new Date().toISOString(),
  };
  await writeFile(join(outputDir, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
