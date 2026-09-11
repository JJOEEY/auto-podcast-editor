import type { RenderBackend, RenderGraph, RenderGraphNode } from './types.js';

export interface CompiledRenderNode {
  id: string;
  operation: string;
  params: Record<string, number | string | boolean>;
}

export interface CompiledRenderGraph {
  backend: RenderBackend;
  nodes: CompiledRenderNode[];
  edges: Array<{ from: string; to: string }>;
  semanticSignature: string;
}

function validateGraph(graph: RenderGraph): Map<string, RenderGraphNode> {
  if (graph.version !== 1) throw new Error(`unsupported render graph version: ${graph.version}`);
  const nodes = new Map<string, RenderGraphNode>();
  for (const node of graph.nodes) {
    if (!node.id.trim() || nodes.has(node.id)) throw new Error(`duplicate render graph node: ${node.id}`);
    nodes.set(node.id, node);
  }
  for (const edge of graph.edges) {
    if (!nodes.has(edge.from) || !nodes.has(edge.to)) throw new Error(`render graph edge references an unknown node: ${edge.from} -> ${edge.to}`);
  }
  return nodes;
}

function topologicalOrder(graph: RenderGraph, nodes: Map<string, RenderGraphNode>): RenderGraphNode[] {
  const incoming = new Map([...nodes.keys()].map((id) => [id, 0]));
  const outgoing = new Map<string, string[]>();
  for (const edge of graph.edges) {
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to]);
  }
  const ready = [...nodes.values()].filter((node) => incoming.get(node.id) === 0).sort((a, b) => a.id.localeCompare(b.id));
  const ordered: RenderGraphNode[] = [];
  while (ready.length > 0) {
    const node = ready.shift() as RenderGraphNode;
    ordered.push(node);
    for (const nextId of outgoing.get(node.id) ?? []) {
      const nextIncoming = (incoming.get(nextId) ?? 0) - 1;
      incoming.set(nextId, nextIncoming);
      if (nextIncoming === 0) ready.push(nodes.get(nextId) as RenderGraphNode);
    }
    ready.sort((a, b) => a.id.localeCompare(b.id));
  }
  if (ordered.length !== nodes.size) throw new Error('render graph contains a cycle');
  return ordered;
}

function semanticSignature(graph: RenderGraph): string {
  return JSON.stringify({
    version: graph.version,
    nodes: [...graph.nodes].sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...graph.edges].sort((a, b) => `${a.from}:${a.to}`.localeCompare(`${b.from}:${b.to}`)),
  });
}

export function compileRenderGraph(graph: RenderGraph, backend: RenderBackend): CompiledRenderGraph {
  const nodes = validateGraph(graph);
  const ordered = topologicalOrder(graph, nodes);
  return {
    backend,
    nodes: ordered.map((node) => ({
      id: node.id,
      operation: node.kind === 'source' || node.kind === 'sink' ? node.kind : `${backend === 'preview' ? 'gpu' : 'ffmpeg'}:${node.name}`,
      params: { ...node.params },
    })),
    edges: graph.edges.map((edge) => ({ ...edge })),
    semanticSignature: semanticSignature(graph),
  };
}

export function assertPreviewExportEquivalent(graph: RenderGraph): void {
  const preview = compileRenderGraph(graph, 'preview');
  const exportGraph = compileRenderGraph(graph, 'export');
  if (preview.semanticSignature !== exportGraph.semanticSignature) throw new Error('preview/export render graph semantics differ');
}
