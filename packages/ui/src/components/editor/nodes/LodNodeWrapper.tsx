import { memo, type ComponentType } from 'react';
import type { NodeProps } from '@xyflow/react';
import { useLodMode } from './LodContext.js';
import { CompactNode, MinimalNode } from './CompactNode.js';

/**
 * Higher-order component that wraps a full-detail node component with LOD switching.
 * At compact zoom, renders CompactNode. At minimal zoom, renders MinimalNode.
 * At full zoom, renders the original component.
 *
 * Uses React.memo with a custom comparator that includes the LOD mode,
 * so nodes only re-render when their data, selection, or LOD level changes.
 */
export function withLod(
  FullComponent: ComponentType<NodeProps>,
  nodeType: string,
): ComponentType<NodeProps> {
  const LodWrapped = memo(function LodWrapped(props: NodeProps) {
    const lodMode = useLodMode();

    if (lodMode === 'minimal') {
      return <MinimalNode type={nodeType} selected={props.selected} />;
    }

    if (lodMode === 'compact') {
      return <CompactNode type={nodeType} selected={props.selected} />;
    }

    return <FullComponent {...props} />;
  }, (prev, next) => {
    // Custom comparator: re-render if data, selected, or LOD would change
    // LOD is from context so React handles that, but we still need data/selected checks
    return prev.selected === next.selected && prev.data === next.data;
  });

  LodWrapped.displayName = `LodWrapped(${nodeType})`;
  return LodWrapped;
}
