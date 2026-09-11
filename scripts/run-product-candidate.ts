import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { buildKeepClips, complementRanges, filterCaptionsToKeeps } from '../core/keepRanges.ts';
import { chunkCaption } from '../core/caption.ts';
import { proposeCuts } from '../core/cutDetection.ts';
import { createDefaultSettings } from '../core/defaults.ts';
import { parseWhisperJson } from '../core/whisperJson.ts';
import { buildWhisperArgs } from '../electron/whisper.ts';
import { buildAudioExtractArgs } from '../electron/media.ts';
import { migrateProject } from '../core/projectMigration.ts';
import { buildRenderProps, type RenderProps } from '../core/propsFile.ts';
import { buildAudioGraphPlan, buildAudioMixFilter } from '../core/audioGraph.ts';
import { buildSrt } from '../core/exportText.ts';
import { renderRemotion } from '../electron/remotionRenderer.ts';
import type { CaptionLine, Clip, Project, SfxClip } from '../core/types.ts';

const root = resolve(process.cwd());
const ffmpeg = resolve(root, 'assets/bin/ffmpeg.exe');
const ffprobe = resolve(root, 'assets/bin/ffprobe.exe');
const whisper = resolve(root, 'assets/bin/whisper-cli.exe');
const model = resolve(root, 'assets/models/ggml-base.bin');
const whoosh = resolve(root, 'assets/sfx/bundled/whoosh.wav');

function option(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

function run(command: string, args: string[], logPath?: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', reject);
    child.on('close', async (code) => {
      if (logPath) await writeFile(logPath, `${stdout}\n${stderr}`, 'utf8');
      resolveRun({ code: code ?? -1, stdout, stderr });
    });
  });
}

async function runChecked(command: string, args: string[], label: string, logPath?: string): Promise<void> {
  const result = await run(command, args, logPath);
  if (result.code !== 0) throw new Error(`${label} failed (${result.code}): ${result.stderr.slice(-1500)}`);
}

async function probe(filePath: string): Promise<Record<string, unknown>> {
  const result = await run(ffprobe, ['-v', 'error', '-show_entries', 'format=duration,size:stream=codec_name,codec_type,width,height,sample_rate,channels', '-of', 'json', filePath]);
  if (result.code !== 0) throw new Error(`ffprobe failed: ${result.stderr.slice(-1000)}`);
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

async function renderSample(props: RenderProps, outputPath: string, compId: 'PodcastVertical' | 'PodcastHorizontal', scale: number): Promise<void> {
  await renderRemotion({
    appRoot: root,
    compId,
    props,
    outputPath,
    codec: 'h264',
    scale,
    muted: false,
    audioCodec: 'aac',
  });
}

async function createRenderProxy(inputPath: string, outputPath: string, durationSec: number, logPath: string): Promise<void> {
  // Render only a short, low-resolution proxy for the visual candidate smoke.
  // Full-fixture transcription and media probing still use inputPath; this
  // avoids asking Chromium/Remotion to seek through a multi-GB camera master.
  await runChecked(ffmpeg, [
    '-y', '-v', 'error', '-ss', '0', '-t', durationSec.toFixed(3), '-i', inputPath,
    '-map', '0:v:0', '-map', '0:a:0?', '-vf', 'scale=1280:-2',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18',
    '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', outputPath,
  ], 'render proxy', logPath);
}

async function addDuckedAudio(inputPath: string, outputPath: string, sfx: SfxClip, logPath: string): Promise<void> {
  const delayMs = Math.round(sfx.start * 1000);
  const fadeOutStart = Math.max(0, sfx.duration - (sfx.fadeOutSec ?? 0));
  const background = `[1:a]atrim=duration=${sfx.duration},asetpts=PTS-STARTPTS,volume=${sfx.volume},${sfx.fadeInSec ? `afade=t=in:st=0:d=${sfx.fadeInSec},` : ''}${sfx.fadeOutSec ? `afade=t=out:st=${fadeOutStart}:d=${sfx.fadeOutSec},` : ''}adelay=${delayMs}:all=1[bg0]`;
  const ducking = { enabled: true, voiceTrackId: 'A1', backgroundTrackIds: ['A2'], threshold: 0.04, ratio: 8, attackMs: 20, releaseMs: 250 };
  const voice = buildAudioGraphPlan({ voiceTrackId: 'A1', voicePreset: 'podcast' }).voiceFilter;
  const mix = buildAudioMixFilter({ voiceLabel: 'voice0', backgroundLabels: ['bg0'], ducking, voiceFilter: voice });
  await runChecked(ffmpeg, ['-y', '-i', inputPath, '-i', sfx.path, '-filter_complex', [`[0:a]anull[voice0]`, background, mix].join(';'), '-map', '0:v:0?', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-shortest', outputPath], 'ducking export', logPath);
}

async function cancellationSmoke(mediaPath: string): Promise<Record<string, unknown>> {
  const child = spawn(ffmpeg, ['-v', 'error', '-i', mediaPath, '-f', 'null', '-'], { stdio: ['ignore', 'ignore', 'ignore'] });
  const started = Date.now();
  await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  child.kill();
  const code = await new Promise<number>((resolveExit) => child.on('close', (exitCode) => resolveExit(exitCode ?? -1)));
  return { requested: true, killed: code !== 0, exitCode: code, elapsedMs: Date.now() - started };
}

async function main(): Promise<void> {
  const mediaPath = resolve(option('--media') ?? '');
  const fixtureId = option('--fixture', basename(mediaPath, '.mp4').toLowerCase()) ?? 'fixture';
  const outputRoot = resolve(option('--out', join('qa/product-candidate/e2e', fixtureId)) as string);
  const sampleSec = Number(option('--sample-sec', '10'));
  if (!mediaPath || !Number.isFinite(sampleSec) || sampleSec <= 0) throw new Error('Cần --media và --sample-sec dương');
  await mkdir(outputRoot, { recursive: true });
  const report: Record<string, unknown> = { fixtureId, mediaPath, sampleSec, startedAt: new Date().toISOString(), passed: false, stages: {} };
  const started = Date.now();
  const durationProbe = await probe(mediaPath);
  (report.stages as Record<string, unknown>).probe = durationProbe;
  const durationSec = Number((durationProbe.format as { duration?: string })?.duration ?? 0);
  const workDir = join(outputRoot, 'work');
  await mkdir(workDir, { recursive: true });
  const wav = join(workDir, 'audio16k.wav');
  await runChecked(ffmpeg, buildAudioExtractArgs(mediaPath, wav), 'audio extraction', join(outputRoot, 'extract.log'));
  const outBase = join(workDir, 'transcript');
  await runChecked(whisper, buildWhisperArgs(model, wav, outBase), 'Whisper base', join(outputRoot, 'whisper-base.log'));
  const transcript = JSON.parse(await readFile(`${outBase}.json`, 'utf8')) as unknown;
  const words = parseWhisperJson(transcript);
  await writeFile(join(outputRoot, 'transcript.base.json'), JSON.stringify({ words }, null, 2), 'utf8');
  const settings = createDefaultSettings();
  const proposals = proposeCuts(words, [], settings);
  const keeps = complementRanges(proposals, durationSec);
  const captions = filterCaptionsToKeeps(chunkCaption(words), keeps);
  const keepClips = buildKeepClips(proposals, durationSec);
  const sampleEnd = Math.min(sampleSec, durationSec);
  const renderSourcePath = join(workDir, 'render-source.mp4');
  await createRenderProxy(mediaPath, renderSourcePath, sampleEnd, join(outputRoot, 'render-proxy.log'));
  const clips: Clip[] = [
    { id: 'sample-a', track: 'V1', start: 0, end: Math.min(5, sampleEnd), label: 'sample-a', transitionOut: { type: 'fade', durationFrames: 10 } },
    ...(sampleEnd > 5 ? [{ id: 'sample-b', track: 'V1' as const, start: 5, end: sampleEnd, label: 'sample-b' }] : []),
  ];
  const sampleCaptions: CaptionLine[] = captions.filter((caption) => caption.start < sampleEnd && caption.end > 0);
  const sfx: SfxClip = { id: 'candidate-whoosh', path: whoosh, start: 2, duration: 0.75, volume: 0.4, category: 'transition', fadeInSec: 0.05, fadeOutSec: 0.2 };
  const project: Project = {
    version: 1,
    name: fixtureId,
    sourcePath: mediaPath,
    durationSec,
    clips,
    proposals,
    captions: sampleCaptions,
    preset: 'horizontal',
    settings,
    sfx: [sfx],
    subtitleStyle: 'karaoke',
  };
  const projectV2 = migrateProject(project);
  projectV2.voicePreset = 'podcast';
  projectV2.audioDucking = { enabled: true, voiceTrackId: 'A1', backgroundTrackIds: ['A2'], threshold: 0.04, ratio: 8, attackMs: 20, releaseMs: 250 };
  const projectPath = join(outputRoot, 'project.json');
  await writeFile(projectPath, JSON.stringify(projectV2, null, 2), 'utf8');
  const reopenedProject = migrateProject(JSON.parse(await readFile(projectPath, 'utf8')) as Project);
  if (reopenedProject.version !== 2 || reopenedProject.sourcePath !== mediaPath || reopenedProject.items.length === 0 || reopenedProject.tracks.length === 0) {
    throw new Error('Project reopen validation failed');
  }
  (report.stages as Record<string, unknown>).reopen = {
    ok: true,
    version: reopenedProject.version,
    itemCount: reopenedProject.items.length,
    trackCount: reopenedProject.tracks.length,
  };
  await writeFile(join(outputRoot, 'captions.srt'), buildSrt(sampleCaptions.map((caption) => ({ id: caption.id, start: caption.start, end: caption.end, text: caption.text }))), 'utf8');
  const baseProps = buildRenderProps(renderSourcePath, clips, sampleCaptions, [sfx], 'karaoke', projectV2.items, projectV2.tracks, projectV2.timebase);
  const masterProps = buildRenderProps(mediaPath, clips, sampleCaptions, [sfx], 'karaoke', projectV2.items, projectV2.tracks, projectV2.timebase);
  const noSfxProps = buildRenderProps(renderSourcePath, clips, sampleCaptions, [], 'karaoke', projectV2.items, projectV2.tracks, projectV2.timebase);
  const vertical = join(outputRoot, 'preview-vertical.mp4');
  const horizontal = join(outputRoot, 'preview-horizontal.mp4');
  const h264 = join(outputRoot, 'export-h264-4k.mp4');
  const ducked = join(outputRoot, 'export-h264-4k-ducked.mp4');
  await renderSample({ ...baseProps }, vertical, 'PodcastVertical', 0.25);
  await renderSample({ ...baseProps }, horizontal, 'PodcastHorizontal', 0.25);
  // Preview uses the short proxy; the export candidate must resolve media from the original master.
  await renderSample({ ...masterProps, sfx: [] }, h264, 'PodcastHorizontal', 2);
  await addDuckedAudio(h264, ducked, sfx, join(outputRoot, 'ducking.log'));
  const wavExport = join(outputRoot, 'export-audio.wav');
  const mp3Export = join(outputRoot, 'export-audio.mp3');
  await runChecked(ffmpeg, ['-y', '-v', 'error', '-i', ducked, '-vn', '-c:a', 'pcm_s16le', wavExport], 'WAV export', join(outputRoot, 'wav.log'));
  await runChecked(ffmpeg, ['-y', '-v', 'error', '-i', ducked, '-vn', '-c:a', 'libmp3lame', '-b:a', '192k', mp3Export], 'MP3 export', join(outputRoot, 'mp3.log'));
  const outputs = [vertical, horizontal, h264, ducked, wavExport, mp3Export];
  const outputProbe: Record<string, unknown> = {};
  for (const output of outputs) {
    const info = await stat(output);
    if (info.size === 0) throw new Error(`Empty output: ${output}`);
    outputProbe[basename(output)] = { bytes: info.size, ffprobe: await probe(output) };
  }
  (report.stages as Record<string, unknown>).transcribe = { wordCount: words.length, proposalCount: proposals.length, keepClipCount: keepClips.length };
  (report.stages as Record<string, unknown>).renderProxy = { path: renderSourcePath, durationSec: sampleEnd, ffprobe: await probe(renderSourcePath) };
  (report.stages as Record<string, unknown>).outputs = outputProbe;
  (report.stages as Record<string, unknown>).sourceResolution = {
    previewSource: renderSourcePath,
    exportSource: mediaPath,
    exportUsesMaster: masterProps.sourcePath === mediaPath,
  };
  (report.stages as Record<string, unknown>).cancel = await cancellationSmoke(mediaPath);
  report.elapsedSec = (Date.now() - started) / 1000;
  report.passed = true;
  await writeFile(join(outputRoot, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report, null, 2));
}

main().catch(async (error) => {
  console.error(`Product candidate E2E failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
