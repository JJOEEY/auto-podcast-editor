import { describe, expect, it } from 'vitest';
import { buildCapabilitySnapshot, llmModeForVram, parseCapabilityNames, parseVramBytes } from '../electron/capabilities.js';

describe('FFmpeg capabilities', () => {
  it('parses encoder names', () => {
    expect(parseCapabilityNames(' V....D libx264\n V....D libx265')).toEqual(['libx264', 'libx265']);
  });

  it('builds a capability snapshot', () => {
    const result = buildCapabilitySnapshot(' V....D libsvtav1', ' TS loudnorm', 'cuda\nd3d12va');
    expect(result.encoders).toContain('libsvtav1');
    expect(result.filters).toContain('loudnorm');
    expect(result.hwaccels).toEqual(['cuda', 'd3d12va']);
    expect(result.smokeTestedFormats).toEqual([]);
    expect(result.llmMode).toBe('rule-based');
  });

  it('parses VRAM and enables GPU mode only at 8GB', () => {
    expect(parseVramBytes('AdapterRAM=8589934592')).toBe(8589934592);
    expect(llmModeForVram(8 * 1024 ** 3)).toBe('gpu');
    expect(llmModeForVram(4 * 1024 ** 3)).toBe('rule-based');
    expect(parseVramBytes('')).toBeNull();
  });
});
