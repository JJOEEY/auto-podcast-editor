export interface WhisperProfile {
  id: string;
  outputKey: string;
  modelTier: string;
  args: string[];
}

export const DEFAULT_WHISPER_PROFILES = ['base', 'small', 'small+DTW'] as const;

function genericProfile(id: string): WhisperProfile {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(id)) throw new Error(`Whisper profile không hợp lệ: ${id}`);
  return { id, outputKey: id, modelTier: id, args: ['--max-len', '1'] };
}

export function resolveWhisperProfile(value: string): WhisperProfile {
  const id = value.trim();
  const normalized = id.toLowerCase();
  if (normalized === 'small+dtw') {
    return {
      id: 'small+DTW',
      outputKey: 'small-dtw',
      modelTier: 'small',
      args: ['--max-len', '1', '--word-thold', '0.10', '--no-flash-attn', '--dtw', 'small'],
    };
  }
  return genericProfile(id);
}
