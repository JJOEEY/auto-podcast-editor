import type { Word } from '../core/types.js';
import type { ExportRequest } from '../core/export.js';
import type { Project } from '../core/types.js';
import type { SfxAsset } from '../core/sfxLibrary.js';

interface JobProgress {
  name: string;
  fraction: number;
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
  capabilities(): Promise<{ encoders: string[]; filters: string[]; hwaccels: string[] }>;
  listSfx(): Promise<SfxAsset[]>;
  importSfx(sourcePath: string): Promise<SfxAsset>;
  probe(filePath: string): Promise<number>;
  transcribe(filePath: string, modelPath: string): Promise<{ jsonPath: string; words: Word[] }>;
  render(project: Project, request: ExportRequest): Promise<unknown>;
  cancel(): Promise<void>;
  reset(): Promise<void>;
  onProgress(cb: (progress: JobProgress) => void): () => void;
}

declare global {
  interface Window {
    api: DesktopApi;
  }
}

export {};
