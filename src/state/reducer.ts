import type { CaptionLine, Clip, CutProposal, Preset, Project, Settings, SfxClip, TransitionConfig } from '../../core/types.js';

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
  | { type: 'set-preset'; preset: Preset }
  | { type: 'add-sfx'; clip: SfxClip }
  | { type: 'remove-sfx'; id: string }
  | { type: 'set-transition-all'; transition: TransitionConfig }
  | { type: 'split-clip'; id: string; at: number }
  | { type: 'delete-clip'; id: string }
  | { type: 'undo' }
  | { type: 'redo' };

export interface State { past: Project[]; present: Project; future: Project[]; }

export function createState(init: Init): State {
  const present: Project = { version: 1, ...init, settings: { ...init.settings }, clips: [], proposals: [], captions: [], sfx: [], subtitleStyle: 'karaoke' };
  return { past: [], present, future: [] };
}

function push(state: State, present: Project): State {
  return { past: [...state.past, state.present], present, future: [] };
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
      return {
        past: [],
        present: {
          ...action.project,
          settings: { ...action.project.settings },
          clips: action.project.clips.map((c) => ({ ...c })),
          captions: action.project.captions.map((c) => ({ ...c })),
          proposals: action.project.proposals.map((p) => ({ ...p })),
          sfx: action.project.sfx?.map((clip) => ({ ...clip })) ?? [],
          subtitleStyle: action.project.subtitleStyle ?? 'karaoke',
        },
        future: [],
      };
    case 'set-preset':
      if (state.present.preset === action.preset) return state;
      return push(state, { ...state.present, preset: action.preset });
    case 'add-sfx':
      return push(state, { ...state.present, sfx: [...(state.present.sfx ?? []), { ...action.clip }] });
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
    case 'split-clip': {
      if (!Number.isFinite(action.at)) return state;
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
      if (!state.present.clips.some((c) => c.id === action.id)) return state;
      return push(state, { ...state.present, clips: state.present.clips.filter((c) => c.id !== action.id) });
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
