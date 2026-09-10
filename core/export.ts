export type ExportFormat = 'mp4-h264' | 'mp4-hevc' | 'webm-vp9' | 'mov-prores' | 'mp3' | 'wav';
export type ExportQuality = '720p' | '1080p' | '2k' | '4k';
export type VoicePreset = 'none' | 'clean' | 'podcast' | 'broadcast' | 'warm';

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
}

const BITRATES: Record<ExportFormat, number> = {
  'mp4-h264': 12,
  'mp4-hevc': 8,
  'webm-vp9': 8,
  'mov-prores': 0,
  mp3: 0.192,
  wav: 2.304,
};

const QUALITY_SCALE: Record<ExportQuality, number> = { '720p': 0.5, '1080p': 1, '2k': 1.6, '4k': 4 };

export function extensionForFormat(format: ExportFormat): string {
  if (format === 'mov-prores') return '.mov';
  if (format === 'webm-vp9') return '.webm';
  if (format === 'mp3') return '.mp3';
  if (format === 'wav') return '.wav';
  return '.mp4';
}

export function validateExportRequest(request: ExportRequest): void {
  if (!request.fileName.trim()) throw new Error('file name is required');
  if (!request.dir.trim()) throw new Error('output directory is required');
  if (request.target === 'audio' && !['mp3', 'wav'].includes(request.format)) throw new Error('audio-only requires MP3 or WAV');
  if (request.target !== 'audio' && ['mp3', 'wav'].includes(request.format)) throw new Error('video output requires a video format');
  if (request.bitrateMode === 'custom' && (!Number.isFinite(request.customMbps) || (request.customMbps ?? 0) <= 0)) {
    throw new Error('custom bitrate must be positive');
  }
  if (request.hashtags.length !== 4) throw new Error('exactly four hashtags are required');
}

export function estimateBytes(request: ExportRequest, durationSec: number): number {
  const bitrate = request.bitrateMode === 'custom' ? request.customMbps ?? 0 : BITRATES[request.format];
  const scale = request.format === 'mp4-h264' || request.format === 'mp4-hevc' || request.format === 'webm-vp9'
    ? QUALITY_SCALE[request.quality]
    : 1;
  const audioMbps = request.target === 'video-mute' ? 0 : 0.192;
  return Math.max(0, ((bitrate * scale + audioMbps) * 1_000_000 * durationSec) / 8);
}
