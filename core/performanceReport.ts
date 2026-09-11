export interface OfficialPerformanceEvidence {
  buildId: string;
  installed: boolean;
  fixtureId: string;
  seekSamples: number;
  timelineSamples: number;
  playerWindows: number;
  frameSamples: number;
  previewFpsWindows: number[];
  droppedFrameRates: number[];
  seekP95Ms: number;
  seekMaxMs: number;
  timelineP95Ms: number;
  timelineP99Ms: number;
  export4k10MinSec: number;
  whisper60MinSec: number;
  stabilityHours: number;
  memoryGrowthMiB: number;
  memoryGrowthMiBPerHour: number;
  peakTreeMemoryGiB: number;
  workload: { videoClips: number; captions: number; words: number; transitions: number; musicItems: number; sfxItems: number; trackIds: string[] };
}

export const OFFICIAL_WORKLOAD = {
  videoClips: 600,
  captions: 1200,
  words: 9000,
  transitions: 120,
  musicItems: 12,
  sfxItems: 60,
  trackIds: ['V1', 'CC', 'A1', 'A2', 'A3'],
} as const;

function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function positiveInteger(value: unknown): value is number { return Number.isInteger(value) && Number(value) >= 0; }

export function validateOfficialPerformanceEvidence(evidence: OfficialPerformanceEvidence, expectedBuildId: string): string[] {
  const errors: string[] = [];
  if (!evidence || typeof evidence !== 'object') return ['performance evidence is missing'];
  if (!evidence.installed) errors.push('performance must run from installed application');
  if (!evidence.buildId || evidence.buildId !== expectedBuildId) errors.push('buildId mismatch');
  if (typeof evidence.fixtureId !== 'string' || !evidence.fixtureId.trim()) errors.push('missing fixtureId');
  const numericMetrics = [
    'seekSamples', 'timelineSamples', 'playerWindows', 'frameSamples', 'seekP95Ms', 'seekMaxMs',
    'timelineP95Ms', 'timelineP99Ms', 'export4k10MinSec', 'whisper60MinSec', 'stabilityHours',
    'memoryGrowthMiB', 'memoryGrowthMiBPerHour', 'peakTreeMemoryGiB',
  ] as const;
  for (const name of numericMetrics) {
    if (!finite(evidence[name])) errors.push(`invalid numeric metric: ${name}`);
  }
  if (!positiveInteger(evidence.seekSamples) || evidence.seekSamples !== 100) errors.push('seek sample count must be 100');
  if (!positiveInteger(evidence.timelineSamples) || evidence.timelineSamples !== 1000) errors.push('timeline sample count must be 1000');
  if (!finite(evidence.playerWindows) || evidence.playerWindows <= 0 || !finite(evidence.frameSamples) || evidence.frameSamples <= 0) errors.push('player/frame samples are missing');
  if (!Array.isArray(evidence.previewFpsWindows) || evidence.previewFpsWindows.length === 0 || evidence.previewFpsWindows.some((value) => !finite(value) || value < 24)) errors.push('preview windows are invalid or below 24fps');
  if (!Array.isArray(evidence.droppedFrameRates) || !Array.isArray(evidence.previewFpsWindows) || evidence.droppedFrameRates.length !== evidence.previewFpsWindows.length || evidence.droppedFrameRates.some((value) => !finite(value) || value < 0 || value > 0.05)) errors.push('dropped frame windows are invalid or above 5%');
  if (finite(evidence.seekP95Ms) && evidence.seekP95Ms > 500) errors.push('seek p95 exceeds 500ms');
  if (finite(evidence.seekMaxMs) && evidence.seekMaxMs > 1500) errors.push('seek max exceeds 1500ms');
  if (finite(evidence.timelineP95Ms) && evidence.timelineP95Ms >= 100) errors.push('timeline p95 is not below 100ms');
  if (finite(evidence.timelineP99Ms) && evidence.timelineP99Ms > 250) errors.push('timeline p99 exceeds 250ms');
  if (finite(evidence.export4k10MinSec) && evidence.export4k10MinSec > 1800) errors.push('4K export exceeds 30 minutes');
  if (finite(evidence.whisper60MinSec) && evidence.whisper60MinSec > 7200) errors.push('Whisper 60 minutes exceeds 120 minutes');
  if (finite(evidence.stabilityHours) && evidence.stabilityHours < 2) errors.push('stability run is shorter than 2 hours');
  if (finite(evidence.memoryGrowthMiB) && evidence.memoryGrowthMiB > 500) errors.push('memory growth exceeds 500MiB');
  if (finite(evidence.memoryGrowthMiBPerHour) && evidence.memoryGrowthMiBPerHour > 100) errors.push('memory growth rate exceeds 100MiB/hour');
  if (finite(evidence.peakTreeMemoryGiB) && evidence.peakTreeMemoryGiB > 10) errors.push('peak process memory exceeds 10GiB');
  const workload = evidence.workload;
  if (!workload || typeof workload !== 'object') {
    errors.push('workload is missing');
  } else {
    const counts = ['videoClips', 'captions', 'words', 'transitions', 'musicItems', 'sfxItems'] as const;
    for (const key of counts) if (!positiveInteger(workload[key])) errors.push(`invalid workload count: ${key}`);
    if (workload.videoClips !== OFFICIAL_WORKLOAD.videoClips || workload.captions !== OFFICIAL_WORKLOAD.captions || workload.words !== OFFICIAL_WORKLOAD.words || workload.transitions !== OFFICIAL_WORKLOAD.transitions || workload.musicItems !== OFFICIAL_WORKLOAD.musicItems || workload.sfxItems !== OFFICIAL_WORKLOAD.sfxItems) errors.push('workload counts do not match official workload');
    if (!Array.isArray(workload.trackIds) || JSON.stringify(workload.trackIds) !== JSON.stringify(OFFICIAL_WORKLOAD.trackIds)) errors.push('track workload does not contain the five required tracks');
  }
  return errors;
}
