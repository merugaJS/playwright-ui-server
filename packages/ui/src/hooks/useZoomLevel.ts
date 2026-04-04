import { useCallback } from 'react';
import { useStore } from '@xyflow/react';

/**
 * Level-of-detail modes for node rendering.
 * - `full`: All details visible (default, zoom >= 50%)
 * - `compact`: Label + type badge only (25% <= zoom < 50%)
 * - `minimal`: Colored dot/pill, no text (zoom < 25%)
 */
export type LodMode = 'full' | 'compact' | 'minimal';

/** Zoom threshold below which nodes render in compact mode */
export const COMPACT_ZOOM_THRESHOLD = 0.5;

/** Zoom threshold below which nodes render in minimal mode */
export const MINIMAL_ZOOM_THRESHOLD = 0.25;

/**
 * Edge count threshold above which edges switch to simplified straight-line rendering.
 */
export const SIMPLIFIED_EDGE_THRESHOLD = 100;

/**
 * Hook that subscribes to the React Flow viewport zoom level
 * and returns the current LOD mode.
 *
 * Uses React Flow's internal store subscription for efficient updates.
 */
export function useZoomLevel() {
  const zoom = useStore(
    useCallback(
      (state: { transform: [number, number, number] }) => state.transform[2],
      [],
    ),
  );

  let lodMode: LodMode;
  if (zoom < MINIMAL_ZOOM_THRESHOLD) {
    lodMode = 'minimal';
  } else if (zoom < COMPACT_ZOOM_THRESHOLD) {
    lodMode = 'compact';
  } else {
    lodMode = 'full';
  }

  return { zoom, lodMode };
}
