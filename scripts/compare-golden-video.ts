import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { argv, exit } from 'node:process';
import { parseFfmpegSsimOutput, assertVideoGoldenGate } from '../core/videoGolden.ts';

function option(name: string, fallback?: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : fallback;
}

const reference = option('--reference');
const candidate = option('--candidate');
const ffmpeg = option('--ffmpeg', 'ffmpeg') as string;
const minSsim = Number(option('--min-ssim', '0.98'));
const reportPath = option('--report');
if (!reference || !candidate) {
  console.error('Usage: node --experimental-strip-types scripts/compare-golden-video.ts --reference preview.mp4 --candidate export.mp4 [--report report.json]');
  exit(2);
}
if (!existsSync(reference) || !existsSync(candidate)) throw new Error('Reference and candidate files must exist');

const result = spawnSync(ffmpeg, [
  '-hide_banner', '-i', reference, '-i', candidate,
  '-filter_complex', '[0:v:0][1:v:0]ssim=stats_file=-:shortest=1',
  '-f', 'null', process.platform === 'win32' ? 'NUL' : '/dev/null',
], { encoding: 'utf8' });
const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
if (result.status !== 0) throw new Error(`FFmpeg SSIM failed with exit code ${result.status ?? -1}`);
const metrics = parseFfmpegSsimOutput(output);
const report = { reference, candidate, minSsim, metrics, passed: metrics.meanAll >= minSsim };
if (reportPath) writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
assertVideoGoldenGate(metrics, { minSsim });
console.log(JSON.stringify(report, null, 2));
