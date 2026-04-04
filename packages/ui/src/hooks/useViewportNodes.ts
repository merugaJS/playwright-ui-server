import { useCallback, useMemo, useRef } from 'react';
import { useStore, useReactFlow, type Node, type Edge } from '@xyflow/react';

/**
 * Buffer zone (in pixels) around the viewport. Nodes within this extended area
 * are considered "near viewport" and will be rendered to avoid pop-in during
 * fast panning.
 */
const VIEWPORT_BUFFER = 200;

/**
 * Zoom threshold below which we switch to simplified (Level-of-Detail) rendering.
 * At very low zoom levels the user cannot read node details anyway, so we can
 * render lightweight placeholders instead of full node components.
 */
export const LOD_ZOOM_THRESHOLD = 0.5;

interface ViewportBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

function getViewportBounds(
  transform: { x: number; y: number; zoom: number },
  domWidth: number,
  domHeight: number,
  buffer: number,
): ViewportBounds {
  const { x, y, zoom } = transform;
  return {
    x: (-x - buffer) / zoom,
    y: (-y - buffer) / zoom,
    width: (domWidth + 2 * buffer) / zoom,
    height: (domHeight + 2 * buffer) / zoom,
  };
}

function isNodeInBounds(node: Node, bounds: ViewportBounds): boolean {
  // Assume a default node size if measured dimensions aren't available
  const nodeWidth = node.measured?.width ?? node.width ?? 300;
  const nodeHeight = node.measured?.height ?? node.height ?? 100;

  return (
    node.position.x + nodeWidth >= bounds.x &&
    node.position.x <= bounds.x + bounds.width &&
    node.position.y + nodeHeight >= bounds.y &&
    node.position.y <= bounds.y + bounds.height
  );
}

/**
 * Hook that filters nodes to only those visible in (or near) the current
 * viewport. Also filters edges to only those where at least one endpoint
 * is visible.
 *
 * This provides custom virtualization on top of React Flow's built-in
 * `onlyRenderVisibleElements` for additional control (e.g. buffer zone,
 * LOD state).
 */
export function useViewportNodes(allNodes: Node[], allEdges: Edge[]) {
  const { getViewport } = useReactFlow();
  const prevVisibleIdsRef = useRef<Set<string>>(new Set());

  // Subscribe to viewport transform from the React Flow store
  const transform = useStore(
    useCallback(
      (state: { transform: [number, number, number] }) => ({
        x: state.transform[0],
        y: state.transform[1],
        zoom: state.transform[2],
      }),
      [],
    ),
  );

  // Get DOM dimensions from the React Flow store
  const domRect = useStore(
    useCallback(
      (state: { width: number; height: number }) => ({
        width: state.width,
        height: state.height,
      }),
      [],
    ),
  );

  const isLowZoom = transform.zoom < LOD_ZOOM_THRESHOLD;

  const visibleNodes = useMemo(() => {
    if (allNodes.length === 0) return allNodes;

    const bounds = getViewportBounds(
      transform,
      domRect.width,
      domRect.height,
      VIEWPORT_BUFFER,
    );

    const filtered = allNodes.filter((node) => isNodeInBounds(node, bounds));

    // Cache the visible IDs for edge filtering
    const ids = new Set(filtered.map((n) => n.id));
    prevVisibleIdsRef.current = ids;

    return filtered;
  }, [allNodes, transform, domRect.width, domRect.height]);

  const visibleEdges = useMemo(() => {
    if (allEdges.length === 0) return allEdges;

    const visibleIds = prevVisibleIdsRef.current;

    // Only render edges where at least one endpoint is visible
    return allEdges.filter(
      (edge) => visibleIds.has(edge.source) || visibleIds.has(edge.target),
    );
  }, [allEdges, visibleNodes]); // visibleNodes dependency ensures visibleIds ref is up to date

  return {
    visibleNodes,
    visibleEdges,
    isLowZoom,
    totalNodeCount: allNodes.length,
    visibleNodeCount: visibleNodes.length,
  };
}
