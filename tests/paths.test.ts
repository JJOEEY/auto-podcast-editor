import { describe, expect, it } from 'vitest';
import { assertMeaningfulPath } from '../electron/paths.js';

describe('assertMeaningfulPath', () => {
  it('throws on empty or blank paths', () => {
    expect(() => assertMeaningfulPath('', 'filePath')).toThrow('non-empty path');
    expect(() => assertMeaningfulPath('   ', 'workDir')).toThrow('non-empty path');
  });

  it('passes real paths through', () => {
    expect(() => assertMeaningfulPath('C:/vids/ep1.mp4', 'filePath')).not.toThrow();
  });
});
