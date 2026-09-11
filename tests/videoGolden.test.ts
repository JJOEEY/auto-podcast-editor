import { describe, expect, it } from 'vitest';
import { assertVideoGoldenGate, parseFfmpegSsimOutput } from '../core/videoGolden.js';

const ffmpegOutput = '[Parsed_ssim_0 @ 000001] n:1 Y:0.999900 U:0.999800 V:0.999700 All:0.999800 (79.000000)\n[Parsed_ssim_0 @ 000001] n:2 Y:0.999800 U:0.999700 V:0.999600 All:0.999700 (78.000000)';

describe('video golden comparator', () => {
  it('parses the final FFmpeg SSIM frame aggregate', () => {
    expect(parseFfmpegSsimOutput(ffmpegOutput)).toMatchObject({ meanY: 0.9998, meanU: 0.9997, meanV: 0.9996, meanAll: 0.9997, framesCompared: 2 });
  });

  it('enforces the SSIM gate', () => {
    expect(() => assertVideoGoldenGate({ meanY: 0.99, meanU: 0.99, meanV: 0.99, meanAll: 0.99 }, { minSsim: 0.98 })).not.toThrow();
    expect(() => assertVideoGoldenGate({ meanY: 0.8, meanU: 0.8, meanV: 0.8, meanAll: 0.8 }, { minSsim: 0.98 })).toThrow('SSIM gate failed');
  });
});
