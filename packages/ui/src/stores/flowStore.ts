import { create } from 'zustand';
import {
  applyNodeChanges,
  applyEdgeChanges,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type Node,
  type Edge,
} from '@xyflow/react';
import type { ActionData, ActionNode, TestCase, TestFlow } from '../api/hooks.js';

let nodeIdCounter = 0;

function nextId(): string {
  return `node_${Date.now()}_${++nodeIdCounter}`;
}

interface HistoryEntry {
  nodes: Node[];
  edges: Edge[];
}

const MAX_HISTORY = 50;

type ActiveView = 'test' | 'beforeAll' | 'beforeEach' | 'afterEach' | 'afterAll';

interface DragReorderState {
  draggedNodeId: string;
  targetIndex: number;
}

interface ClipboardData {
  nodes: Node[];
  edges: Edge[];
}

interface FlowState {
  // Current flow data
  testFlow: TestFlow | null;
  activeTestIndex: number;
  activeView: ActiveView;
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  selectedNodeIds: Set<string>;
  isDirty: boolean;

  // Clipboard
  clipboard: ClipboardData | null;

  // Drag-to-reorder state
  dragReorderState: DragReorderState | null;

  // Undo/redo
  history: HistoryEntry[];
  historyIndex: number;
  canUndo: boolean;
  canRedo: boolean;

  // Actions
  loadTestFlow: (flow: TestFlow, testIndex?: number) => void;
  setActiveTestIndex: (index: number) => void;
  setActiveView: (view: ActiveView) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  selectNode: (id: string | null) => void;
  addNode: (type: string, data: ActionData) => void;
  deleteNode: (id: string) => void;
  updateNodeData: (id: string, data: ActionData) => void;
  updateFixtures: (fixtures: string[]) => void;
  addTestCase: (name: string) => void;
  deleteTestCase: (index: number) => void;
  getTestFlowForSave: () => TestFlow | null;
  markClean: () => void;
  undo: () => void;
  redo: () => void;
  reorderNodes: (fromIndex: number, toIndex: number) => void;
  setDragReorderState: (state: DragReorderState | null) => void;
  copySelectedNodes: () => void;
  pasteNodes: () => void;
  duplicateSelectedNodes: () => void;

  // Multi-select actions
  toggleNodeSelection: (id: string) => void;
  selectAllNodes: () => void;
  clearSelection: () => void;
  setSelectedNodeIds: (ids: Set<string>) => void;
  deleteSelectedNodes: () => void;
}

function testCaseToNodesEdges(tc: TestCase): { nodes: Node[]; edges: Edge[] } {
  return {
    nodes: tc.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: { ...n.data, ...(n.frameLocators ? { frameLocators: n.frameLocators } : {}) } as unknown as Record<string, unknown>,
    })),
    edges: tc.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      style: { stroke: '#52525b', strokeWidth: 2 },
    })),
  };
}

function pushHistory(state: FlowState): Partial<FlowState> {
  const entry: HistoryEntry = {
    nodes: JSON.parse(JSON.stringify(state.nodes)),
    edges: JSON.parse(JSON.stringify(state.edges)),
  };
  // Truncate any redo history
  const history = state.history.slice(0, state.historyIndex + 1);
  history.push(entry);
  // Limit history size
  if (history.length > MAX_HISTORY) history.shift();
  const historyIndex = history.length - 1;
  return {
    history,
    historyIndex,
    canUndo: historyIndex > 0,
    canRedo: false,
  };
}

function hookNodesToNodesEdges(hookNodes: ActionNode[]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = hookNodes.map((n, i) => ({
    id: n.id,
    type: n.type,
    position: n.position ?? { x: 250, y: i * 150 },
    data: n.data as unknown as Record<string, unknown>,
  }));
  const edges: Edge[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    edges.push({
      id: `edge_${nodes[i].id}_${nodes[i + 1].id}`,
      source: nodes[i].id,
      target: nodes[i + 1].id,
      style: { stroke: '#52525b', strokeWidth: 2 },
    });
  }
  return { nodes, edges };
}

export const useFlowStore = create<FlowState>((set, get) => ({
  testFlow: null,
  activeTestIndex: 0,
  activeView: 'test' as ActiveView,
  nodes: [],
  edges: [],
  selectedNodeId: null,
  selectedNodeIds: new Set<string>(),
  isDirty: false,
  clipboard: null,
  history: [],
  historyIndex: -1,
  canUndo: false,
  canRedo: false,

  loadTestFlow: (flow, testIndex = 0) => {
    const tc = flow.tests[testIndex];
    if (!tc) {
      set({ testFlow: flow, activeTestIndex: testIndex, activeView: 'test', nodes: [], edges: [], selectedNodeId: null, selectedNodeIds: new Set(), isDirty: false, history: [], historyIndex: -1, canUndo: false, canRedo: false });
      return;
    }
    const { nodes, edges } = testCaseToNodesEdges(tc);
    const entry: HistoryEntry = { nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) };
    set({ testFlow: flow, activeTestIndex: testIndex, activeView: 'test', nodes, edges, selectedNodeId: null, selectedNodeIds: new Set(), isDirty: false, history: [entry], historyIndex: 0, canUndo: false, canRedo: false });
  },

  setActiveTestIndex: (index) => {
    const { testFlow } = get();
    if (!testFlow) return;
    const tc = testFlow.tests[index];
    if (!tc) return;
    const { nodes, edges } = testCaseToNodesEdges(tc);
    const entry: HistoryEntry = { nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) };
    set({ activeTestIndex: index, activeView: 'test', nodes, edges, selectedNodeId: null, selectedNodeIds: new Set(), history: [entry], historyIndex: 0, canUndo: false, canRedo: false });
  },

  setActiveView: (view) => {
    const state = get();
    const { testFlow, activeView, activeTestIndex } = state;
    if (!testFlow || view === activeView) return;

    // Save current canvas back to testFlow before switching
    const currentNodes = state.nodes;
    const currentEdges = state.edges;
    let updatedFlow = { ...testFlow };

    if (activeView === 'test') {
      // Save current test case nodes/edges back
      const actionNodes: ActionNode[] = currentNodes.map((n) => ({
        id: n.id,
        type: n.type!,
        position: { x: n.position.x, y: n.position.y },
        data: n.data as unknown as ActionData,
      }));
      const flowEdges = currentEdges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        ...(e.label ? { label: String(e.label) } : {}),
      }));
      updatedFlow = {
        ...updatedFlow,
        tests: updatedFlow.tests.map((tc, i) =>
          i === activeTestIndex ? { ...tc, nodes: actionNodes, edges: flowEdges } : tc
        ),
      };
    } else if (activeView === 'beforeAll' || activeView === 'beforeEach' || activeView === 'afterEach' || activeView === 'afterAll') {
      const hookNodes: ActionNode[] = currentNodes.map((n) => ({
        id: n.id,
        type: n.type!,
        position: { x: n.position.x, y: n.position.y },
        data: n.data as unknown as ActionData,
      }));
      updatedFlow = { ...updatedFlow, [activeView]: hookNodes };
    }

    // Load new view
    let newNodes: Node[] = [];
    let newEdges: Edge[] = [];

    if (view === 'test') {
      const tc = updatedFlow.tests[activeTestIndex];
      if (tc) {
        const result = testCaseToNodesEdges(tc);
        newNodes = result.nodes;
        newEdges = result.edges;
      }
    } else {
      const hookNodes = updatedFlow[view] ?? [];
      const result = hookNodesToNodesEdges(hookNodes);
      newNodes = result.nodes;
      newEdges = result.edges;
    }

    const entry: HistoryEntry = { nodes: JSON.parse(JSON.stringify(newNodes)), edges: JSON.parse(JSON.stringify(newEdges)) };
    set({
      testFlow: updatedFlow,
      activeView: view,
      nodes: newNodes,
      edges: newEdges,
      selectedNodeId: null,
      selectedNodeIds: new Set(),
      history: [entry],
      historyIndex: 0,
      canUndo: false,
      canRedo: false,
    });
  },

  onNodesChange: (changes) => {
    const isUserChange = changes.some(
      (c) => c.type === 'position' || c.type === 'remove',
    );
    set((state) => {
      const newNodes = applyNodeChanges(changes, state.nodes);
      const result: Partial<FlowState> = {
        nodes: newNodes,
        isDirty: state.isDirty || isUserChange,
      };
      // Only push history for user-initiated position changes that are complete (not dragging)
      if (changes.some((c) => c.type === 'remove')) {
        Object.assign(result, pushHistory({ ...state, nodes: newNodes }));
      }
      return result as FlowState;
    });
  },

  onEdgesChange: (changes) => {
    const isUserChange = changes.some((c) => c.type === 'remove');
    set((state) => {
      const newEdges = applyEdgeChanges(changes, state.edges);
      const result: Partial<FlowState> = {
        edges: newEdges,
        isDirty: state.isDirty || isUserChange,
      };
      if (isUserChange) {
        Object.assign(result, pushHistory({ ...state, edges: newEdges }));
      }
      return result as FlowState;
    });
  },

  onConnect: (connection) => {
    const edgeId = `edge_${connection.source}_${connection.target}`;
    set((state) => {
      const newEdges = [
        ...state.edges,
        {
          id: edgeId,
          source: connection.source!,
          target: connection.target!,
          style: { stroke: '#52525b', strokeWidth: 2 },
        },
      ];
      return {
        edges: newEdges,
        isDirty: true,
        ...pushHistory({ ...state, edges: newEdges }),
      } as FlowState;
    });
  },

  selectNode: (id) => set({
    selectedNodeId: id,
    selectedNodeIds: id ? new Set([id]) : new Set(),
  }),

  addNode: (type, data) => {
    const id = nextId();
    const { nodes } = get();
    const maxY = nodes.reduce((max, n) => Math.max(max, n.position.y), 0);
    const newNode: Node = {
      id,
      type,
      position: { x: 250, y: maxY + 150 },
      data: data as unknown as Record<string, unknown>,
    };

    const lastNode = nodes.length > 0 ? nodes[nodes.length - 1] : null;

    set((state) => {
      const newNodes = [...state.nodes, newNode];
      const newEdges = lastNode
        ? [
            ...state.edges,
            {
              id: `edge_${lastNode.id}_${id}`,
              source: lastNode.id,
              target: id,
              style: { stroke: '#52525b', strokeWidth: 2 },
            },
          ]
        : state.edges;
      return {
        nodes: newNodes,
        edges: newEdges,
        selectedNodeId: id,
        selectedNodeIds: new Set([id]),
        isDirty: true,
        ...pushHistory({ ...state, nodes: newNodes, edges: newEdges }),
      } as FlowState;
    });
  },

  deleteNode: (id) => {
    set((state) => {
      const newNodes = state.nodes.filter((n) => n.id !== id);
      const inEdge = state.edges.find((e) => e.target === id);
      const outEdge = state.edges.find((e) => e.source === id);
      let newEdges = state.edges.filter((e) => e.source !== id && e.target !== id);

      if (inEdge && outEdge) {
        newEdges.push({
          id: `edge_${inEdge.source}_${outEdge.target}`,
          source: inEdge.source,
          target: outEdge.target,
          style: { stroke: '#52525b', strokeWidth: 2 },
        });
      }

      const newSelectedIds = new Set(state.selectedNodeIds);
      newSelectedIds.delete(id);
      return {
        nodes: newNodes,
        edges: newEdges,
        selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
        selectedNodeIds: newSelectedIds,
        isDirty: true,
        ...pushHistory({ ...state, nodes: newNodes, edges: newEdges }),
      } as FlowState;
    });
  },

  updateNodeData: (id, data) => {
    set((state) => {
      const newNodes = state.nodes.map((n) =>
        n.id === id ? { ...n, type: data.type, data: data as unknown as Record<string, unknown> } : n,
      );
      return {
        nodes: newNodes,
        isDirty: true,
        ...pushHistory({ ...state, nodes: newNodes }),
      } as FlowState;
    });
  },

  updateFixtures: (fixtures) => {
    const { testFlow } = get();
    if (!testFlow) return;
    set({
      testFlow: { ...testFlow, fixtures },
      isDirty: true,
    });
  },

  addTestCase: (name) => {
    const { testFlow } = get();
    if (!testFlow) return;

    const newTest = {
      id: `test_${Date.now()}`,
      name,
      nodes: [],
      edges: [],
    };
    const updatedTests = [...testFlow.tests, newTest];
    const newIndex = updatedTests.length - 1;

    set({
      testFlow: { ...testFlow, tests: updatedTests },
      activeTestIndex: newIndex,
      activeView: 'test' as ActiveView,
      nodes: [],
      edges: [],
      selectedNodeId: null,
      selectedNodeIds: new Set(),
      isDirty: true,
      history: [{ nodes: [], edges: [] }],
      historyIndex: 0,
      canUndo: false,
      canRedo: false,
    });
  },

  deleteTestCase: (index) => {
    const { testFlow, activeTestIndex } = get();
    if (!testFlow || index < 0 || index >= testFlow.tests.length) return;

    const updatedTests = testFlow.tests.filter((_, i) => i !== index);
    const updatedFlow = { ...testFlow, tests: updatedTests };

    // Determine new active index
    let newActiveIndex = activeTestIndex;
    if (updatedTests.length === 0) {
      newActiveIndex = 0;
    } else if (index < activeTestIndex) {
      newActiveIndex = activeTestIndex - 1;
    } else if (index === activeTestIndex) {
      newActiveIndex = Math.min(index, updatedTests.length - 1);
    }

    const tc = updatedTests[newActiveIndex];
    if (tc) {
      const { nodes, edges } = testCaseToNodesEdges(tc);
      const entry: HistoryEntry = { nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) };
      set({ testFlow: updatedFlow, activeTestIndex: newActiveIndex, nodes, edges, selectedNodeId: null, selectedNodeIds: new Set(), isDirty: true, history: [entry], historyIndex: 0, canUndo: false, canRedo: false });
    } else {
      set({ testFlow: updatedFlow, activeTestIndex: 0, nodes: [], edges: [], selectedNodeId: null, selectedNodeIds: new Set(), isDirty: true, history: [], historyIndex: -1, canUndo: false, canRedo: false });
    }
  },

  getTestFlowForSave: () => {
    const { testFlow, activeTestIndex, activeView, nodes, edges } = get();
    if (!testFlow) return null;

    const actionNodes: ActionNode[] = nodes.map((n) => ({
      id: n.id,
      type: n.type!,
      position: { x: n.position.x, y: n.position.y },
      data: n.data as unknown as ActionData,
    }));

    const flowEdges = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      ...(e.label ? { label: String(e.label) } : {}),
    }));

    let result = { ...testFlow };

    if (activeView === 'test') {
      result.tests = testFlow.tests.map((tc, i) =>
        i === activeTestIndex
          ? { ...tc, nodes: actionNodes, edges: flowEdges }
          : tc,
      );
    } else if (activeView === 'beforeAll') {
      result.beforeAll = actionNodes;
    } else if (activeView === 'beforeEach') {
      result.beforeEach = actionNodes;
    } else if (activeView === 'afterEach') {
      result.afterEach = actionNodes;
    } else if (activeView === 'afterAll') {
      result.afterAll = actionNodes;
    }

    return result;
  },

  markClean: () => set({ isDirty: false }),

  undo: () => {
    set((state) => {
      if (state.historyIndex <= 0) return state;
      const newIndex = state.historyIndex - 1;
      const entry = state.history[newIndex];
      return {
        nodes: JSON.parse(JSON.stringify(entry.nodes)),
        edges: JSON.parse(JSON.stringify(entry.edges)),
        historyIndex: newIndex,
        canUndo: newIndex > 0,
        canRedo: true,
        isDirty: true,
      };
    });
  },

  redo: () => {
    set((state) => {
      if (state.historyIndex >= state.history.length - 1) return state;
      const newIndex = state.historyIndex + 1;
      const entry = state.history[newIndex];
      return {
        nodes: JSON.parse(JSON.stringify(entry.nodes)),
        edges: JSON.parse(JSON.stringify(entry.edges)),
        historyIndex: newIndex,
        canUndo: true,
        canRedo: newIndex < state.history.length - 1,
        isDirty: true,
      };
    });
  },

  dragReorderState: null,

  setDragReorderState: (state) => set({ dragReorderState: state }),

  reorderNodes: (fromIndex, toIndex) => {
    set((state) => {
      const newNodes = [...state.nodes];
      const [moved] = newNodes.splice(fromIndex, 1);
      newNodes.splice(toIndex, 0, moved);

      // Reassign positions based on new order
      const repositioned = newNodes.map((n, i) => ({
        ...n,
        position: { x: n.position.x, y: i * 150 },
      }));

      // Rebuild edges as a linear chain
      const newEdges: Edge[] = [];
      for (let i = 0; i < repositioned.length - 1; i++) {
        newEdges.push({
          id: `edge_${repositioned[i].id}_${repositioned[i + 1].id}`,
          source: repositioned[i].id,
          target: repositioned[i + 1].id,
          style: { stroke: '#52525b', strokeWidth: 2 },
        });
      }

      return {
        nodes: repositioned,
        edges: newEdges,
        dragReorderState: null,
        isDirty: true,
        ...pushHistory({ ...state, nodes: repositioned, edges: newEdges }),
      } as FlowState;
    });
  },

  copySelectedNodes: () => {
    const { selectedNodeId, selectedNodeIds: multiSelected, nodes, edges } = get();

    // Multi-select takes precedence, then fall back to single selected node
    const idsToSelect = multiSelected.size > 0
      ? multiSelected
      : selectedNodeId
        ? new Set([selectedNodeId])
        : null;
    if (!idsToSelect || idsToSelect.size === 0) return;

    const selectedNodes = nodes.filter((n) => idsToSelect.has(n.id));
    if (selectedNodes.length === 0) return;

    // Copy edges that connect copied nodes to each other
    const copiedEdges = edges.filter(
      (e) => idsToSelect.has(e.source) && idsToSelect.has(e.target),
    );

    set({
      clipboard: {
        nodes: JSON.parse(JSON.stringify(selectedNodes)),
        edges: JSON.parse(JSON.stringify(copiedEdges)),
      },
    });
  },

  pasteNodes: () => {
    const { clipboard, nodes, edges, selectedNodeId } = get();
    if (!clipboard || clipboard.nodes.length === 0) return;

    // Build a mapping from old IDs to new IDs
    const idMap = new Map<string, string>();
    for (const node of clipboard.nodes) {
      idMap.set(node.id, nextId());
    }

    // Clone nodes with new IDs and offset positions
    const pastedNodes: Node[] = clipboard.nodes.map((n) => ({
      ...JSON.parse(JSON.stringify(n)),
      id: idMap.get(n.id)!,
      position: { x: n.position.x + 50, y: n.position.y + 50 },
    }));

    // Clone internal edges with remapped IDs
    const pastedInternalEdges: Edge[] = clipboard.edges.map((e) => ({
      ...JSON.parse(JSON.stringify(e)),
      id: `edge_${idMap.get(e.source)}_${idMap.get(e.target)}`,
      source: idMap.get(e.source)!,
      target: idMap.get(e.target)!,
    }));

    // Determine where to insert: after selectedNodeId, or at the end
    let insertAfterNodeId = selectedNodeId;
    if (!insertAfterNodeId || !nodes.find((n) => n.id === insertAfterNodeId)) {
      insertAfterNodeId = nodes.length > 0 ? nodes[nodes.length - 1].id : null;
    }

    // Build connection edges: connect the insertAfterNode to the first pasted node,
    // and connect the last pasted node to whatever came after insertAfterNode
    const connectionEdges: Edge[] = [];
    const firstPastedId = pastedNodes[0].id;
    const lastPastedId = pastedNodes[pastedNodes.length - 1].id;

    if (insertAfterNodeId) {
      // Find the edge going out of the insertAfterNode
      const outEdge = edges.find((e) => e.source === insertAfterNodeId);

      // Connect insertAfterNode -> first pasted node
      connectionEdges.push({
        id: `edge_${insertAfterNodeId}_${firstPastedId}`,
        source: insertAfterNodeId,
        target: firstPastedId,
        style: { stroke: '#52525b', strokeWidth: 2 },
      });

      // If there was a downstream node, connect last pasted -> downstream
      if (outEdge) {
        connectionEdges.push({
          id: `edge_${lastPastedId}_${outEdge.target}`,
          source: lastPastedId,
          target: outEdge.target,
          style: { stroke: '#52525b', strokeWidth: 2 },
        });
      }

      // Remove the old outgoing edge from insertAfterNode
      const filteredEdges = outEdge
        ? edges.filter((e) => e.id !== outEdge.id)
        : edges;

      set((state) => {
        const newNodes = [...state.nodes, ...pastedNodes];
        const newEdges = [...filteredEdges, ...pastedInternalEdges, ...connectionEdges];
        return {
          nodes: newNodes,
          edges: newEdges,
          selectedNodeId: firstPastedId,
          isDirty: true,
          ...pushHistory({ ...state, nodes: newNodes, edges: newEdges }),
        } as FlowState;
      });
    } else {
      // No existing nodes — just add the pasted nodes
      set((state) => {
        const newNodes = [...state.nodes, ...pastedNodes];
        const newEdges = [...state.edges, ...pastedInternalEdges];
        return {
          nodes: newNodes,
          edges: newEdges,
          selectedNodeId: firstPastedId,
          isDirty: true,
          ...pushHistory({ ...state, nodes: newNodes, edges: newEdges }),
        } as FlowState;
      });
    }
  },

  duplicateSelectedNodes: () => {
    const store = get();
    if (!store.selectedNodeId && store.selectedNodeIds.size === 0) return;
    store.copySelectedNodes();
    // After copy, immediately paste
    get().pasteNodes();
  },

  // Multi-select actions
  toggleNodeSelection: (id) => {
    set((state) => {
      const newIds = new Set(state.selectedNodeIds);
      if (newIds.has(id)) {
        newIds.delete(id);
      } else {
        newIds.add(id);
      }
      // Keep selectedNodeId in sync: use the most recently toggled-on node, or the first in the set
      const newPrimary = newIds.has(id) ? id : (newIds.size > 0 ? newIds.values().next().value ?? null : null);
      return {
        selectedNodeIds: newIds,
        selectedNodeId: newPrimary,
      } as FlowState;
    });
  },

  selectAllNodes: () => {
    set((state) => {
      const allIds = new Set(state.nodes.map((n) => n.id));
      return {
        selectedNodeIds: allIds,
        selectedNodeId: state.nodes.length > 0 ? state.nodes[0].id : null,
      } as FlowState;
    });
  },

  clearSelection: () => set({
    selectedNodeIds: new Set(),
    selectedNodeId: null,
  }),

  setSelectedNodeIds: (ids) => {
    set({
      selectedNodeIds: ids,
      selectedNodeId: ids.size > 0 ? ids.values().next().value ?? null : null,
    });
  },

  deleteSelectedNodes: () => {
    set((state) => {
      const idsToDelete = state.selectedNodeIds;
      if (idsToDelete.size === 0) return state;

      // For edge reconnection in a linear flow: find the predecessor of the
      // first deleted node and the successor of the last deleted node.
      // Walk the edge chain to find boundary connections.
      const newNodes = state.nodes.filter((n) => !idsToDelete.has(n.id));

      // Find all edges that touch deleted nodes
      const keptEdges = state.edges.filter(
        (e) => !idsToDelete.has(e.source) && !idsToDelete.has(e.target),
      );

      // For reconnection: find edges that enter the deleted set from outside
      // and edges that leave the deleted set to outside
      const incomingEdges = state.edges.filter(
        (e) => !idsToDelete.has(e.source) && idsToDelete.has(e.target),
      );
      const outgoingEdges = state.edges.filter(
        (e) => idsToDelete.has(e.source) && !idsToDelete.has(e.target),
      );

      // Reconnect: for each incoming source, find the corresponding outgoing target
      // by tracing through the deleted nodes. In a linear chain, there's typically
      // one incoming and one outgoing.
      const reconnectEdges: Edge[] = [];
      if (incomingEdges.length > 0 && outgoingEdges.length > 0) {
        // For a linear flow, connect each incoming source to the outgoing targets
        for (const inEdge of incomingEdges) {
          for (const outEdge of outgoingEdges) {
            // Verify there's a path through deleted nodes from inEdge.target to outEdge.source
            // For simplicity in linear flows, connect them
            reconnectEdges.push({
              id: `edge_${inEdge.source}_${outEdge.target}`,
              source: inEdge.source,
              target: outEdge.target,
              style: { stroke: '#52525b', strokeWidth: 2 },
            });
          }
        }
      }

      const newEdges = [...keptEdges, ...reconnectEdges];

      return {
        nodes: newNodes,
        edges: newEdges,
        selectedNodeId: null,
        selectedNodeIds: new Set(),
        isDirty: true,
        ...pushHistory({ ...state, nodes: newNodes, edges: newEdges }),
      } as FlowState;
    });
  },
}));
