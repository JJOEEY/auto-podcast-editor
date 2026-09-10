export interface FfmpegCapabilities {
  encoders: string[];
  filters: string[];
  hwaccels: string[];
}

export function parseCapabilityNames(output: string): string[] {
  return [...new Set(output.split(/\r?\n/).map((line) => line.trim().split(/\s+/)[1]).filter(Boolean))];
}

export function buildCapabilitySnapshot(encoders: string, filters: string, hwaccels: string): FfmpegCapabilities {
  return {
    encoders: parseCapabilityNames(encoders),
    filters: parseCapabilityNames(filters),
    hwaccels: hwaccels.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
  };
}
