import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, resolve } from 'node:path';

const CONTENT_TYPES: Record<string, string> = {
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
};

function writeError(response: ServerResponse, status: number): void {
  response.statusCode = status;
  response.end();
}

function serveFile(request: IncomingMessage, response: ServerResponse, filePath: string): void {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Headers', 'Range');
  response.setHeader('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Length, Content-Range, Content-Type');
  if (!existsSync(filePath)) {
    writeError(response, 404);
    return;
  }
  const size = statSync(filePath).size;
  const range = request.headers.range;
  const type = CONTENT_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
  response.setHeader('Accept-Ranges', 'bytes');
  response.setHeader('Content-Type', type);
  if (!range) {
    response.statusCode = 200;
    response.setHeader('Content-Length', size);
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    createReadStream(filePath).pipe(response);
    return;
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match) {
    response.setHeader('Content-Range', `bytes */${size}`);
    writeError(response, 416);
    return;
  }
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2] || 1));
  const end = match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= size) {
    response.setHeader('Content-Range', `bytes */${size}`);
    writeError(response, 416);
    return;
  }
  response.statusCode = 206;
  response.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
  response.setHeader('Content-Length', end - start + 1);
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  createReadStream(filePath, { start, end }).pipe(response);
}

export interface LocalAssetServer {
  urlFor(filePath: string): string;
  close(): Promise<void>;
}

/** Serves only explicitly registered local media to Remotion on loopback. */
export async function startLocalAssetServer(filePaths: string[]): Promise<LocalAssetServer> {
  const paths = new Map<string, string>();
  const ids = new Map<string, string>();
  for (const filePath of filePaths) {
    if (!filePath || /^https?:\/\//i.test(filePath)) continue;
    const normalized = resolve(filePath);
    const id = `asset-${ids.size + 1}`;
    ids.set(normalized, id);
    paths.set(id, normalized);
  }
  if (paths.size === 0) {
    return { urlFor: (filePath) => filePath, close: async () => undefined };
  }

  let server: Server;
  await new Promise<void>((resolvePromise, reject) => {
    server = createServer((request, response) => {
      if (request.method === 'OPTIONS') {
        response.setHeader('Access-Control-Allow-Origin', '*');
        response.setHeader('Access-Control-Allow-Headers', 'Range');
        response.statusCode = 204;
        response.end();
        return;
      }
      const id = request.url?.split('?')[0]?.split('/').filter(Boolean)[1];
      const filePath = id ? paths.get(id) : undefined;
      if (!filePath || (request.method !== 'GET' && request.method !== 'HEAD')) {
        writeError(response, filePath ? 405 : 404);
        return;
      }
      serveFile(request, response, filePath);
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolvePromise());
  });
  const address = server!.address();
  if (!address || typeof address === 'string') throw new Error('local asset server did not expose a TCP port');
  const port = address.port;
  return {
    urlFor(filePath: string): string {
      if (/^https?:\/\//i.test(filePath)) return filePath;
      const id = ids.get(resolve(filePath));
      if (!id) throw new Error(`asset was not registered: ${filePath}`);
      return `http://127.0.0.1:${port}/asset/${id}`;
    },
    close(): Promise<void> {
      return new Promise((resolvePromise, reject) => server!.close((error) => error ? reject(error) : resolvePromise()));
    },
  };
}
