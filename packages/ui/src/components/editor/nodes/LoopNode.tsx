import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { ActionData } from '../../../api/hooks.js';

type LoopNodeProps = NodeProps & { data: ActionData; selected?: boolean };

const loopKindLabels: Record<string, string> = {
  for: 'for',
  'for...of': 'for...of',
  'for...in': 'for...in',
};

function getLoopHeader(data: ActionData): string {
  const kind = data.loopKind ?? 'for';
  if (kind === 'for') {
    const init = data.initializer ?? '';
    const cond = data.condition ?? '';
    const inc = data.incrementer ?? '';
    return `for (${init}; ${cond}; ${inc})`;
  }
  if (kind === 'for...of') {
    const varName = data.variableName ?? 'item';
    const iter = data.iterable ?? 'items';
    return `for (const ${varName} of ${iter})`;
  }
  // for...in
  const varName = data.variableName ?? 'key';
  const obj = data.iterable ?? 'obj';
  return `for (const ${varName} in ${obj})`;
}

function getBodySummary(body: ActionData['body']): string {
  if (!body || body.length === 0) return 'Empty body';
  const count = body.length;
  return `${count} action${count !== 1 ? 's' : ''} inside`;
}

export const LoopNode = memo(function LoopNode({ data, selected }: LoopNodeProps) {
  const kind = data.loopKind ?? 'for';
  const header = getLoopHeader(data);
  const body = (Array.isArray(data.body) ? data.body : []) as import('../../../api/hooks.js').ActionNode[];

  return (
    <>
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-zinc-500" />
      <div
        className={`bg-zinc-900/80 rounded-lg shadow-lg min-w-[260px] max-w-[340px] border-2 border-dashed ${
          selected ? 'border-cyan-400 ring-1 ring-cyan-400/50' : 'border-cyan-600/50'
        }`}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 bg-cyan-900/30 rounded-t-lg border-b border-cyan-700/30">
          <span className="text-sm">&#x1f501;</span>
          <span className="text-[10px] font-semibold text-cyan-400 uppercase tracking-wider">
            {loopKindLabels[kind] ?? 'Loop'}
          </span>
        </div>

        {/* Loop expression */}
        <div className="px-3 py-1.5 border-b border-zinc-700/30">
          <code className="text-cyan-300 text-xs font-mono break-all">{header}</code>
        </div>

        {/* Body summary */}
        <div className="px-3 py-2">
          {body.length === 0 ? (
            <p className="text-zinc-500 text-xs italic">Empty body</p>
          ) : (
            <div className="space-y-1">
              <p className="text-zinc-500 text-[10px] uppercase tracking-wider mb-1">
                {getBodySummary(body)}
              </p>
              {body.map((child, i) => (
                <div
                  key={child.id ?? i}
                  className="flex items-center gap-1.5 px-2 py-1 bg-zinc-800/60 rounded text-xs text-zinc-400 border border-zinc-700/30"
                >
                  <span className="text-zinc-600 text-[10px] font-mono w-4 text-right shrink-0">
                    {i + 1}.
                  </span>
                  <span className="text-zinc-300 truncate">{child.type}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-zinc-500" />
    </>
  );
});
