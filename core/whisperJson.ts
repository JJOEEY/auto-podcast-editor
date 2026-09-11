import type { Word } from './types.js';

interface WhisperToken {
  text?: unknown;
  offsets?: unknown;
  p?: unknown;
}

interface WhisperSegment {
  tokens?: unknown;
}

export interface WhisperTokenStats {
  rawTokenCount: number;
  nonSpecialTokenCount: number;
  zeroDurationTokenCount: number;
  invalidDurationTokenCount: number;
}

export interface ParsedWhisperJson {
  words: Word[];
  stats: WhisperTokenStats;
}

function isSpecialToken(text: string): boolean {
  return /^\[.*\]$/.test(text) || text === '';
}

/** Map whisper.cpp --output-json-full tokens to Word[]. Offsets are milliseconds. */
export function parseWhisperJsonWithStats(input: unknown): ParsedWhisperJson {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('invalid whisper transcript');
  }
  const root = input as { transcription?: unknown };
  if (!Array.isArray(root.transcription)) throw new Error('invalid whisper transcript: missing transcription');
  const words: Word[] = [];
  const stats: WhisperTokenStats = {
    rawTokenCount: 0,
    nonSpecialTokenCount: 0,
    zeroDurationTokenCount: 0,
    invalidDurationTokenCount: 0,
  };
  for (const seg of root.transcription as WhisperSegment[]) {
    if (typeof seg !== 'object' || seg === null || !Array.isArray(seg.tokens)) continue;
    stats.rawTokenCount += seg.tokens.length;
    for (const tok of seg.tokens as WhisperToken[]) {
      if (typeof tok !== 'object' || tok === null) continue;
      const text = typeof tok.text === 'string' ? tok.text.trim() : '';
      if (isSpecialToken(text)) continue;
      stats.nonSpecialTokenCount += 1;
      const offsets = tok.offsets as { from?: unknown; to?: unknown } | undefined;
      const from = typeof offsets?.from === 'number' ? offsets.from : NaN;
      const to = typeof offsets?.to === 'number' ? offsets.to : NaN;
      if (!Number.isFinite(from) || !Number.isFinite(to)) {
        stats.invalidDurationTokenCount += 1;
        continue;
      }
      if (to <= from) {
        stats.zeroDurationTokenCount += 1;
        continue;
      }
      const confidence = typeof tok.p === 'number' && Number.isFinite(tok.p) ? Math.max(0, Math.min(1, tok.p)) : undefined;
      words.push(confidence === undefined ? { text, start: from / 1000, end: to / 1000 } : { text, start: from / 1000, end: to / 1000, confidence });
    }
  }
  return { words, stats };
}

export function parseWhisperJson(input: unknown): Word[] {
  return parseWhisperJsonWithStats(input).words;
}
