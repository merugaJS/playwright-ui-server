import { memo } from 'react';
import { BaseEdge, getStraightPath, getBezierPath, type EdgeProps } from '@xyflow/react';
import { useStore } from '@xyflow/react';
import { COMPACT_ZOOM_THRESHOLD, MINIMAL_ZOOM_THRESHOLD, SIMPLIFIED_EDGE_THRESHOLD } from '../../../hooks/useZoomLevel.js';

/**
 * Optimized edge component that switches rendering strategy based on
 * zoom level AND total edge count:
 *
 * - At normal zoom with few edges: renders standard bezier curves
 * - At low zoom (< 50%) OR when edge count > 100: renders straight lines
 * - At minimal zoom (< 25%): renders ultra-thin straight lines
 *
 * SVG bezier path calculations are the single biggest bottleneck at scale,
 * so switching to straight lines above 100 edges eliminates most of this cost.
 */
export const OptimizedEdge = memo(function OptimizedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
}: EdgeProps) {
  const zoom = useStore((state) => state.transform[2]);
  const edgeCount = useStore((state) => state.edges.length);

  const isLowZoom = zoom < COMPACT_ZOOM_THRESHOLD;
  const isMinimalZoom = zoom < MINIMAL_ZOOM_THRESHOLD;
  const hasManyEdges = edgeCount > SIMPLIFIED_EDGE_THRESHOLD;

  // Use straight lines when zoomed out or when there are many edges
  const useSimplified = isLowZoom || hasManyEdges;

  const [edgePath] = useSimplified
    ? getStraightPath({ sourceX, sourceY, targetX, targetY })
    : getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });

  // Progressive stroke width reduction at lower zoom levels
  let strokeWidth = style?.strokeWidth ?? 2;
  if (isMinimalZoom) {
    strokeWidth = 0.5;
  } else if (isLowZoom) {
    strokeWidth = 1;
  } else if (hasManyEdges) {
    strokeWidth = 1.5;
  }

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={{
        ...style,
        strokeWidth,
      }}
      markerEnd={markerEnd}
    />
  );
});

export const edgeTypes = {
  default: OptimizedEdge,
};
