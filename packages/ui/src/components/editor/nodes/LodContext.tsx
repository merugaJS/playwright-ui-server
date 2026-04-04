import { createContext, useContext } from 'react';
import type { LodMode } from '../../../hooks/useZoomLevel.js';

/**
 * Context that provides the current level-of-detail mode to all node components.
 * This avoids each node independently subscribing to the zoom level.
 */
export const LodContext = createContext<LodMode>('full');

export function useLodMode(): LodMode {
  return useContext(LodContext);
}
