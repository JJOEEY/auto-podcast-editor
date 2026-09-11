import { describe, expect, it } from 'vitest';
import { assertPreviewExportEquivalent, compileRenderGraph } from '../core/renderGraph.js';
import type { RenderGraph } from '../core/types.js';

const graph: RenderGraph = {
  version: 1,
  nodes: [
    { id: 'source', kind: 'source', name: 'media', params: {} },
    { id: 'caption', kind: 'caption', name: 'karaoke', params: { safezone: 'vertical' } },
    { id: 'sink', kind: 'sink', name: 'video', params: {} },
  ],
  edges: [{ from: 'source', to: 'caption' }, { from: 'caption', to: 'sink' }],
};

describe('RenderGraph', () => {
  it('compiles the same graph into distinct preview and export operations', () => {
    const preview = compileRenderGraph(graph, 'preview');
    const exported = compileRenderGraph(graph, 'export');
    expect(preview.nodes[1].operation).toBe('gpu:karaoke');
    expect(exported.nodes[1].operation).toBe('ffmpeg:karaoke');
    expect(preview.semanticSignature).toBe(exported.semanticSignature);
    assertPreviewExportEquivalent(graph);
  });

  it('rejects graph cycles', () => {
    expect(() => compileRenderGraph({ ...graph, edges: [{ from: 'source', to: 'caption' }, { from: 'caption', to: 'source' }] }, 'preview')).toThrow('cycle');
  });
});
