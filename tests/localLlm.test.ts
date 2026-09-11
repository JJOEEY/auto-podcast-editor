import { describe, expect, it } from 'vitest';
import { buildLocalLlmPrompt, parseLocalLlmCommands } from '../core/localLlm.js';

describe('local LLM command contract', () => {
  it('parses only allowlisted JSON commands and ignores malformed output', () => {
    expect(parseLocalLlmCommands('{"commands":[{"id":"x","type":"set-voice-preset","preset":"podcast"},{"id":"bad","type":"shell"}]}')).toEqual([
      { id: 'x', type: 'set-voice-preset', preset: 'podcast' },
    ]);
    expect(parseLocalLlmCommands('not json')).toEqual([]);
  });

  it('includes bounded project context and revision in the prompt', () => {
    const prompt = buildLocalLlmPrompt('đặt giọng podcast', { revision: 4, durationSec: 10, tracks: [], proposals: [], items: [] } as never);
    expect(prompt).toContain('revision');
    expect(prompt).toContain('Return JSON only');
  });
});
