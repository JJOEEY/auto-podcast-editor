import { describe, expect, it, vi } from 'vitest';
import { buildAudioExtractArgs, buildPeaksArgs, buildProbeArgs, runFfprobe } from '../electron/media.js';

describe('media arg builders', () => {
  it('builds a probe command', () => {
    expect(buildProbeArgs('C:/vids/ep1.mp4')).toEqual([
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1', 'C:/vids/ep1.mp4',
    ]);
  });

  it('builds 16kHz mono extract args', () => {
    expect(buildAudioExtractArgs('in.mp4', 'out.wav')).toEqual(['-y', '-i', 'in.mp4', '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', 'out.wav']);
  });

  it('builds raw peaks pipe args', () => {
    expect(buildPeaksArgs('in.mp4')).toEqual(['-v', 'error', '-i', 'in.mp4', '-ar', '8000', '-ac', '1', '-f', 's16le', '-']);
  });
});

describe('runFfprobe', () => {
  it('parses duration from stdout', async () => {
    const spawn = vi.fn().mockReturnValue({ stdout: 'duration=120.5\n' });
    expect(await runFfprobe('x.mp4', spawn)).toBeCloseTo(120.5);
  });
});
