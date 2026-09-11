import type { EditorCommand, ProjectV2 } from './types.js';

export const LOCAL_LLM_LIMITS = {
  timeoutMs: 120_000,
  contextTokens: 4096,
  inputTokens: 3072,
  outputTokens: 1024,
  maxCommands: 8,
} as const;

export const EDIT_COMMAND_JSON_SCHEMA = JSON.stringify({
  type: 'object',
  required: ['commands'],
  properties: {
    commands: {
      type: 'array',
      maxItems: LOCAL_LLM_LIMITS.maxCommands,
      items: {
        oneOf: [
          { type: 'object', properties: { id: { type: 'string' }, type: { const: 'apply-cut-proposals' }, proposalIds: { type: 'array', items: { type: 'string' } } }, required: ['id', 'type', 'proposalIds'], additionalProperties: false },
          { type: 'object', properties: { id: { type: 'string' }, type: { const: 'set-subtitle-style' }, style: { enum: ['minimal', 'karaoke', 'pop', 'typewriter', 'box', 'neon'] } }, required: ['id', 'type', 'style'], additionalProperties: false },
          { type: 'object', properties: { id: { type: 'string' }, type: { const: 'set-transition-all' }, transition: { type: 'object', properties: { type: { type: 'string' }, durationFrames: { type: 'integer', minimum: 1 } }, required: ['type', 'durationFrames'], additionalProperties: false } }, required: ['id', 'type', 'transition'], additionalProperties: false },
          { type: 'object', properties: { id: { type: 'string' }, type: { const: 'set-track-volume' }, trackId: { type: 'string' }, volumeDb: { type: 'number', minimum: -60, maximum: 12 } }, required: ['id', 'type', 'trackId', 'volumeDb'], additionalProperties: false },
          { type: 'object', properties: { id: { type: 'string' }, type: { const: 'set-voice-preset' }, preset: { enum: ['none', 'clean', 'podcast', 'broadcast', 'warm'] } }, required: ['id', 'type', 'preset'], additionalProperties: false },
        ],
      },
    },
  },
  additionalProperties: false,
});

export function buildLocalLlmPrompt(userText: string, project: ProjectV2): string {
  const context = {
    revision: project.revision ?? 0,
    durationSec: project.durationSec,
    tracks: project.tracks.map((track) => ({ id: track.id, kind: track.kind, name: track.name, locked: Boolean(track.locked) })),
    proposals: project.proposals.slice(0, 200).map((proposal) => ({ id: proposal.id, kind: proposal.kind, start: proposal.start, end: proposal.end, confidence: proposal.confidence })),
    items: project.items.slice(0, 200).map((item) => ({ id: item.id, trackId: item.trackId, startFrame: item.startFrame, durationFrames: item.durationFrames })),
  };
  return [
    'You are an offline editor command parser. Return JSON only.',
    'Do not explain. Do not call shell, FFmpeg, files, network, or tools.',
    'Return {"commands":[...]} using only these command shapes:',
    '{"id":string,"type":"apply-cut-proposals","proposalIds":string[]}',
    '{"id":string,"type":"set-subtitle-style","style":"minimal|karaoke|pop|typewriter|box|neon"}',
    '{"id":string,"type":"set-transition-all","transition":{"type":string,"durationFrames":number}}',
    '{"id":string,"type":"set-track-volume","trackId":string,"volumeDb":number}',
    '{"id":string,"type":"set-voice-preset","preset":"none|clean|podcast|broadcast|warm"}',
    'Never invent ids. If the request is ambiguous or unsafe, return {"commands":[]}.',
    `Project context: ${JSON.stringify(context)}`,
    `User command: ${userText.slice(0, 12000)}`,
  ].join('\n');
}

function isEditorCommand(value: unknown): value is EditorCommand {
  if (!value || typeof value !== 'object') return false;
  const command = value as Record<string, unknown>;
  if (typeof command.id !== 'string' || !command.id.trim() || typeof command.type !== 'string') return false;
  if (command.type === 'apply-cut-proposals') return Array.isArray(command.proposalIds) && command.proposalIds.every((id) => typeof id === 'string');
  if (command.type === 'set-subtitle-style') return ['minimal', 'karaoke', 'pop', 'typewriter', 'box', 'neon'].includes(String(command.style));
  if (command.type === 'set-transition-all') {
    const transition = command.transition as Record<string, unknown> | undefined;
    return Boolean(transition && typeof transition.type === 'string' && Number.isInteger(transition.durationFrames) && Number(transition.durationFrames) > 0);
  }
  if (command.type === 'set-track-volume') return typeof command.trackId === 'string' && Number.isFinite(command.volumeDb) && Number(command.volumeDb) >= -60 && Number(command.volumeDb) <= 12;
  if (command.type === 'set-voice-preset') return ['none', 'clean', 'podcast', 'broadcast', 'warm'].includes(String(command.preset));
  return false;
}

export function parseLocalLlmCommands(raw: string): EditorCommand[] {
  const candidates: unknown[] = [];
  for (let start = 0; start < raw.length; start += 1) {
    if (raw[start] !== '{') continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < raw.length; index += 1) {
      const character = raw[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') { inString = true; continue; }
      if (character === '{') depth += 1;
      if (character === '}') {
        depth -= 1;
        if (depth === 0) {
          try { candidates.push(JSON.parse(raw.slice(start, index + 1))); } catch { /* not a JSON object */ }
          break;
        }
      }
    }
  }
  const parsed = [...candidates].reverse().find((value) => value && typeof value === 'object' && Array.isArray((value as { commands?: unknown }).commands));
  const commands = parsed && typeof parsed === 'object' && Array.isArray((parsed as { commands?: unknown }).commands)
    ? (parsed as { commands: unknown[] }).commands
    : [];
  return commands.filter(isEditorCommand).slice(0, LOCAL_LLM_LIMITS.maxCommands);
}
