import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  SelectionMode,
  useReactFlow,
  useStore,
  type Node,
  type OnSelectionChangeParams,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { nodeTypes } from './nodes/ActionNodes.js';
import { edgeTypes } from './edges/OptimizedEdge.js';
import { LodContext } from './nodes/LodContext.js';
import { ActionPalette } from './ActionPalette.js';
import { SearchOverlay } from './SearchOverlay.js';
import { useFlowStore } from '../../stores/flowStore.js';
import { useNodeSearch } from '../../hooks/useNodeSearch.js';
import { COMPACT_ZOOM_THRESHOLD, MINIMAL_ZOOM_THRESHOLD, type LodMode } from '../../hooks/useZoomLevel.js';

/**
 * Performance-related flags for the React Flow canvas.
 * These are tuned for flows with 100-200+ nodes.
 */
const PERF_FIT_VIEW_OPTIONS = { padding: 0.3 } as const;

/**
 * Inner component that auto-fits the viewport whenever nodes are loaded or
 * change significantly (e.g. a different test file is selected).
 * Tracks the set of node IDs so that merely dragging a node doesn't re-trigger.
 */
function AutoFitView({ nodes }: { nodes: Node[] }) {
  const reactFlowInstance = useReactFlow();
  const prevNodeKeyRef = useRef<string>('');

  useEffect(() => {
    if (nodes.length === 0) return;

    // Build a stable key from sorted node IDs so we only re-fit when the
    // set of nodes actually changes, not on every position tweak.
    const nodeKey = nodes.map((n) => n.id).sort().join(',');
    if (nodeKey === prevNodeKeyRef.current) return;
    prevNodeKeyRef.current = nodeKey;

    // Small delay lets React Flow finish measuring node dimensions.
    const timer = setTimeout(() => {
      reactFlowInstance.fitView({ padding: 0.2, duration: 200 });
    }, 50);
    return () => clearTimeout(timer);
  }, [nodes, reactFlowInstance]);

  return null;
}

/**
 * Inner component that auto-pans to the current search match.
 * Must be rendered inside <ReactFlow> to access the useReactFlow() hook.
 */
function SearchPanner({
  currentMatchNodeId,
  nodes,
}: {
  currentMatchNodeId: string | null;
  nodes: Node[];
}) {
  const reactFlowInstance = useReactFlow();
  const selectNode = useFlowStore((s) => s.selectNode);

  useEffect(() => {
    if (!currentMatchNodeId) return;
    const matchNode = nodes.find((n) => n.id === currentMatchNodeId);
    if (!matchNode) return;

    selectNode(matchNode.id);

    const nodeWidth = 260;
    const nodeHeight = 80;
    reactFlowInstance.setCenter(
      matchNode.position.x + nodeWidth / 2,
      matchNode.position.y + nodeHeight / 2,
      { zoom: 1, duration: 300 },
    );
  }, [currentMatchNodeId, nodes, selectNode, reactFlowInstance]);

  return null;
}

/**
 * Inner component that reads the current zoom level from the React Flow store
 * and provides the LOD mode via context to all node components.
 * Must be rendered inside <ReactFlowProvider>.
 */
function LodProvider({ children }: { children: React.ReactNode }) {
  const zoom = useStore(
    useCallback(
      (state: { transform: [number, number, number] }) => state.transform[2],
      [],
    ),
  );

  const lodMode: LodMode = useMemo(() => {
    if (zoom < MINIMAL_ZOOM_THRESHOLD) return 'minimal';
    if (zoom < COMPACT_ZOOM_THRESHOLD) return 'compact';
    return 'full';
  }, [zoom]);

  return (
    <LodContext.Provider value={lodMode}>
      {children}
    </LodContext.Provider>
  );
}

export function FlowEditor() {
  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges);
  const onNodesChange = useFlowStore((s) => s.onNodesChange);
  const onEdgesChange = useFlowStore((s) => s.onEdgesChange);
  const onConnect = useFlowStore((s) => s.onConnect);
  const selectNode = useFlowStore((s) => s.selectNode);
  const toggleNodeSelection = useFlowStore((s) => s.toggleNodeSelection);
  const selectAllNodes = useFlowStore((s) => s.selectAllNodes);
  const clearSelection = useFlowStore((s) => s.clearSelection);
  const setSelectedNodeIds = useFlowStore((s) => s.setSelectedNodeIds);
  const deleteSelectedNodes = useFlowStore((s) => s.deleteSelectedNodes);
  const selectedNodeIds = useFlowStore((s) => s.selectedNodeIds);

  const [searchOpen, setSearchOpen] = useState(false);
  const search = useNodeSearch(nodes);

  const copySelectedNodes = useFlowStore((s) => s.copySelectedNodes);
  const pasteNodes = useFlowStore((s) => s.pasteNodes);
  const duplicateSelectedNodes = useFlowStore((s) => s.duplicateSelectedNodes);

  // Keyboard shortcuts: Ctrl/Cmd + F (search), C (copy), V (paste), D (duplicate), A (select all)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;

      if (mod && e.key === 'f') {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (mod && e.key === 'c') {
        if (isInput) return;
        e.preventDefault();
        copySelectedNodes();
      }
      if (mod && e.key === 'v') {
        if (isInput) return;
        e.preventDefault();
        pasteNodes();
      }
      if (mod && e.key === 'd') {
        if (isInput) return;
        e.preventDefault();
        duplicateSelectedNodes();
      }
      // Ctrl/Cmd + A: Select all nodes
      if (mod && e.key === 'a') {
        if (isInput) return;
        e.preventDefault();
        selectAllNodes();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [copySelectedNodes, pasteNodes, duplicateSelectedNodes, selectAllNodes]);

  const handleCloseSearch = useCallback(() => {
    setSearchOpen(false);
    search.reset();
  }, [search]);

  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      if (event.shiftKey) {
        // Shift+click: toggle node in/out of multi-selection
        toggleNodeSelection(node.id);
      } else {
        // Regular click: single select
        selectNode(node.id);
      }
    },
    [selectNode, toggleNodeSelection],
  );

  // Handle ReactFlow's built-in selection changes (rubber-band / marquee selection)
  const onSelectionChange = useCallback(
    ({ nodes: selectedNodes }: OnSelectionChangeParams) => {
      if (selectedNodes.length > 0) {
        const ids = new Set(selectedNodes.map((n) => n.id));
        setSelectedNodeIds(ids);
      }
      // Note: we don't clear on empty selection here because pane click handles that
    },
    [setSelectedNodeIds],
  );

  const onPaneClick = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  const defaultEdgeOptions = useMemo(
    () => ({
      style: { stroke: '#52525b', strokeWidth: 2 },
    }),
    [],
  );

  // Apply search highlighting and multi-selection state to nodes
  const styledNodes = useMemo(() => {
    return nodes.map((node) => {
      const isSelected = selectedNodeIds.has(node.id);

      // Search highlighting
      let className = '';
      if (search.isSearching) {
        const isMatch = search.matchingNodeIds.has(node.id);
        const isFocused = node.id === search.currentMatchNodeId;
        if (isFocused) {
          className = 'search-match-focused';
        } else if (isMatch) {
          className = 'search-match';
        } else {
          className = 'search-dimmed';
        }
      }

      return { ...node, className, selected: isSelected };
    });
  }, [nodes, selectedNodeIds, search.isSearching, search.matchingNodeIds, search.currentMatchNodeId]);

  return (
    <div className="w-full h-full relative">
      {/* Inject search highlight and multi-select styles */}
      <style>{`
        .react-flow__node.search-dimmed {
          opacity: 0.25;
          transition: opacity 0.2s ease;
        }
        .react-flow__node.search-match {
          opacity: 1;
          transition: opacity 0.2s ease;
        }
        .react-flow__node.search-match-focused {
          opacity: 1;
          filter: drop-shadow(0 0 8px rgba(59, 130, 246, 0.6));
          transition: opacity 0.2s ease, filter 0.2s ease;
        }
        .react-flow__node.search-match-focused > div {
          border-color: #3b82f6 !important;
          box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3);
        }
        .react-flow__node.selected > div {
          border-color: #3b82f6 !important;
          box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.4);
        }
        .react-flow__nodesselection-rect {
          border: 1px dashed #3b82f6 !important;
          background: rgba(59, 130, 246, 0.08) !important;
        }
      `}</style>

      <ActionPalette />
      {searchOpen && <SearchOverlay search={search} onClose={handleCloseSearch} />}
      <ReactFlowProvider>
        <LodProvider>
          <ReactFlow
            nodes={styledNodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onSelectionChange={onSelectionChange}
            defaultEdgeOptions={defaultEdgeOptions}
            selectionOnDrag={false}
            selectionMode={SelectionMode.Partial}
            multiSelectionKeyCode="Shift"
            panOnDrag
            fitView
            fitViewOptions={PERF_FIT_VIEW_OPTIONS}
            minZoom={0.1}
            maxZoom={1.5}
            deleteKeyCode={null}
            proOptions={{ hideAttribution: true }}
            onlyRenderVisibleElements
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#27272a" />
            <Controls
              className="!bg-zinc-800 !border-zinc-700 !shadow-lg [&>button]:!bg-zinc-800 [&>button]:!border-zinc-700 [&>button]:!text-zinc-400 [&>button:hover]:!bg-zinc-700"
            />
            <MiniMap
              nodeColor="#3f3f46"
              maskColor="rgba(0, 0, 0, 0.6)"
              className="!bg-zinc-900 !border-zinc-700"
              pannable
              zoomable
            />
            <AutoFitView nodes={styledNodes} />
            <SearchPanner
              currentMatchNodeId={search.currentMatchNodeId}
              nodes={nodes}
            />
          </ReactFlow>
        </LodProvider>
      </ReactFlowProvider>
    </div>
  );
}
