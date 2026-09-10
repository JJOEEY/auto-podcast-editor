import { describe, expect, it } from 'vitest';
import { parseEditCommand } from '../core/commandParser.js';

describe('parseEditCommand', () => {
  it('understands silence and subtitle requests', () => {
    expect(parseEditCommand('remove all long pauses and use karaoke captions').map((x) => x.type)).toEqual(['remove-silence', 'subtitle-style']);
  });

  it('understands transition and voice requests', () => {
    expect(parseEditCommand('make the voice sound like a podcast and add glitch transitions')).toEqual([
      { type: 'transition-style', transition: 'glitch', confidence: 0.82 },
      { type: 'voice-preset', preset: 'podcast', confidence: 0.88 },
    ]);
  });

  it('returns no unsafe commands for unknown text', () => {
    expect(parseEditCommand('make it awesome')).toEqual([]);
  });
});
