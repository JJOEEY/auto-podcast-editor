import { describe, expect, it } from 'vitest';
import { statSync } from 'node:fs';
import { startLocalAssetServer } from '../electron/localAssetServer.ts';

describe('local asset server', () => {
  it('serves registered media and supports byte ranges for Remotion', async () => {
    const filePath = 'assets/sfx/bundled/click.wav';
    const server = await startLocalAssetServer([filePath]);
    try {
      const response = await fetch(server.urlFor(filePath), { headers: { Range: 'bytes=0-15' } });
      expect(response.status).toBe(206);
      expect(response.headers.get('accept-ranges')).toBe('bytes');
      expect(response.headers.get('content-range')).toBe(`bytes 0-15/${statSync(filePath).size}`);
      expect((await response.arrayBuffer()).byteLength).toBe(16);
    } finally {
      await server.close();
    }
  });
});
