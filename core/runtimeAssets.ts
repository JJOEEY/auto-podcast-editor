import { join, normalize, relative } from 'node:path';

export type RuntimeAssetKind = 'file' | 'zip' | 'split-file';

export interface RuntimeAssetPart {
  remotePath: string;
  bytes: number;
  sha256: string;
}

export interface RuntimeAssetSpec {
  id: string;
  label: string;
  kind: RuntimeAssetKind;
  remotePath: string;
  parts?: RuntimeAssetPart[];
  installPath: string;
  entryPath?: string;
  sha256: string;
  bytes: number;
  required: boolean;
}

export interface RuntimeAssetManifest {
  schema: 1;
  version: string;
  baseUrl: string;
  assets: RuntimeAssetSpec[];
}

export interface RuntimeAssetState extends RuntimeAssetSpec {
  path: string;
  ready: boolean;
  error?: string;
}

export function validateRuntimeManifest(value: unknown): RuntimeAssetManifest {
  if (!value || typeof value !== 'object') throw new Error('Runtime manifest không hợp lệ');
  const candidate = value as Partial<RuntimeAssetManifest>;
  if (candidate.schema !== 1 || typeof candidate.version !== 'string' || typeof candidate.baseUrl !== 'string' || !Array.isArray(candidate.assets)) {
    throw new Error('Runtime manifest thiếu schema/version/baseUrl/assets');
  }
  const assets = candidate.assets.map((asset) => {
    if (!asset || typeof asset !== 'object') throw new Error('Runtime asset không hợp lệ');
    const item = asset as Partial<RuntimeAssetSpec>;
    if (!item.id || !item.label || (item.kind !== 'file' && item.kind !== 'zip' && item.kind !== 'split-file') || !item.remotePath || !item.installPath || !item.sha256 || !Number.isInteger(item.bytes) || typeof item.bytes !== 'number' || item.bytes < 1 || typeof item.required !== 'boolean') {
      throw new Error(`Runtime asset thiếu trường bắt buộc: ${String(item.id ?? 'unknown')}`);
    }
    if (!/^[a-f0-9]{64}$/i.test(item.sha256)) throw new Error(`SHA-256 không hợp lệ: ${item.id}`);
    if (item.remotePath.includes('..') || item.installPath.includes('..')) throw new Error(`Runtime asset path không an toàn: ${item.id}`);
    if (item.kind === 'split-file') {
      if (!Array.isArray(item.parts) || item.parts.length < 2) throw new Error(`Runtime asset split-file thiếu parts: ${item.id}`);
      const partBytes = item.parts.reduce((sum, part) => sum + part.bytes, 0);
      if (partBytes !== item.bytes) throw new Error(`Tổng kích thước parts không khớp: ${item.id}`);
      for (const part of item.parts) {
        if (!part || typeof part.remotePath !== 'string' || !part.remotePath || !Number.isInteger(part.bytes) || part.bytes < 1 || !/^[a-f0-9]{64}$/i.test(part.sha256)) {
          throw new Error(`Runtime asset part không hợp lệ: ${item.id}`);
        }
        if (part.remotePath.includes('..')) throw new Error(`Runtime asset part path không an toàn: ${item.id}`);
      }
    }
    return item as RuntimeAssetSpec;
  });
  const ids = new Set<string>();
  for (const asset of assets) {
    if (ids.has(asset.id)) throw new Error(`Runtime asset trùng id: ${asset.id}`);
    ids.add(asset.id);
  }
  return { schema: 1, version: candidate.version, baseUrl: candidate.baseUrl, assets };
}

export function runtimeAssetPath(root: string, asset: RuntimeAssetSpec): string {
  const path = normalize(join(root, asset.installPath));
  const rootRelative = relative(root, path);
  if (rootRelative.startsWith('..') || rootRelative.includes(':')) throw new Error(`Runtime asset path vượt root: ${asset.id}`);
  return path;
}

export function runtimeAssetUrl(baseUrl: string, asset: RuntimeAssetSpec): string {
  const base = baseUrl.trim();
  if (!base) throw new Error('Chưa cấu hình máy chủ tải runtime');
  return new URL(asset.remotePath.replace(/^[/\\]+/, ''), `${base.replace(/[/\\]+$/, '')}/`).toString();
}

export function requiredRuntimeReady(states: RuntimeAssetState[]): boolean {
  return states.filter((asset) => asset.required).every((asset) => asset.ready);
}
