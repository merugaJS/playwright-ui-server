import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode.js';
import type { ActionData } from '../../../api/hooks.js';

type ActionNodeProps = NodeProps & { data: ActionData; selected?: boolean };

const handlerColors: Record<string, string> = {
  fulfill: 'text-green-400',
  abort: 'text-red-400',
  continue: 'text-yellow-400',
};

const handlerLabels: Record<string, string> = {
  fulfill: 'Fulfill',
  abort: 'Abort',
  continue: 'Continue',
};

export const NetworkRouteNode = memo(function NetworkRouteNode({ data, selected }: ActionNodeProps) {
  const handlerAction = data.handlerAction ?? 'fulfill';
  const colorClass = handlerColors[handlerAction] ?? 'text-zinc-400';
  const label = handlerLabels[handlerAction] ?? handlerAction;

  return (
    <BaseNode category="utility" icon={'\u{1F310}'} label="Network Route" selected={selected}>
      <div className="flex flex-col gap-1">
        <span className="text-blue-300 text-xs font-mono truncate max-w-[240px]">
          {data.urlPattern ?? '*'}
        </span>
        <span className={`text-xs font-semibold ${colorClass}`}>
          {label}
        </span>
        {handlerAction === 'fulfill' && data.fulfillOptions?.status && (
          <span className="text-zinc-400 text-[10px]">
            Status: {data.fulfillOptions.status}
          </span>
        )}
        {handlerAction === 'abort' && data.abortReason && (
          <span className="text-zinc-400 text-[10px]">
            Reason: {data.abortReason}
          </span>
        )}
      </div>
    </BaseNode>
  );
});
