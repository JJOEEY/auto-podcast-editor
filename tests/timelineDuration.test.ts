import { describe, expect, it } from 'vitest';
import { timelineDurationFrames } from '../core/timelineDuration.js';

describe('timeline duration', () => {
  it('keeps audio tail after video and keeps it when muted', () => {
    const result = timelineDurationFrames({
      clips: [{ id: 'video', track: 'V1', start: 0, end: 13, label: 'video' }],
      sfx: [{ id: 'music-tail', path: 'music.wav', start: 13, duration: 2, volume: 0, muted: true, trackId: 'A2' }],
    });
    expect(result).toBe(450);
  });

  it('uses timeline item positions rather than compacting gaps', () => {
    const result = timelineDurationFrames({
      items: [
        { id: 'a', trackId: 'V1', label: 'a', startFrame: 0, durationFrames: 90 },
        { id: 'b', trackId: 'V1', label: 'b', startFrame: 300, durationFrames: 90 },
      ],
      tracks: [{ id: 'V1', kind: 'video', name: 'Video', index: 0 }],
    });
    expect(result).toBe(390);
  });

  it('keeps an audio item after the last video frame', () => {
    const result = timelineDurationFrames({
      items: [
        { id: 'video', trackId: 'V1', label: 'video', startFrame: 0, durationFrames: 390 },
        { id: 'music', trackId: 'A2', label: 'music', startFrame: 390, durationFrames: 60 },
      ],
      tracks: [
        { id: 'V1', kind: 'video', name: 'Video', index: 0 },
        { id: 'A2', kind: 'audio', name: 'Music', index: 1 },
      ],
    });
    expect(result).toBe(450);
  });
});
