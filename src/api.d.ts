import type { Word } from '../core/types.js';

interface JobProgress {
  name: string;
  fraction: number;
}

interface DesktopApi {
  openVideo(): Promise<string | null>;
  openModel(): Promise<string | null>;
  probe(filePath: string): Promise<number>;
  transcribe(filePath: string, modelPath: string): Promise<{ jsonPath: string; words: Word[] }>;
  render(projectPath: string, preset: 'vertical' | 'horizontal', propsPath: string): Promise<unknown>;
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
