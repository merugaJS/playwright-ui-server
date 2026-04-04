import { create } from 'zustand';
import type { Node, Edge } from '@xyflow/react';

let clipIdCounter = 0;

function generateId(): string {
  return `node_${Date.now()}_${++clipIdCounter}`;
}

export interface ClipboardData {
  nodes: Node[];
  edges: Edge[];
}

interface ClipboardState {
  clipboard: ClipboardData | null;

  /**
   * Copy the given nodes and their internal edges to the clipboard.
   * "Internal" means edges where both source and target are in the copied set.
   */
  copy: (nodes: Node[], allEdges: Edge[]) => void;

  /**
   * Paste the clipboard contents. Returns new nodes/edges with regenerated IDs
   * and positions offset by (dx, dy). Returns null if clipboard is empty.
   */
  paste: (dx?: number, dy?: number) => ClipboardData | null;

  /** Clear the clipboard. */
  clear: () => void;

  /** Check if there is something on the clipboard. */
  hasContent: () => boolean;
}

export const useClipboardStore = create<ClipboardState>((set, get) => ({
  clipboard: null,

  copy: (nodes, allEdges) => {
    if (nodes.length === 0) return;

    const nodeIds = new Set(nodes.map((n) => n.id));
    // Deep clone nodes
    const clonedNodes: Node[] = JSON.parse(JSON.stringify(nodes));
    // Only keep edges that are internal to the copied set
    const internalEdges = allEdges.filter(
      (e) => nodeIds.has(e.source) && nodeIds.has(e.target),
    );
    const clonedEdges: Edge[] = JSON.parse(JSON.stringify(internalEdges));

    set({ clipboard: { nodes: clonedNodes, edges: clonedEdges } });
  },

  paste: (dx = 50, dy = 50) => {
    const { clipboard } = get();
    if (!clipboard || clipboard.nodes.length === 0) return null;

    // Build old-to-new ID mapping
    const idMap = new Map<string, string>();
    for (const node of clipboard.nodes) {
      idMap.set(node.id, generateId());
    }

    // Clone nodes with new IDs and offset positions
    const newNodes: Node[] = clipboard.nodes.map((n) => ({
      ...JSON.parse(JSON.stringify(n)),
      id: idMap.get(n.id)!,
      position: { x: n.position.x + dx, y: n.position.y + dy },
      selected: false,
      className: 'paste-highlight',
    }));

    // Clone edges with remapped source/target and new IDs
    const newEdges: Edge[] = clipboard.edges.map((e) => ({
      ...JSON.parse(JSON.stringify(e)),
      id: `edge_${idMap.get(e.source)}_${idMap.get(e.target)}`,
      source: idMap.get(e.source) ?? e.source,
      target: idMap.get(e.target) ?? e.target,
    }));

    return { nodes: newNodes, edges: newEdges };
  },

  clear: () => set({ clipboard: null }),

  hasContent: () => {
    const { clipboard } = get();
    return clipboard !== null && clipboard.nodes.length > 0;
  },
}));
