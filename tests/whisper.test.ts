import { describe, expect, it } from 'vitest';
import { buildWhisperArgs, parseProgressLine } from '../electron/whisper.js';

describe('buildWhisperArgs', () => {
  it('forces Vietnamese with word timestamps as JSON', () => {
    expect(buildWhisperArgs('model.bin', 'audio.wav', 'out.json')).toEqual([
      '-m', 'model.bin', '-l', 'vi', '-f', 'audio.wav', '--output-json', '--max-len', '1', '-oj', 'out.json',
    ]);
  });
});

describe('parseProgressLine', () => {
  it('reads percent from whisper progress output', () => {
    expect(parseProgressLine('whisper_print_progress_callback: progress = 42%')).toBe(42);
    expect(parseProgressLine('some other log line')).toBeNull();
  });
});
