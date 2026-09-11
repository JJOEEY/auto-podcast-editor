import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { validateOfficialPerformanceEvidence, type OfficialPerformanceEvidence } from '../core/performanceReport.ts';

function option(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

async function exists(filePath: string): Promise<boolean> {
  try { await stat(filePath); return true; } catch { return false; }
}

async function readJson(filePath: string): Promise<Record<string, any>> {
  return JSON.parse(await readFile(filePath, 'utf8')) as Record<string, any>;
}

async function main(): Promise<void> {
  const root = resolve(option('--root', process.cwd()) as string);
  const candidateRoot = resolve(root, option('--candidate-root', 'qa/product-candidate') as string);
  const outPath = resolve(root, option('--out', 'qa/product-candidate/production-gate.json') as string);
  const fixtureIds = ['slow-camera-mic', 'medium-laptop-mic'];
  const checks: Record<string, unknown> = {};
  const failures: string[] = [];
  const productionFailures: string[] = [];

  const whisperPath = join(candidateRoot, 'whisper-results', 'report.json');
  const whisper = await readJson(whisperPath);
  checks.whisperPreliminary = { exists: true, mode: whisper.mode, models: whisper.models?.length ?? 0 };
  if (whisper.mode !== 'preliminary' || whisper.models?.length !== 3) failures.push('whisper preliminary report thiếu hoặc chưa đủ 3 profile');
  if ((whisper.fixtures ?? []).some((fixture: Record<string, unknown>) => fixture.groundTruthAvailable !== false)) {
    failures.push('candidate report không nhất quán về ground truth');
  }

  for (const fixtureId of fixtureIds) {
    const reportPath = join(candidateRoot, 'e2e', fixtureId, 'report.json');
    const report = await readJson(reportPath);
    const outputNames = ['preview-vertical.mp4', 'preview-horizontal.mp4', 'export-h264-4k.mp4', 'export-h264-4k-ducked.mp4', 'export-audio.wav', 'export-audio.mp3'];
    const outputChecks = Object.fromEntries(await Promise.all(outputNames.map(async (name) => [name, await exists(join(candidateRoot, 'e2e', fixtureId, name))])));
    const passed = report.passed === true && report.stages?.reopen?.ok === true && report.stages?.cancel?.killed === true && Object.values(outputChecks).every(Boolean);
    checks[fixtureId] = { report: report.passed === true, reopen: report.stages?.reopen?.ok === true, cancel: report.stages?.cancel?.killed === true, outputs: outputChecks, passed };
    if (!passed) failures.push(`${fixtureId} E2E artifact chưa pass đầy đủ`);
  }

  const capabilityReport = join(candidateRoot, 'capability-fallback.md');
  const installerReport = join(candidateRoot, 'installer-report.md');
  const whisperPerformanceReport = join(candidateRoot, 'performance', 'whisper-base-60min.report.json');
  const performanceReport = join(candidateRoot, 'performance', 'report.json');
  const buildManifestPath = join(root, 'assets', 'build-manifest.json');
  let expectedBuildId: string | null = null;
  if (await exists(buildManifestPath)) {
    const buildManifest = await readJson(buildManifestPath);
    expectedBuildId = typeof buildManifest.buildId === 'string' ? buildManifest.buildId : null;
  }
  if (await exists(whisperPerformanceReport)) {
    const performance = await readJson(whisperPerformanceReport);
    checks.whisper60Min = { passed: performance.passed === true, elapsedSec: performance.elapsedSec, thresholdSec: performance.thresholdSec };
    if (performance.passed !== true) failures.push('Whisper 60 phút không đạt performance gate');
  } else {
    checks.whisper60Min = { passed: false, missing: true };
    failures.push('thiếu phép đo Whisper 60 phút');
  }
  if (await exists(performanceReport)) {
    const performance = await readJson(performanceReport);
    const officialEvidence = Array.isArray(performance.officialEvidence)
      ? performance.officialEvidence as OfficialPerformanceEvidence[]
      : [];
    const officialResults = fixtureIds.map((fixtureId) => {
      const evidence = officialEvidence.find((item) => item.fixtureId === fixtureId);
      if (!evidence) return { fixtureId, passed: false, errors: ['missing installed performance evidence'] };
      const errors = validateOfficialPerformanceEvidence(evidence, expectedBuildId ?? 'missing-build-manifest');
      return { fixtureId, passed: errors.length === 0, errors };
    });
    const officialPassed = expectedBuildId !== null && officialResults.every((item) => item.passed);
    checks.performanceGate = {
      exists: true,
      diagnosticPassed: performance.gate?.passed === true,
      officialPassed,
      expectedBuildId,
      officialResults,
      worstFixtureId: performance.gate?.worstFixtureId ?? null,
      fixtureCount: performance.fixtureResults?.length ?? 0,
    };
    if (!officialPassed) productionFailures.push('thiếu hoặc không hợp lệ performance evidence từ bản cài đúng buildId');
  } else {
    checks.performanceGate = { exists: false, officialPassed: false, expectedBuildId };
    productionFailures.push('thiếu performance report từ bản cài');
  }
  checks.capabilityFallbackReport = await exists(capabilityReport);
  checks.installerReport = await exists(installerReport);
  if (!checks.capabilityFallbackReport) failures.push('thiếu capability/fallback report');
  if (!checks.installerReport) failures.push('thiếu installer report');

  const blockers = [
    'Chưa có 3 fixture chính thức và ground truth để chấm WER/timestamp/filler.',
    'Chưa có performance evidence chính thức từ bản cài đúng buildId: còn thiếu Player windows, 100 seek, 1.000 thao tác, Whisper và stability 2 giờ.',
    'Chưa có capture tự động từ Player để so với export FFmpeg frame-by-frame theo vùng caption/hiệu ứng.',
    'Chưa có clean-install/update/offline/rollback test trên máy Windows sạch độc lập.',
    'Chưa có acceptance đủ 5 track và export dài từ master cho cả hai fixture; smoke master ngắn đã pass.',
  ];
  const candidateReady = failures.length === 0;
  const result = {
    generatedAt: new Date().toISOString(),
    certificateCheck: 'excluded-by-request',
    candidateFieldTestReady: candidateReady,
    productionReady: false,
    checks,
    failures,
    productionFailures,
    blockers,
  };
  await mkdir(resolve(outPath, '..'), { recursive: true });
  await writeFile(outPath, JSON.stringify(result, null, 2), 'utf8');
  console.log(JSON.stringify(result, null, 2));
  if (!candidateReady) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
