import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { ActionData, ActionNode } from '../../../api/hooks.js';

type ConditionalNodeProps = NodeProps & { data: ActionData; selected?: boolean };

function branchSummary(children: ActionNode[] | undefined): string {
  if (!children || children.length === 0) return 'Empty';
  const count = children.length;
  return `${count} action${count !== 1 ? 's' : ''}`;
}

export const ConditionalNode = memo(function ConditionalNode({ data, selected }: ConditionalNodeProps) {
  const condition = data.condition ?? 'condition';
  const thenChildren = data.thenChildren ?? [];
  const elseIfBranches = data.elseIfBranches ?? [];
  const elseChildren = data.elseChildren;

  return (
    <>
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-zinc-500" />
      <div
        className={`bg-zinc-900/80 rounded-lg shadow-lg min-w-[260px] max-w-[360px] border-2 border-dashed ${
          selected ? 'border-amber-400 ring-1 ring-amber-400/50' : 'border-amber-600/50'
        }`}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-900/30 rounded-t-lg border-b border-amber-700/30">
          <span className="text-sm">{'\u2666'}</span>
          <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider">
            Conditional
          </span>
        </div>

        {/* Condition expression */}
        <div className="px-3 py-1.5 border-b border-zinc-700/30">
          <code className="text-amber-300 text-xs font-mono break-all">if ({condition})</code>
        </div>

        {/* Then branch */}
        <div className="px-3 py-1.5 border-b border-zinc-700/30">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-green-400 text-[10px] font-semibold uppercase tracking-wider">Then</span>
            <span className="text-zinc-500 text-[10px]">{branchSummary(thenChildren)}</span>
          </div>
          {thenChildren.length > 0 && (
            <div className="space-y-0.5">
              {thenChildren.map((child, i) => (
                <div
                  key={child.id ?? i}
                  className="flex items-center gap-1.5 px-2 py-0.5 bg-zinc-800/60 rounded text-xs text-zinc-400 border border-zinc-700/30"
                >
                  <span className="text-zinc-600 text-[10px] font-mono w-4 text-right shrink-0">
                    {i + 1}.
                  </span>
                  <span className="text-zinc-300 truncate">{child.data?.type ?? child.type}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Else-if branches */}
        {elseIfBranches.map((branch, idx) => (
          <div key={idx} className="px-3 py-1.5 border-b border-zinc-700/30">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-blue-400 text-[10px] font-semibold uppercase tracking-wider">Else If</span>
              <code className="text-blue-300 text-[10px] font-mono truncate">{branch.condition}</code>
            </div>
            <span className="text-zinc-500 text-[10px]">{branchSummary(branch.children)}</span>
          </div>
        ))}

        {/* Else branch */}
        {elseChildren && elseChildren.length > 0 && (
          <div className="px-3 py-1.5">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-red-400 text-[10px] font-semibold uppercase tracking-wider">Else</span>
              <span className="text-zinc-500 text-[10px]">{branchSummary(elseChildren)}</span>
            </div>
            <div className="space-y-0.5">
              {elseChildren.map((child, i) => (
                <div
                  key={child.id ?? i}
                  className="flex items-center gap-1.5 px-2 py-0.5 bg-zinc-800/60 rounded text-xs text-zinc-400 border border-zinc-700/30"
                >
                  <span className="text-zinc-600 text-[10px] font-mono w-4 text-right shrink-0">
                    {i + 1}.
                  </span>
                  <span className="text-zinc-300 truncate">{child.data?.type ?? child.type}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty else indicator */}
        {(!elseChildren || elseChildren.length === 0) && elseIfBranches.length === 0 && (
          <div className="px-3 py-1.5">
            <p className="text-zinc-600 text-[10px] italic">No else branch</p>
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-zinc-500" />
    </>
  );
});
