import { describe, expect, it } from 'vitest';
import { estimateBytes, extensionForFormat, validateExportRequest, type ExportRequest } from '../core/export.js';

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
    expect(() => validateExportRequest({ ...request, target: 'audio' })).toThrow('MP3 or WAV');
    expect(() => validateExportRequest({ ...request, bitrateMode: 'custom', customMbps: 0 })).toThrow('bitrate');
    expect(() => validateExportRequest(request)).not.toThrow();
  });
});
