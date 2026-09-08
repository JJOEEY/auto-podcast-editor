export type Preset = 'vertical' | 'horizontal';

export interface Word { text: string; start: number; end: number; }

export interface Clip { id: string; track: 'V1' | 'A1' | 'A2' | 'CC'; start: number; end: number; label: string; }

export type ProposalKind = 'silence' | 'filler' | 'low-audio';

export interface CutProposal { id: string; start: number; end: number; kind: ProposalKind; reason: string; confidence: number; }

export interface CaptionLine { id: string; start: number; end: number; text: string; }

export interface Settings { silenceSec: number; fillerMaxSec: number; lowAudioDb: number; topicPauseSec: number; model: 'tiny' | 'base' | 'small'; }

export interface Project {
  version: 1;
  name: string;
  sourcePath: string;
  durationSec: number;
  clips: Clip[];
  proposals: CutProposal[];
  captions: CaptionLine[];
  preset: Preset;
  settings: Settings;
}
