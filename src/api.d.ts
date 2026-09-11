import type { Word } from '../core/types.js';
import type { ExportRequest } from '../core/export.js';
import type { AudioChain, EditorCommand, Project, ProjectV2 } from '../core/types.js';
import type { SfxAsset } from '../core/sfxLibrary.js';
import type { WaveformCache } from '../core/waveform.js';
import type { RuntimeAssetProgress } from '../electron/runtimeAssets.js';

interface JobProgress {
  name: string;
  fraction: number;
}

interface RuntimeCheck {
  name: string;
  ok: boolean;
  path?: string | null;
  error?: string | null;
  vramBytes?: number | null;
  llmMode?: 'gpu' | 'cpu' | 'rule-based';
}

interface RuntimeAssetState {
  id: string;
  label: string;
  kind: 'file' | 'zip';
  remotePath: string;
  installPath: string;
  entryPath?: string;
  sha256: string;
  bytes: number;
  required: boolean;
  path: string;
  ready: boolean;
  error?: string;
}

interface DesktopApi {
  openVideo(): Promise<string | null>;
  openModel(): Promise<string | null>;
  defaultModel(): Promise<string | null>;
  openDirectory(): Promise<string | null>;
  openSfx(): Promise<string | null>;
  openProject(): Promise<string | null>;
  saveProject(suggestedName: string): Promise<string | null>;
  loadProject(filePath: string): Promise<Project>;
  writeProject(filePath: string, project: Project): Promise<void>;
  capabilities(): Promise<{ encoders: string[]; filters: string[]; hwaccels: string[]; smokeTestedFormats: string[]; vramBytes: number | null; llmMode: 'gpu' | 'cpu' | 'rule-based' }>;
  doctor(): Promise<Record<string, RuntimeCheck>>;
  runtimeAssets(): Promise<{ root: string; baseUrlConfigured: boolean; ready: boolean; assets: RuntimeAssetState[] }>;
  downloadRuntime(): Promise<{ root: string; baseUrlConfigured: boolean; ready: boolean; assets: RuntimeAssetState[] }>;
  listSfx(): Promise<SfxAsset[]>;
  importSfx(sourcePath: string): Promise<SfxAsset>;
  probe(filePath: string): Promise<number>;
  mediaUrl(filePath: string): Promise<string>;
  waveform(filePath: string): Promise<WaveformCache>;
  audioPreview(filePath: string, preset: 'none' | 'clean' | 'podcast' | 'broadcast' | 'warm', chain?: AudioChain): Promise<{ path: string; cacheHit: boolean }>;
  transcribe(filePath: string, modelPath: string): Promise<{ jsonPath: string; words: Word[] }>;
  aiCommand(text: string, project: ProjectV2, cpuOptIn: boolean): Promise<{ commands: EditorCommand[]; revision: number; mode: 'gpu' | 'cpu' }>;
  render(project: Project, request: ExportRequest): Promise<unknown>;
  cancel(): Promise<void>;
  reset(): Promise<void>;
  captureMode(): Promise<boolean>;
  captureProject(): Promise<Project | null>;
  onProgress(cb: (progress: JobProgress) => void): () => void;
  onRuntimeAssetProgress(cb: (progress: RuntimeAssetProgress) => void): () => void;
}

declare global {
  interface Window {
    api: DesktopApi;
  }
}

export {};
