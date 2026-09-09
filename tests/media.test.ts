import { describe, expect, it, vi } from 'vitest';
import { buildAudioExtractArgs, buildPeaksArgs, buildProbeArgs, runFfprobe, runPeaks } from '../electron/media.js';

describe('media arg builders', () => {
  it('builds a probe command', () => {
    expect(buildProbeArgs('C:/vids/ep1.mp4')).toEqual([
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1', 'C:/vids/ep1.mp4',
    ]);
  });

  it('builds 16kHz mono extract args', () => {
    expect(buildAudioExtractArgs('in.mp4', 'out.wav')).toEqual(['-y', '-i', 'in.mp4', '-vn', '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', 'out.wav']);
  });

  it('builds raw peaks pipe args', () => {
    expect(buildPeaksArgs('in.mp4')).toEqual(['-v', 'error', '-i', 'in.mp4', '-ar', '8000', '-ac', '1', '-f', 's16le', '-']);
  });
});

describe('runFfprobe', () => {
  it('parses duration from stdout', async () => {
    const spawn = vi.fn().mockReturnValue({ stdout: 'duration=120.5\n' });
    expect(await runFfprobe('x.mp4', spawn)).toBe(120.5);
  });
});

describe('runFfprobe edges', () => {
  it('forwards cmd and builder args to spawn', async () => {
    const spawn = vi.fn().mockReturnValue({ stdout: 'duration=10.5\n' });
    await runFfprobe('x.mp4', spawn);
    expect(spawn).toHaveBeenCalledWith('ffprobe', buildProbeArgs('x.mp4'));
  });

  it('rejects missing, N/A, and malformed durations', async () => {
    const bad = (stdout: string) => vi.fn().mockReturnValue({ stdout });
    await expect(runFfprobe('x.mp4', bad(''))).rejects.toThrow('duration not found');
    await expect(runFfprobe('x.mp4', bad('duration=N/A\n'))).rejects.toThrow('invalid duration');
    await expect(runFfprobe('x.mp4', bad('duration=1.2.3\n'))).rejects.toThrow('invalid duration');
  });
});

describe('runPeaks', () => {
  it('decodes s16le bytes and drops a trailing odd byte', () => {
    const spawn = vi.fn().mockReturnValue(new Uint8Array([0x00, 0x00, 0xff, 0x7f, 0x00, 0x80, 0x01]));
    const samples = runPeaks('in.mp4', spawn);
    expect(spawn).toHaveBeenCalledWith('ffmpeg', buildPeaksArgs('in.mp4'));
    expect(Array.from(samples)).toEqual([0, 32767, -32768]);
  });
});
