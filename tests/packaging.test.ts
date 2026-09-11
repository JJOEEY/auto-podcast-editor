import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

describe('packaged runtime dependencies', () => {
  it('keeps Remotion runtime React dependencies in production dependencies', () => {
    expect(packageJson.dependencies?.react).toBeTruthy();
    expect(packageJson.dependencies?.['react-dom']).toBeTruthy();
    expect(packageJson.devDependencies?.react).toBeUndefined();
    expect(packageJson.devDependencies?.['react-dom']).toBeUndefined();
  });
});
