import type { CaptionLine, Clip, CutProposal, Preset, Project, ProjectV2, Settings, SfxClip, SubtitleStyleId, TransitionConfig } from '../../core/types.js';
import { migrateProject, syncProjectTimeline } from '../../core/projectMigration.ts';

export interface Init {
  name: string;
  sourcePath: string;
  durationSec: number;
  preset: Preset;
  settings: Settings;
}

export type Action =
  | { type: 'apply-auto-cuts'; clips: Clip[] }
  | { type: 'apply-analysis'; clips: Clip[]; captions: CaptionLine[]; proposals: CutProposal[] }
  | { type: 'open-project'; project: Project }
  | { type: 'apply-editor-project'; project: ProjectV2 }
  | { type: 'set-preset'; preset: Preset }
  | { type: 'add-sfx'; clip: SfxClip }
  | { type: 'update-sfx'; id: string; patch: Partial<Omit<SfxClip, 'id'>> }
  | { type: 'duplicate-sfx'; id: string }
  | { type: 'remove-sfx'; id: string }
  | { type: 'set-transition-all'; transition: TransitionConfig }
  | { type: 'set-subtitle-style'; style: SubtitleStyleId }
  | { type: 'set-voice-preset'; preset: NonNullable<ProjectV2['voicePreset']> }
  | { type: 'set-track-muted'; id: string; muted: boolean }
  | { type: 'set-track-solo'; id: string; solo: boolean }
  | { type: 'set-track-volume'; id: string; volumeDb: number }
  | { type: 'set-track-locked'; id: string; locked: boolean }
  | { type: 'set-track-hidden'; id: string; hidden: boolean }
  | { type: 'move-clip'; id: string; delta: number }
  | { type: 'move-clips'; ids: string[]; delta: number }
  | { type: 'set-clip-track'; id: string; track: Clip['track'] }
  | { type: 'trim-clip'; id: string; edge: 'start' | 'end'; delta: number }
  | { type: 'split-clip'; id: string; at: number }
  | { type: 'delete-clip'; id: string }
  | { type: 'delete-clips'; ids: string[] }
  | { type: 'ripple-delete-clip'; id: string }
  | { type: 'undo' }
  | { type: 'redo' };

export interface State { past: ProjectV2[]; present: ProjectV2; future: ProjectV2[]; }

export function createState(init: Init): State {
  const present = migrateProject({ version: 1, ...init, settings: { ...init.settings }, clips: [], proposals: [], captions: [], sfx: [], subtitleStyle: 'karaoke' });
  return { past: [], present, future: [] };
}

function push(state: State, present: ProjectV2, syncTimeline = true): State {
  const next = syncTimeline ? syncProjectTimeline(present) : present;
  return { past: [...state.past, state.present], present: { ...next, revision: (state.present.revision ?? 0) + 1 }, future: [] };
}

function isEditableClip(state: State, clip: Clip | undefined): boolean {
  if (!clip) return false;
  return !state.present.tracks.find((track) => track.id === clip.track)?.locked;
}

export function reduce(state: State, action: Action): State {
  switch (action.type) {
    case 'apply-auto-cuts':
      return push(state, { ...state.present, clips: action.clips.map((c) => ({ ...c })) });
    case 'apply-analysis':
      return push(state, {
        ...state.present,
        clips: action.clips.map((c) => ({ ...c })),
        captions: action.captions.map((c) => ({ ...c })),
        proposals: action.proposals.map((p) => ({ ...p })),
      });
    case 'open-project':
      {
        const project = migrateProject(action.project);
      return {
        past: [],
        present: {
          ...project,
          settings: { ...project.settings },
          clips: project.clips.map((c) => ({ ...c })),
          captions: project.captions.map((c) => ({ ...c, words: c.words?.map((word) => ({ ...word })) })),
          proposals: project.proposals.map((p) => ({ ...p })),
          sfx: project.sfx?.map((clip) => ({ ...clip })) ?? [],
          assets: project.assets.map((asset) => ({ ...asset, fps: asset.fps ? { ...asset.fps } : undefined })),
          tracks: project.tracks.map((track) => ({ ...track })),
          items: project.items.map((item) => ({ ...item, source: item.source ? { ...item.source } : undefined, effects: item.effects?.map((effect) => ({ ...effect, params: { ...effect.params } })), keyframes: item.keyframes?.map((keyframe) => ({ ...keyframe })) })),
          markers: project.markers.map((marker) => ({ ...marker })),
          audioChains: project.audioChains.map((chain) => ({ ...chain, eq: chain.eq?.map((band) => ({ ...band })) })),
          proxies: { ...project.proxies },
          appliedCommandIds: [...project.appliedCommandIds],
          subtitleStyle: project.subtitleStyle ?? 'karaoke',
          revision: project.revision,
        },
        future: [],
      };
      }
    case 'apply-editor-project':
      return push(state, action.project, false);
    case 'set-preset':
      if (state.present.preset === action.preset) return state;
      return push(state, { ...state.present, preset: action.preset });
    case 'add-sfx':
      return push(state, { ...state.present, sfx: [...(state.present.sfx ?? []), { ...action.clip }] });
    case 'update-sfx': {
      const sfx = state.present.sfx ?? [];
      if (!sfx.some((clip) => clip.id === action.id)) return state;
      return push(state, { ...state.present, sfx: sfx.map((clip) => clip.id === action.id ? { ...clip, ...action.patch } : clip) });
    }
    case 'duplicate-sfx': {
      const source = (state.present.sfx ?? []).find((clip) => clip.id === action.id);
      if (!source) return state;
      const copy = { ...source, id: `${source.id}-copy-${Date.now()}`, start: source.start + source.duration };
      return push(state, { ...state.present, sfx: [...(state.present.sfx ?? []), copy] });
    }
    case 'remove-sfx': {
      const sfx = state.present.sfx ?? [];
      if (!sfx.some((clip) => clip.id === action.id)) return state;
      return push(state, { ...state.present, sfx: sfx.filter((clip) => clip.id !== action.id) });
    }
    case 'set-transition-all':
      return push(state, {
        ...state.present,
        clips: state.present.clips.map((clip, index, all) => ({
          ...clip,
          transitionOut: index === all.length - 1 ? undefined : { ...action.transition },
        })),
      });
    case 'set-subtitle-style':
      if (state.present.subtitleStyle === action.style) return state;
      return push(state, { ...state.present, subtitleStyle: action.style });
    case 'set-voice-preset':
      if (state.present.voicePreset === action.preset) return state;
      return push(state, { ...state.present, voicePreset: action.preset });
    case 'set-track-muted': {
      const track = state.present.tracks.find((item) => item.id === action.id);
      if (!track || track.muted === action.muted) return state;
      return push(state, { ...state.present, tracks: state.present.tracks.map((item) => item.id === action.id ? { ...item, muted: action.muted } : item) });
    }
    case 'set-track-solo': {
      const track = state.present.tracks.find((item) => item.id === action.id);
      if (!track || track.solo === action.solo) return state;
      return push(state, { ...state.present, tracks: state.present.tracks.map((item) => item.id === action.id ? { ...item, solo: action.solo } : item) });
    }
    case 'set-track-volume': {
      const track = state.present.tracks.find((item) => item.id === action.id);
      if (!track || !Number.isFinite(action.volumeDb) || track.volumeDb === action.volumeDb) return state;
      return push(state, { ...state.present, tracks: state.present.tracks.map((item) => item.id === action.id ? { ...item, volumeDb: action.volumeDb } : item) });
    }
    case 'set-track-locked': {
      const track = state.present.tracks.find((item) => item.id === action.id);
      if (!track || track.locked === action.locked) return state;
      return push(state, { ...state.present, tracks: state.present.tracks.map((item) => item.id === action.id ? { ...item, locked: action.locked } : item) });
    }
    case 'set-track-hidden': {
      const track = state.present.tracks.find((item) => item.id === action.id);
      if (!track || track.hidden === action.hidden) return state;
      return push(state, { ...state.present, tracks: state.present.tracks.map((item) => item.id === action.id ? { ...item, hidden: action.hidden } : item) });
    }
    case 'move-clip': {
      const clip = state.present.clips.find((item) => item.id === action.id);
      if (!clip || !isEditableClip(state, clip)) return state;
      const duration = clip.end - clip.start;
      const start = Math.max(0, clip.start + action.delta);
      const end = start + duration;
      return push(state, { ...state.present, clips: state.present.clips.map((item) => item.id === action.id ? { ...item, start, end } : item) });
    }
    case 'move-clips': {
      const ids = new Set(action.ids);
      if (ids.size === 0 || !Number.isFinite(action.delta)) return state;
      const movable = state.present.clips.filter((clip) => ids.has(clip.id) && !state.present.tracks.find((track) => track.id === clip.track)?.locked);
      if (movable.length === 0) return state;
      return push(state, {
        ...state.present,
        clips: state.present.clips.map((clip) => {
          if (!ids.has(clip.id) || state.present.tracks.find((track) => track.id === clip.track)?.locked) return clip;
          const duration = clip.end - clip.start;
          const start = Math.max(0, clip.start + action.delta);
          return { ...clip, start, end: start + duration };
        }),
      });
    }
    case 'set-clip-track': {
      if (!state.present.tracks.some((track) => track.id === action.track) || !state.present.clips.some((clip) => clip.id === action.id)) return state;
      return push(state, { ...state.present, clips: state.present.clips.map((clip) => clip.id === action.id ? { ...clip, track: action.track } : clip) });
    }
    case 'trim-clip': {
      const clip = state.present.clips.find((item) => item.id === action.id);
      if (!clip || !isEditableClip(state, clip)) return state;
      const next = action.edge === 'start'
        ? { ...clip, start: Math.min(clip.end - 1 / 30, Math.max(0, clip.start + action.delta)) }
        : { ...clip, end: Math.max(clip.start + 1 / 30, clip.end + action.delta) };
      if (next.start === clip.start && next.end === clip.end) return state;
      return push(state, { ...state.present, clips: state.present.clips.map((item) => item.id === action.id ? next : item) });
    }
    case 'split-clip': {
      if (!Number.isFinite(action.at)) return state;
      const target = state.present.clips.find((clip) => clip.id === action.id);
      if (!target || !isEditableClip(state, target)) return state;
      const clips: Clip[] = [];
      let didSplit = false;
      for (const c of state.present.clips) {
        if (c.id !== action.id || action.at <= c.start || action.at >= c.end) {
          clips.push(c);
          continue;
        }
        didSplit = true;
        clips.push({ ...c, end: action.at });
        clips.push({ ...c, id: `${c.id}@${action.at}`, start: action.at });
      }
      if (!didSplit) return state;
      return push(state, { ...state.present, clips });
    }
    case 'delete-clip':
      if (!isEditableClip(state, state.present.clips.find((c) => c.id === action.id))) return state;
      return push(state, { ...state.present, clips: state.present.clips.filter((c) => c.id !== action.id) });
    case 'delete-clips': {
      const ids = new Set(action.ids);
      const next = state.present.clips.filter((clip) => !ids.has(clip.id) || state.present.tracks.find((track) => track.id === clip.track)?.locked);
      return next.length === state.present.clips.length ? state : push(state, { ...state.present, clips: next });
    }
    case 'ripple-delete-clip': {
      const target = state.present.clips.find((clip) => clip.id === action.id);
      if (!target || state.present.tracks.find((track) => track.id === target.track)?.locked) return state;
      const duration = target.end - target.start;
      return push(state, {
        ...state.present,
        clips: state.present.clips
          .filter((clip) => clip.id !== target.id)
          .map((clip) => clip.track === target.track && clip.start >= target.end ? { ...clip, start: clip.start - duration, end: clip.end - duration } : clip),
      });
    }
    case 'undo': {
      if (state.past.length === 0) return state;
      const present = state.past[state.past.length - 1];
      return { past: state.past.slice(0, -1), present, future: [state.present, ...state.future] };
    }
    case 'redo': {
      if (state.future.length === 0) return state;
      const [present, ...future] = state.future;
      return { past: [...state.past, state.present], present, future };
    }
    default:
      return state;
  }
}
