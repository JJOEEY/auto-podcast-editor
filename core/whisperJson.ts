import type { Word } from './types.js';

interface WhisperToken {
  text?: unknown;
  offsets?: unknown;
}

interface WhisperSegment {
  tokens?: unknown;
}

function isSpecialToken(text: string): boolean {
  return /^\[.*\]$/.test(text) || text === '';
}

/** Map whisper.cpp --output-json-full tokens to Word[]. Offsets are milliseconds. */
export function parseWhisperJson(input: unknown): Word[] {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('invalid whisper transcript');
  }
  const root = input as { transcription?: unknown };
  if (!Array.isArray(root.transcription)) throw new Error('invalid whisper transcript: missing transcription');
  const words: Word[] = [];
  for (const seg of root.transcription as WhisperSegment[]) {
    if (typeof seg !== 'object' || seg === null || !Array.isArray(seg.tokens)) continue;
    for (const tok of seg.tokens as WhisperToken[]) {
      if (typeof tok !== 'object' || tok === null) continue;
      const text = typeof tok.text === 'string' ? tok.text.trim() : '';
      if (isSpecialToken(text)) continue;
      const offsets = tok.offsets as { from?: unknown; to?: unknown } | undefined;
      const from = typeof offsets?.from === 'number' ? offsets.from : NaN;
      const to = typeof offsets?.to === 'number' ? offsets.to : NaN;
      if (!Number.isFinite(from) || !Number.isFinite(to) || to - from <= 0) continue;
      words.push({ text, start: from / 1000, end: to / 1000 });
    }
  }
  return words;
}
