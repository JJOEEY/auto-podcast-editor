export interface FfmpegCapabilities {
  encoders: string[];
  filters: string[];
  hwaccels: string[];
  smokeTestedFormats: string[];
  vramBytes: number | null;
  llmMode: 'gpu' | 'cpu' | 'rule-based';
}

const GPU_LLM_VRAM_BYTES = 8 * 1024 ** 3;

export function parseCapabilityNames(output: string): string[] {
  return [...new Set(output.split(/\r?\n/).map((line) => line.trim().split(/\s+/)[1]).filter(Boolean))];
}

export function parseVramBytes(output: string): number | null {
  const values = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => Number(line.replace(/[^0-9]/g, '')))
    .filter((value) => Number.isFinite(value) && value > 0);
  return values.length > 0 ? Math.max(...values) : null;
}

export function llmModeForVram(vramBytes: number | null): FfmpegCapabilities['llmMode'] {
  if (vramBytes !== null && vramBytes >= GPU_LLM_VRAM_BYTES) return 'gpu';
  return 'rule-based';
}

export function buildCapabilitySnapshot(encoders: string, filters: string, hwaccels: string, vramBytes: number | null = null, smokeTestedFormats: string[] = []): FfmpegCapabilities {
  return {
    encoders: parseCapabilityNames(encoders),
    filters: parseCapabilityNames(filters),
    hwaccels: hwaccels.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
    smokeTestedFormats: [...new Set(smokeTestedFormats)],
    vramBytes,
    llmMode: llmModeForVram(vramBytes),
  };
}
