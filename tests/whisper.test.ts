import { describe, expect, it } from 'vitest';
import { buildWhisperArgs, parseProgressLine, whisperJsonPath } from '../electron/whisper.js';

describe('buildWhisperArgs', () => {
  it('forces Vietnamese with word timestamps as JSON to a basename', () => {
    expect(buildWhisperArgs('model.bin', 'audio.wav', 'out/transcript')).toEqual([
      '-m', 'model.bin', '-l', 'vi', '-f', 'audio.wav',
      '--max-len', '1', '--print-progress', '--output-json', '--output-file', 'out/transcript',
    ]);
  });
});

describe('whisperJsonPath', () => {
  it('appends .json to the basename', () => {
    expect(whisperJsonPath('out/transcript')).toBe('out/transcript.json');
  });
  it('does not double-append .json', () => {
    expect(whisperJsonPath('out/transcript.json')).toBe('out/transcript.json');
  });
});

describe('parseProgressLine', () => {
  it('reads percent from whisper progress output', () => {
    expect(parseProgressLine('whisper_print_progress_callback: progress = 42%')).toBe(42);
    expect(parseProgressLine('some other log line')).toBeNull();
  });

  it('handles boundaries and spacing variants', () => {
    expect(parseProgressLine('progress = 0%')).toBe(0);
    expect(parseProgressLine('progress =  100%')).toBe(100);
    expect(parseProgressLine('progress = 101%')).toBeNull();
    expect(parseProgressLine('progress=5%')).toBe(5);
    expect(parseProgressLine('')).toBeNull();
  });
});
