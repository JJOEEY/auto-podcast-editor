import { describe, expect, it } from 'vitest';
import { requiredRuntimeReady, runtimeAssetPath, runtimeAssetUrl, validateRuntimeManifest } from '../core/runtimeAssets.js';

const sha = 'a'.repeat(64);

describe('runtime asset manifest', () => {
  it('validates manifest and builds safe download URLs', () => {
    const manifest = validateRuntimeManifest({
      schema: 1,
      version: '0.1.1',
      baseUrl: 'https://cdn.example.test/auto-podcast',
      assets: [{ id: 'ffmpeg', label: 'FFmpeg', kind: 'file', remotePath: 'runtime/0.1.1/ffmpeg.exe', installPath: 'bin/ffmpeg.exe', sha256: sha, bytes: 12, required: true }],
    });
    expect(runtimeAssetUrl(manifest.baseUrl, manifest.assets[0])).toBe('https://cdn.example.test/auto-podcast/runtime/0.1.1/ffmpeg.exe');
    expect(runtimeAssetPath('C:/runtime', manifest.assets[0])).toBe('C:\\runtime\\bin\\ffmpeg.exe');
  });

  it('rejects traversal and duplicate ids', () => {
    expect(() => validateRuntimeManifest({ schema: 1, version: '0.1.1', baseUrl: '', assets: [{ id: 'bad', label: 'Bad', kind: 'file', remotePath: '../bad', installPath: 'bin/bad', sha256: sha, bytes: 1, required: true }] })).toThrow();
    expect(() => validateRuntimeManifest({ schema: 1, version: '0.1.1', baseUrl: '', assets: [
      { id: 'same', label: 'A', kind: 'file', remotePath: 'a', installPath: 'a', sha256: sha, bytes: 1, required: true },
      { id: 'same', label: 'B', kind: 'file', remotePath: 'b', installPath: 'b', sha256: sha, bytes: 1, required: false },
    ] })).toThrow(/trùng id/);
  });

  it('only passes when every required asset is ready', () => {
    const base = { id: 'a', label: 'A', kind: 'file' as const, remotePath: 'a', installPath: 'a', sha256: sha, bytes: 1, required: true, path: 'a' };
    expect(requiredRuntimeReady([{ ...base, ready: true }, { ...base, id: 'b', required: false, ready: false }])).toBe(true);
    expect(requiredRuntimeReady([{ ...base, ready: false }])).toBe(false);
  });

  it('validates split files whose parts add up to the full asset', () => {
    const manifest = validateRuntimeManifest({
      schema: 1,
      version: '0.1.1',
      baseUrl: 'https://github.com/JJOEEY/auto-podcast-editor/releases/download/v0.1.1-online',
      assets: [{
        id: 'llm-model', label: 'Qwen', kind: 'split-file', remotePath: 'Qwen.gguf', installPath: 'models/Qwen.gguf',
        sha256: sha, bytes: 3, required: true,
        parts: [
          { remotePath: 'Qwen.gguf.part001', sha256: sha, bytes: 1 },
          { remotePath: 'Qwen.gguf.part002', sha256: sha, bytes: 2 },
        ],
      }],
    });
    expect(manifest.assets[0].parts).toHaveLength(2);
    expect(manifest.assets[0].kind).toBe('split-file');
  });
});
