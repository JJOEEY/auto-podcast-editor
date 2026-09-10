import { describe, expect, it } from 'vitest';
import { buildCapabilitySnapshot, parseCapabilityNames } from '../electron/capabilities.js';

describe('FFmpeg capabilities', () => {
  it('parses encoder names', () => {
    expect(parseCapabilityNames(' V....D libx264\n V....D libx265')).toEqual(['libx264', 'libx265']);
  });

  it('builds a capability snapshot', () => {
    const result = buildCapabilitySnapshot(' V....D libsvtav1', ' TS loudnorm', 'cuda\nd3d12va');
    expect(result.encoders).toContain('libsvtav1');
    expect(result.filters).toContain('loudnorm');
    expect(result.hwaccels).toEqual(['cuda', 'd3d12va']);
  });
});
