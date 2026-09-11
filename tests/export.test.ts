import { describe, expect, it } from 'vitest';
import { estimateBytes, extensionForFormat, supportedExportFormats, validateExportRequest, type ExportRequest } from '../core/export.js';

const request: ExportRequest = {
  fileName: 'episode', dir: 'out', format: 'mp4-h264', quality: '1080p', bitrateMode: 'auto',
  target: 'video-audio', captions: 'both', range: 'all', thumbSec: 1, hashtags: ['#a', '#b', '#c', '#d'],
};

describe('export model', () => {
  it('maps formats to extensions and estimates size', () => {
    expect(extensionForFormat('mov-prores')).toBe('.mov');
    expect(estimateBytes(request, 60)).toBeGreaterThan(0);
  });

  it('validates target and bitrate rules', () => {
    expect(() => validateExportRequest({ ...request, target: 'audio' })).toThrow('audio format');
    expect(() => validateExportRequest({ ...request, bitrateMode: 'custom', customMbps: 0 })).toThrow('bitrate');
    expect(() => validateExportRequest(request)).not.toThrow();
  });

  it('supports the planned audio containers', () => {
    expect(extensionForFormat('flac')).toBe('.flac');
    expect(extensionForFormat('aac')).toBe('.m4a');
    expect(extensionForFormat('opus')).toBe('.opus');
    expect(() => validateExportRequest({ ...request, target: 'audio', format: 'opus' })).not.toThrow();
  });

  it('filters codecs from the current FFmpeg encoder snapshot', () => {
    expect(supportedExportFormats(['libx264', 'libopus'])).toEqual(['mp4-h264', 'opus']);
    expect(supportedExportFormats(['libx264', 'libopus'], ['opus'])).toEqual(['opus']);
  });
});
