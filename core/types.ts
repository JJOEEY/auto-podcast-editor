export type Preset = 'vertical' | 'horizontal';

export interface Word { text: string; start: number; end: number; confidence?: number; }

export interface Timebase { fpsNum: number; fpsDen: number; }

export type MediaKind = 'video' | 'audio' | 'image';

export interface MediaAsset {
  thumbnailUrl?: string;
  id: string;
  path: string;
  kind: MediaKind;
  durationSec: number;
  width?: number;
  height?: number;
  fps?: Timebase;
  sampleRate?: number;
  channels?: number;
  codec?: string;
  proxyPath?: string;
  fingerprint?: string;
}

export type TrackKind = 'video' | 'audio' | 'caption' | 'sfx' | 'graphics';

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  index: number;
  locked?: boolean;
  muted?: boolean;
  solo?: boolean;
  volumeDb?: number;
  hidden?: boolean;
}

export interface SourceRange {
  sourceIn: number;
  sourceOut: number;
  handleBeforeFrames: number;
  handleAfterFrames: number;
}

export interface Marker {
  id: string;
  frame: number;
  label: string;
  color?: string;
}

export interface ProxyMetadata {
  path: string;
  width: number;
  height: number;
  codec: string;
  status: 'pending' | 'ready' | 'failed';
  sourceFingerprint?: string;
}

export interface AudioChain {
  id: string;
  trackId: string;
  enabled: boolean;
  volumeDb?: number;
  denoise?: { enabled: boolean; amount: number };
  highpassHz?: number;
  eq?: Array<{ frequency: number; gainDb: number; q: number }>;
  deEsser?: { enabled: boolean; frequency: number; amount: number };
  compressor?: { enabled: boolean; thresholdDb: number; ratio: number; attackMs: number; releaseMs: number };
  loudness?: { enabled: boolean; integratedLufs: number; truePeakDbtp: number };
  limiter?: { enabled: boolean; ceilingDb: number };
}

export interface AudioDuckingSettings {
  enabled: boolean;
  voiceTrackId: string;
  backgroundTrackIds: string[];
  threshold: number;
  ratio: number;
  attackMs: number;
  releaseMs: number;
}

export type SubtitleStyleId = 'minimal' | 'karaoke' | 'pop' | 'typewriter' | 'box' | 'neon';

export type TransitionType =
  | 'hard-cut' | 'fade' | 'dip-black' | 'dip-white' | 'slide-left' | 'slide-right'
  | 'push-left' | 'push-right' | 'wipe' | 'zoom' | 'blur' | 'glitch' | 'flash' | 'film-burn'
  | 'light-leak' | 'whip' | 'shake' | 'pixel-dissolve' | 'shape-wipe' | 'elastic-push';

export interface TransitionConfig {
  type: TransitionType;
  durationFrames: number;
  intensity?: number;
}

export interface SfxClip {
  id: string;
  path: string;
  start: number;
  duration: number;
  volume: number;
  category?: string;
  sourceIn?: number;
  sourceOut?: number;
  fadeInSec?: number;
  fadeOutSec?: number;
  muted?: boolean;
  /** Audio role/track. Legacy projects without this field are migrated to A2. */
  trackId?: string;
}

export interface Clip {
  assetId?: string;
  sourceIn?: number;
  id: string;
  track: 'V1' | 'A1' | 'A2' | 'CC';
  start: number;
  end: number;
  label: string;
  transitionOut?: TransitionConfig;
}

export interface TimelineItem {
  id: string;
  trackId: string;
  assetId?: string;
  label: string;
  startFrame: number;
  durationFrames: number;
  source?: SourceRange;
  transitionKind?: TransitionType;
  effects?: Array<{ id: string; type: string; enabled: boolean; params: Record<string, number | string | boolean> }>;
  keyframes?: Array<{ property: string; frame: number; value: number | string | boolean }>;
}

export type RenderBackend = 'preview' | 'export';

export interface RenderGraphNode {
  id: string;
  kind: 'source' | 'filter' | 'caption' | 'audio' | 'sink';
  name: string;
  params: Record<string, number | string | boolean>;
}

export interface RenderGraph {
  version: 1;
  nodes: RenderGraphNode[];
  edges: Array<{ from: string; to: string }>;
}

export type ProposalKind = 'silence' | 'filler' | 'low-audio';

export interface CutProposal { id: string; start: number; end: number; kind: ProposalKind; reason: string; confidence: number; }

export interface CaptionLine {
  id: string;
  start: number;
  end: number;
  text: string;
  words?: Word[];
}

export interface Settings { silenceSec: number; fillerMaxSec: number; lowAudioDb: number; topicPauseSec: number; model: 'tiny' | 'base' | 'small'; }

export interface Project {
  version: 1 | 2;
  name: string;
  sourcePath: string;
  durationSec: number;
  clips: Clip[];
  proposals: CutProposal[];
  captions: CaptionLine[];
  preset: Preset;
  settings: Settings;
  sfx?: SfxClip[];
  subtitleStyle?: SubtitleStyleId;
}

/** Additive v2 shape. Legacy fields remain during migration so existing render code can coexist. */
export interface ProjectV2 extends Project {
  version: 2;
  timebase: Timebase;
  assets: MediaAsset[];
  tracks: Track[];
  items: TimelineItem[];
  markers: Marker[];
  audioChains: AudioChain[];
  proxies: Record<string, ProxyMetadata>;
  appliedCommandIds: string[];
  audioDucking?: AudioDuckingSettings;
  renderGraph?: RenderGraph;
  voicePreset?: 'none' | 'clean' | 'podcast' | 'broadcast' | 'warm';
  /** Monotonic revision used to invalidate stale command previews. */
  revision?: number;
}

export type EditorCommand =
  | { id: string; type: 'remove-timeline-range'; fromFrame: number; toFrame: number; trackIds?: string[] }
  | { id: string; type: 'apply-cut-proposals'; proposalIds: string[] }
  | { id: string; type: 'set-subtitle-style'; style: SubtitleStyleId }
  | { id: string; type: 'set-transition-all'; transition: TransitionConfig }
  | { id: string; type: 'set-track-volume'; trackId: string; volumeDb: number }
  | { id: string; type: 'set-voice-preset'; preset: NonNullable<ProjectV2['voicePreset']> };
