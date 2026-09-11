export type ExportFormat = 'mp4-h264' | 'mp4-hevc' | 'mp4-av1' | 'mp4-vvc' | 'webm-vp9' | 'mov-prores' | 'mov-dnxhr' | 'mkv-ffv1' | 'mp3' | 'wav' | 'flac' | 'aac' | 'opus';
export type ExportQuality = '720p' | '1080p' | '2k' | '4k' | '8k' | 'custom';
export type VoicePreset = 'none' | 'clean' | 'podcast' | 'broadcast' | 'warm';
import type { AudioDuckingSettings } from './types.js';

export interface ExportRequest {
  fileName: string;
  dir: string;
  format: ExportFormat;
  quality: ExportQuality;
  bitrateMode: 'auto' | 'custom';
  customMbps?: number;
  target: 'video-audio' | 'audio' | 'video-mute';
  captions: 'burn' | 'srt' | 'both';
  range: 'all' | 'inout' | 'clip';
  thumbSec: number;
  hashtags: [string, string, string, string];
  voicePreset?: VoicePreset;
  audioBypass?: boolean;
  ducking?: AudioDuckingSettings;
  customWidth?: number;
  customHeight?: number;
}

const BITRATES: Record<ExportFormat, number> = {
  'mp4-h264': 12,
  'mp4-hevc': 8,
  'mp4-av1': 6,
  'mp4-vvc': 5,
  'webm-vp9': 8,
  'mov-prores': 0,
  'mov-dnxhr': 0,
  'mkv-ffv1': 0,
  mp3: 0.192,
  wav: 2.304,
  flac: 2.304,
  aac: 0.192,
  opus: 0.128,
};

const QUALITY_SCALE: Record<ExportQuality, number> = { '720p': 0.5, '1080p': 1, '2k': 4 / 3, '4k': 2, '8k': 4, custom: 1 };

export function extensionForFormat(format: ExportFormat): string {
  if (format === 'mov-prores') return '.mov';
  if (format === 'mov-dnxhr') return '.mov';
  if (format === 'mkv-ffv1') return '.mkv';
  if (format === 'webm-vp9') return '.webm';
  if (format === 'mp4-av1' || format === 'mp4-vvc') return '.mp4';
  if (format === 'mp3') return '.mp3';
  if (format === 'wav') return '.wav';
  if (format === 'flac') return '.flac';
  if (format === 'aac') return '.m4a';
  if (format === 'opus') return '.opus';
  return '.mp4';
}

export function isAudioFormat(format: ExportFormat): boolean {
  return format === 'mp3' || format === 'wav' || format === 'flac' || format === 'aac' || format === 'opus';
}

const REQUIRED_ENCODERS: Record<ExportFormat, string[]> = {
  'mp4-h264': ['libx264', 'h264_nvenc', 'h264_qsv', 'h264_amf', 'h264'],
  'mp4-hevc': ['libx265', 'hevc_nvenc', 'hevc_qsv', 'hevc_amf', 'hevc'],
  'mp4-av1': ['libsvtav1', 'libaom-av1', 'av1_nvenc', 'av1'],
  'mp4-vvc': ['libvvenc', 'vvc'],
  'webm-vp9': ['libvpx-vp9'],
  'mov-prores': ['prores_ks', 'prores'],
  'mov-dnxhr': ['dnxhd'],
  'mkv-ffv1': ['ffv1'],
  mp3: ['libmp3lame', 'mp3'],
  wav: ['pcm_s16le'],
  flac: ['flac'],
  aac: ['aac'],
  opus: ['libopus', 'opus'],
};

export function supportedExportFormats(encoders: string[], smokeTestedFormats?: string[]): ExportFormat[] {
  const available = new Set(encoders);
  const smokeTested = smokeTestedFormats ? new Set(smokeTestedFormats) : null;
  return (Object.keys(REQUIRED_ENCODERS) as ExportFormat[]).filter((format) => REQUIRED_ENCODERS[format].some((encoder) => available.has(encoder)) && (!smokeTested || smokeTested.has(format)));
}

export function validateExportRequest(request: ExportRequest): void {
  if (!request.fileName.trim()) throw new Error('file name is required');
  if (!request.dir.trim()) throw new Error('output directory is required');
  if (request.target === 'audio' && !isAudioFormat(request.format)) throw new Error('audio-only requires an audio format');
  if (request.target !== 'audio' && isAudioFormat(request.format)) throw new Error('video output requires a video format');
  if (request.bitrateMode === 'custom' && (!Number.isFinite(request.customMbps) || (request.customMbps ?? 0) <= 0)) {
    throw new Error('custom bitrate must be positive');
  }
  if (request.hashtags.length !== 4) throw new Error('exactly four hashtags are required');
}

export function estimateBytes(request: ExportRequest, durationSec: number): number {
  const bitrate = request.bitrateMode === 'custom' ? request.customMbps ?? 0 : BITRATES[request.format];
  const scale = !isAudioFormat(request.format) ? QUALITY_SCALE[request.quality] : 1;
  const audioMbps = request.target === 'video-mute' ? 0 : 0.192;
  return Math.max(0, ((bitrate * scale + audioMbps) * 1_000_000 * durationSec) / 8);
}
