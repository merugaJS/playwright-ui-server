import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { ReactNode } from 'react';

const categoryColors: Record<string, string> = {
  navigation: '#3b82f6',   // blue
  interaction: '#22c55e',  // green
  assertion: '#f59e0b',    // amber
  utility: '#8b5cf6',      // purple
  code: '#6b7280',         // gray
};

interface BaseNodeProps {
  category: keyof typeof categoryColors;
  icon: string;
  label: string;
  children: ReactNode;
  selected?: boolean;
}

export const BaseNode = memo(function BaseNode({ category, icon, label, children, selected }: BaseNodeProps) {
  const borderColor = categoryColors[category] ?? '#6b7280';

  return (
    <>
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-zinc-500" />
      <div
        className={`bg-zinc-800 rounded-lg shadow-lg min-w-[220px] max-w-[300px] border ${
          selected ? 'border-blue-500 ring-1 ring-blue-500/50' : 'border-zinc-700'
        }`}
        style={{ borderLeftWidth: '3px', borderLeftColor: borderColor }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-700/50">
          <span className="text-sm">{icon}</span>
          <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
            {label}
          </span>
        </div>
        {/* Content */}
        <div className="px-3 py-2 text-sm">
          {children}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-zinc-500" />
    </>
  );
});
