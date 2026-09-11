import { audioFilterForPreset, type VoicePreset } from './audioPresets.ts';
import type { AudioChain, AudioDuckingSettings } from './types.js';

export type DuckingSpec = AudioDuckingSettings;

export interface AudioGraphPlan {
  voiceTrackId: string;
  voiceFilter: string | null;
  trackFilters: Array<{ trackId: string; filter: string | null }>;
  ducking?: DuckingSpec;
}

function escapeFilterNumber(value: number): string {
  if (!Number.isFinite(value)) throw new RangeError('audio filter value must be finite');
  return String(value);
}

export function compileAudioChain(chain: AudioChain): string | null {
  if (!chain.enabled) return null;
  const filters: string[] = [];
  if (chain.denoise?.enabled) filters.push(`afftdn=nr=${escapeFilterNumber(chain.denoise.amount)}`);
  if (chain.highpassHz !== undefined) filters.push(`highpass=f=${escapeFilterNumber(chain.highpassHz)}`);
  for (const band of chain.eq ?? []) {
    filters.push(`equalizer=f=${escapeFilterNumber(band.frequency)}:t=q:w=${escapeFilterNumber(band.q)}:g=${escapeFilterNumber(band.gainDb)}`);
  }
  if (chain.compressor?.enabled) {
    const c = chain.compressor;
    filters.push(`acompressor=threshold=${escapeFilterNumber(c.thresholdDb)}dB:ratio=${escapeFilterNumber(c.ratio)}:attack=${escapeFilterNumber(c.attackMs)}:release=${escapeFilterNumber(c.releaseMs)}`);
  }
  if (chain.loudness?.enabled) filters.push(`loudnorm=I=${escapeFilterNumber(chain.loudness.integratedLufs)}:TP=${escapeFilterNumber(chain.loudness.truePeakDbtp)}:LRA=11`);
  if (chain.limiter?.enabled) filters.push(`alimiter=limit=${escapeFilterNumber(Math.pow(10, chain.limiter.ceilingDb / 20))}`);
  if (chain.volumeDb !== undefined && chain.volumeDb !== 0) filters.push(`volume=${escapeFilterNumber(chain.volumeDb)}dB`);
  return filters.length > 0 ? filters.join(',') : null;
}

export function volumeFilter(volumeDb: number | undefined): string | null {
  if (volumeDb === undefined || volumeDb === 0) return null;
  if (!Number.isFinite(volumeDb)) throw new RangeError('track volume must be finite');
  return `volume=${escapeFilterNumber(volumeDb)}dB`;
}

export function buildAudioGraphPlan(options: {
  voiceTrackId: string;
  voicePreset: VoicePreset;
  trackChains?: AudioChain[];
  ducking?: DuckingSpec;
}): AudioGraphPlan {
  const chains = options.trackChains ?? [];
  return {
    voiceTrackId: options.voiceTrackId,
    voiceFilter: audioFilterForPreset(options.voicePreset),
    trackFilters: chains.map((chain) => ({ trackId: chain.trackId, filter: compileAudioChain(chain) })),
    ducking: options.ducking && options.ducking.backgroundTrackIds.length > 0 ? { ...options.ducking, backgroundTrackIds: [...options.ducking.backgroundTrackIds] } : undefined,
  };
}

export function buildSidechainFilter(ducking: DuckingSpec): string {
  if (!ducking.voiceTrackId || ducking.backgroundTrackIds.length === 0) throw new Error('sidechain requires voice and background tracks');
  if (ducking.ratio <= 0 || ducking.attackMs < 0 || ducking.releaseMs < 0) throw new RangeError('invalid sidechain settings');
  return `sidechaincompress=threshold=${escapeFilterNumber(ducking.threshold)}:ratio=${escapeFilterNumber(ducking.ratio)}:attack=${escapeFilterNumber(ducking.attackMs)}:release=${escapeFilterNumber(ducking.releaseMs)}`;
}

export function buildAudioMixFilter(options: {
  voiceLabel: string;
  backgroundLabels: string[];
  ducking: DuckingSpec;
  voiceFilter?: string | null;
  outputLabel?: string;
}): string {
  if (options.backgroundLabels.length === 0) throw new Error('audio mix requires at least one background input');
  const outputLabel = options.outputLabel ?? 'aout';
  const voiceLabel = options.voiceFilter ? `${options.voiceLabel}voice` : options.voiceLabel;
  const filters: string[] = [];
  if (options.voiceFilter) filters.push(`[${options.voiceLabel}]${options.voiceFilter}[${voiceLabel}]`);
  const backgroundLabel = options.backgroundLabels.length === 1 ? options.backgroundLabels[0] : 'bgmix';
  if (options.backgroundLabels.length > 1) {
    filters.push(`[${options.backgroundLabels.join('][')}]amix=inputs=${options.backgroundLabels.length}:duration=longest:dropout_transition=0[${backgroundLabel}]`);
  }
  filters.push(`[${backgroundLabel}][${voiceLabel}]${buildSidechainFilter(options.ducking)}[ducked]`);
  filters.push(`[${voiceLabel}][ducked]amix=inputs=2:duration=longest:dropout_transition=0[${outputLabel}]`);
  return filters.join(';');
}
