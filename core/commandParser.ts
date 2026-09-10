import type { SubtitleStyleId, TransitionType } from './types.js';

export type EditCommand =
  | { type: 'remove-silence'; confidence: number }
  | { type: 'subtitle-style'; style: SubtitleStyleId; confidence: number }
  | { type: 'transition-style'; transition: TransitionType; confidence: number }
  | { type: 'voice-preset'; preset: 'none' | 'clean' | 'podcast' | 'broadcast' | 'warm'; confidence: number };

export function parseEditCommand(input: string): EditCommand[] {
  const text = input.trim().toLowerCase();
  const commands: EditCommand[] = [];
  if (/remove|cut|xóa/.test(text) && /silence|pause|im lặng|khoảng nghỉ/.test(text)) {
    commands.push({ type: 'remove-silence', confidence: 0.94 });
  }
  const style = text.match(/(karaoke|pop|typewriter|box|neon|minimal)/)?.[1] as SubtitleStyleId | undefined;
  if (style) commands.push({ type: 'subtitle-style', style, confidence: 0.92 });
  const transition = text.match(/(fade|glitch|film burn|whoosh|slide|wipe)/)?.[1];
  if (transition) {
    const mapped: TransitionType = transition === 'film burn' ? 'film-burn' : transition === 'whoosh' ? 'slide-right' : transition as TransitionType;
    commands.push({ type: 'transition-style', transition: mapped, confidence: 0.82 });
  }
  const voice = text.match(/(podcast|clean|broadcast|warm)/)?.[1] as 'podcast' | 'clean' | 'broadcast' | 'warm' | undefined;
  if (voice) commands.push({ type: 'voice-preset', preset: voice, confidence: 0.88 });
  return commands;
}
