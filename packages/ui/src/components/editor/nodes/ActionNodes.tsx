import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import { BaseNode } from './BaseNode.js';
import { LoopNode } from './LoopNode.js';
import { ConditionalNode } from './ConditionalNode.js';
import { NetworkRouteNode } from './NetworkRouteNode.js';
import { withLod } from './LodNodeWrapper.js';
import type { ActionData, LocatorRef, LocatorModifier } from '../../../api/hooks.js';

type ActionNodeProps = NodeProps & { data: ActionData; selected?: boolean };

function ModifierBadge({ modifier }: { modifier: LocatorModifier }) {
  switch (modifier.kind) {
    case 'filter':
      return <span className="text-amber-400 text-[10px] font-mono">.filter({modifier.hasText ? `hasText: '${modifier.hasText}'` : '...'})</span>;
    case 'nth':
      return <span className="text-amber-400 text-[10px] font-mono">.nth({modifier.index})</span>;
    case 'first':
      return <span className="text-amber-400 text-[10px] font-mono">.first()</span>;
    case 'last':
      return <span className="text-amber-400 text-[10px] font-mono">.last()</span>;
  }
}

function LocatorStepBadge({ strategy, value, modifiers }: { strategy: string; value: string; modifiers?: LocatorModifier[] }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1">
        <span className="text-zinc-500 text-[10px] font-medium">{strategy}</span>
        <span className="text-zinc-300 text-xs font-mono truncate max-w-[180px]">{value}</span>
      </div>
      {modifiers && modifiers.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {modifiers.map((mod, i) => <ModifierBadge key={i} modifier={mod} />)}
        </div>
      )}
    </div>
  );
}

function FrameIndicator({ frameLocators }: { frameLocators?: string[] }) {
  if (!frameLocators || frameLocators.length === 0) return null;
  return (
    <div className="flex items-center gap-1 mb-1 px-1.5 py-0.5 rounded border border-cyan-500/30 bg-cyan-500/10">
      <span className="text-cyan-400 text-[10px] font-semibold">iframe</span>
      <span className="text-cyan-300 text-[10px] font-mono truncate max-w-[160px]">
        {frameLocators.join(' > ')}
      </span>
    </div>
  );
}

function LocatorBadge({ locator }: { locator?: LocatorRef }) {
  if (!locator) return null;
  if (locator.kind === 'pageObject') {
    return (
      <span className="text-purple-400 text-xs font-mono">
        {locator.locatorName}
      </span>
    );
  }

  // Chained locator — display steps as breadcrumb
  if (locator.chain && locator.chain.length > 0) {
    return (
      <div className="flex flex-col gap-0.5">
        {locator.chain.map((step, i) => (
          <div key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-zinc-600 text-[10px]">&rarr;</span>}
            <LocatorStepBadge strategy={step.strategy} value={step.value} modifiers={step.modifiers} />
          </div>
        ))}
      </div>
    );
  }

  // Single-step locator
  return (
    <div className="flex flex-col gap-0.5">
      <LocatorStepBadge strategy={locator.strategy ?? 'locator'} value={locator.value ?? ''} modifiers={locator.modifiers} />
    </div>
  );
}

/** Renders the custom expect message if present */
function ExpectMessage({ message }: { message?: string }) {
  if (!message) return null;
  return <div className="mt-0.5 text-zinc-400 text-[10px] italic truncate max-w-[200px]">{message}</div>;
}

/** Shallow comparison for ActionNodeProps — avoids re-render unless data or selected actually changed */
function areNodePropsEqual(prev: ActionNodeProps, next: ActionNodeProps): boolean {
  return prev.selected === next.selected && prev.data === next.data;
}

export const NavigateNode = memo(function NavigateNode({ data, selected }: ActionNodeProps) {
  return (
    <BaseNode category="navigation" icon="🌐" label="Navigate" selected={selected}>
      <span className="text-blue-300 text-xs font-mono">{data.url}</span>
    </BaseNode>
  );
}, areNodePropsEqual);

export const ClickNode = memo(function ClickNode({ data, selected }: ActionNodeProps) {
  return (
    <BaseNode category="interaction" icon="👆" label="Click" selected={selected}>
      <FrameIndicator frameLocators={data.frameLocators} />
      <LocatorBadge locator={data.locator} />
    </BaseNode>
  );
}, areNodePropsEqual);

export const FillNode = memo(function FillNode({ data, selected }: ActionNodeProps) {
  return (
    <BaseNode category="interaction" icon="✏️" label="Fill" selected={selected}>
      <FrameIndicator frameLocators={data.frameLocators} />
      <LocatorBadge locator={data.locator} />
      <div className="mt-1 text-green-300 text-xs font-mono truncate">
        "{data.value}"
      </div>
    </BaseNode>
  );
}, areNodePropsEqual);

export const HoverNode = memo(function HoverNode({ data, selected }: ActionNodeProps) {
  return (
    <BaseNode category="interaction" icon="🖱️" label="Hover" selected={selected}>
      <FrameIndicator frameLocators={data.frameLocators} />
      <LocatorBadge locator={data.locator} />
    </BaseNode>
  );
}, areNodePropsEqual);

export const SelectOptionNode = memo(function SelectOptionNode({ data, selected }: ActionNodeProps) {
  return (
    <BaseNode category="interaction" icon="📋" label="Select Option" selected={selected}>
      <FrameIndicator frameLocators={data.frameLocators} />
      <LocatorBadge locator={data.locator} />
      <div className="mt-1 text-green-300 text-xs font-mono truncate">
        "{data.value}"
      </div>
    </BaseNode>
  );
}, areNodePropsEqual);

export const AssertTextNode = memo(function AssertTextNode({ data, selected }: ActionNodeProps) {
  return (
    <BaseNode category="assertion" icon="✅" label="Assert Text" selected={selected}>
      <FrameIndicator frameLocators={data.frameLocators} />
      <LocatorBadge locator={data.locator} />
      <div className="mt-1 text-amber-300 text-xs font-mono truncate">
        expects: "{data.expected}"
      </div>
      <ExpectMessage message={data.message} />
    </BaseNode>
  );
}, areNodePropsEqual);

export const AssertVisibleNode = memo(function AssertVisibleNode({ data, selected }: ActionNodeProps) {
  return (
    <BaseNode category="assertion" icon="👁️" label="Assert Visible" selected={selected}>
      <FrameIndicator frameLocators={data.frameLocators} />
      <LocatorBadge locator={data.locator} />
      <ExpectMessage message={data.message} />
    </BaseNode>
  );
}, areNodePropsEqual);

export const AssertCountNode = memo(function AssertCountNode({ data, selected }: ActionNodeProps) {
  return (
    <BaseNode category="assertion" icon="🔢" label="Assert Count" selected={selected}>
      <FrameIndicator frameLocators={data.frameLocators} />
      <LocatorBadge locator={data.locator} />
      <div className="mt-1 text-amber-300 text-xs font-mono">
        {data.negated ? 'not ' : ''}count: {data.expected}
      </div>
      <ExpectMessage message={data.message} />
    </BaseNode>
  );
}, areNodePropsEqual);

export const AssertURLNode = memo(function AssertURLNode({ data, selected }: ActionNodeProps) {
  return (
    <BaseNode category="assertion" icon="🔗" label="Assert URL" selected={selected}>
      <span className="text-amber-300 text-xs font-mono truncate max-w-[200px]">
        {data.negated ? 'not ' : ''}{data.isRegex ? '/' : '"'}{data.expected}{data.isRegex ? '/' : '"'}
      </span>
      <ExpectMessage message={data.message} />
    </BaseNode>
  );
}, areNodePropsEqual);

export const AssertTitleNode = memo(function AssertTitleNode({ data, selected }: ActionNodeProps) {
  return (
    <BaseNode category="assertion" icon="📝" label="Assert Title" selected={selected}>
      <span className="text-amber-300 text-xs font-mono truncate max-w-[200px]">
        {data.negated ? 'not ' : ''}{data.isRegex ? '/' : '"'}{data.expected}{data.isRegex ? '/' : '"'}
      </span>
      <ExpectMessage message={data.message} />
    </BaseNode>
  );
}, areNodePropsEqual);

export const AssertScreenshotNode = memo(function AssertScreenshotNode({ data, selected }: ActionNodeProps) {
  return (
    <BaseNode category="assertion" icon="📷" label="Assert Screenshot" selected={selected}>
      <span className="text-amber-300 text-xs">
        {data.name ?? 'auto'}{data.fullPage ? ' (full page)' : ''}
      </span>
      <ExpectMessage message={data.message} />
    </BaseNode>
  );
}, areNodePropsEqual);

export const AssertAttributeNode = memo(function AssertAttributeNode({ data, selected }: ActionNodeProps) {
  return (
    <BaseNode category="assertion" icon="🏷️" label="Assert Attribute" selected={selected}>
      <FrameIndicator frameLocators={data.frameLocators} />
      <LocatorBadge locator={data.locator} />
      <div className="mt-1 text-amber-300 text-xs font-mono">
        [{data.attributeName}] = "{data.expected}"
      </div>
      <ExpectMessage message={data.message} />
    </BaseNode>
  );
}, areNodePropsEqual);

export const AssertValueNode = memo(function AssertValueNode({ data, selected }: ActionNodeProps) {
  return (
    <BaseNode category="assertion" icon="📊" label="Assert Value" selected={selected}>
      <FrameIndicator frameLocators={data.frameLocators} />
      <LocatorBadge locator={data.locator} />
      <div className="mt-1 text-amber-300 text-xs font-mono truncate">
        {data.negated ? 'not ' : ''}"{data.expected}"
      </div>
      <ExpectMessage message={data.message} />
    </BaseNode>
  );
}, areNodePropsEqual);

export const AssertClassNode = memo(function AssertClassNode({ data, selected }: ActionNodeProps) {
  return (
    <BaseNode category="assertion" icon="🎨" label="Assert Class" selected={selected}>
      <FrameIndicator frameLocators={data.frameLocators} />
      <LocatorBadge locator={data.locator} />
      <div className="mt-1 text-amber-300 text-xs font-mono truncate">
        {data.negated ? 'not ' : ''}"{data.expected}"
      </div>
      <ExpectMessage message={data.message} />
    </BaseNode>
  );
}, areNodePropsEqual);

export const AssertEnabledNode = memo(function AssertEnabledNode({ data, selected }: ActionNodeProps) {
  return (
    <BaseNode category="assertion" icon="✅" label="Assert Enabled" selected={selected}>
      <FrameIndicator frameLocators={data.frameLocators} />
      <LocatorBadge locator={data.locator} />
      <ExpectMessage message={data.message} />
    </BaseNode>
  );
}, areNodePropsEqual);

export const AssertDisabledNode = memo(function AssertDisabledNode({ data, selected }: ActionNodeProps) {
  return (
    <BaseNode category="assertion" icon="🚫" label="Assert Disabled" selected={selected}>
      <FrameIndicator frameLocators={data.frameLocators} />
      <LocatorBadge locator={data.locator} />
      <ExpectMessage message={data.message} />
    </BaseNode>
  );
}, areNodePropsEqual);

export const AssertCheckedNode = memo(function AssertCheckedNode({ data, selected }: ActionNodeProps) {
  return (
    <BaseNode category="assertion" icon="☑️" label="Assert Checked" selected={selected}>
      <FrameIndicator frameLocators={data.frameLocators} />
      <LocatorBadge locator={data.locator} />
      <ExpectMessage message={data.message} />
    </BaseNode>
  );
}, areNodePropsEqual);

export const AssertHiddenNode = memo(function AssertHiddenNode({ data, selected }: ActionNodeProps) {
  return (
    <BaseNode category="assertion" icon="🙈" label="Assert Hidden" selected={selected}>
      <FrameIndicator frameLocators={data.frameLocators} />
      <LocatorBadge locator={data.locator} />
      <ExpectMessage message={data.message} />
    </BaseNode>
  );
}, areNodePropsEqual);

export const NewTabNode = memo(function NewTabNode({ data, selected }: ActionNodeProps) {
  return (
    <BaseNode category="navigation" icon="🗂️" label="New Tab" selected={selected}>
      <div className="flex flex-col gap-0.5">
        <span className="text-blue-300 text-xs font-mono">{data.pageVariable ?? 'newPage'}</span>
        {data.triggerAction && (
          <span className="text-zinc-400 text-[10px] truncate max-w-[200px]">{data.triggerAction}</span>
        )}
      </div>
    </BaseNode>
  );
}, areNodePropsEqual);

export const DialogHandlerNode = memo(function DialogHandlerNode({ data, selected }: ActionNodeProps) {
  return (
    <BaseNode category="utility" icon="💬" label="Dialog Handler" selected={selected}>
      <div className="flex items-center gap-1.5">
        <span className={`text-xs font-semibold ${data.action === 'accept' ? 'text-green-400' : 'text-red-400'}`}>
          {data.action ?? 'accept'}
        </span>
        {data.inputText && (
          <span className="text-zinc-400 text-[10px] font-mono truncate">"{data.inputText}"</span>
        )}
      </div>
    </BaseNode>
  );
}, areNodePropsEqual);

export const FileUploadNode = memo(function FileUploadNode({ data, selected }: ActionNodeProps) {
  return (
    <BaseNode category="interaction" icon="📁" label="File Upload" selected={selected}>
      <div className="flex flex-col gap-0.5">
        <span className="text-zinc-400 text-[10px]">{data.selector}</span>
        {data.files && (
          <span className="text-green-300 text-xs font-mono truncate">
            {Array.isArray(data.files) ? data.files.join(', ') : data.files}
          </span>
        )}
      </div>
    </BaseNode>
  );
}, areNodePropsEqual);

export const StorageStateNode = memo(function StorageStateNode({ data, selected }: ActionNodeProps) {
  return (
    <BaseNode category="utility" icon="💾" label="Storage State" selected={selected}>
      <div className="flex flex-col gap-0.5">
        <span className={`text-xs font-semibold ${data.operation === 'save' ? 'text-green-400' : 'text-blue-400'}`}>
          {data.operation ?? 'save'}
        </span>
        <span className="text-zinc-400 text-[10px] font-mono truncate max-w-[200px]">{data.filePath}</span>
      </div>
    </BaseNode>
  );
}, areNodePropsEqual);

export const CookieActionNode = memo(function CookieActionNode({ data, selected }: ActionNodeProps) {
  const opColors: Record<string, string> = { add: 'text-green-400', get: 'text-blue-400', clear: 'text-red-400' };
  return (
    <BaseNode category="utility" icon="🍪" label="Cookie" selected={selected}>
      <span className={`text-xs font-semibold ${opColors[data.operation ?? ''] ?? 'text-zinc-400'}`}>
        {data.operation ?? 'get'}
      </span>
    </BaseNode>
  );
}, areNodePropsEqual);

export const FileDownloadNode = memo(function FileDownloadNode({ data, selected }: ActionNodeProps) {
  return (
    <BaseNode category="interaction" icon="⬇️" label="File Download" selected={selected}>
      <div className="flex flex-col gap-0.5">
        <span className="text-blue-300 text-xs font-mono">{data.downloadVariable ?? 'download'}</span>
        {data.savePath && (
          <span className="text-zinc-400 text-[10px] font-mono truncate max-w-[200px]">{data.savePath}</span>
        )}
      </div>
    </BaseNode>
  );
}, areNodePropsEqual);

export const GroupNode = memo(function GroupNode({ data, selected }: ActionNodeProps) {
  const children = Array.isArray(data.children) ? data.children : [];
  return (
    <BaseNode category="utility" icon="📦" label={`Step: ${data.stepName ?? 'group'}`} selected={selected}>
      <span className="text-zinc-400 text-[10px]">
        {children.length} action{children.length !== 1 ? 's' : ''} inside
      </span>
    </BaseNode>
  );
}, areNodePropsEqual);

export const TryCatchNode = memo(function TryCatchNode({ data, selected }: ActionNodeProps) {
  const tryChildren = Array.isArray(data.tryChildren) ? data.tryChildren : [];
  const catchChildren = Array.isArray(data.catchChildren) ? data.catchChildren : [];
  const finallyChildren = Array.isArray(data.finallyChildren) ? data.finallyChildren : [];
  return (
    <BaseNode category="code" icon="🛡️" label="Try/Catch" selected={selected}>
      <div className="flex flex-col gap-0.5 text-[10px]">
        <span className="text-green-400">try: {tryChildren.length} action{tryChildren.length !== 1 ? 's' : ''}</span>
        {catchChildren.length > 0 && (
          <span className="text-red-400">catch{data.catchVariable ? `(${data.catchVariable})` : ''}: {catchChildren.length}</span>
        )}
        {finallyChildren.length > 0 && (
          <span className="text-blue-400">finally: {finallyChildren.length}</span>
        )}
      </div>
    </BaseNode>
  );
}, areNodePropsEqual);

export const ParameterizedTestNode = memo(function ParameterizedTestNode({ data, selected }: ActionNodeProps) {
  return (
    <BaseNode category="utility" icon="🔄" label="Parameterized Test" selected={selected}>
      <div className="flex flex-col gap-0.5">
        <span className="text-cyan-300 text-xs font-mono">{data.loopPattern ?? 'for...of'}</span>
        <span className="text-zinc-400 text-[10px]">
          {data.dataItems?.length ?? '?'} data items
        </span>
      </div>
    </BaseNode>
  );
}, areNodePropsEqual);

export const ResponseAssertionNode = memo(function ResponseAssertionNode({ data, selected }: ActionNodeProps) {
  return (
    <BaseNode category="assertion" icon="📡" label="Response Assertion" selected={selected}>
      <div className="flex flex-col gap-0.5">
        <span className="text-amber-300 text-xs font-semibold">
          {data.negated ? 'not.' : ''}{data.assertionType ?? 'toBeOK'}
        </span>
        {data.expectedValue && (
          <span className="text-zinc-400 text-[10px] font-mono truncate">{data.expectedValue}</span>
        )}
      </div>
    </BaseNode>
  );
}, areNodePropsEqual);

export const BrowserStorageNode = memo(function BrowserStorageNode({ data, selected }: ActionNodeProps) {
  return (
    <BaseNode category="utility" icon="🗄️" label={data.storageType === 'sessionStorage' ? 'Session Storage' : 'Local Storage'} selected={selected}>
      <div className="flex flex-col gap-0.5">
        <span className="text-purple-300 text-xs font-semibold">{data.operation ?? 'getItem'}</span>
        {data.key && (
          <span className="text-zinc-400 text-[10px] font-mono truncate">key: "{data.key}"</span>
        )}
      </div>
    </BaseNode>
  );
}, areNodePropsEqual);

export const NewContextNode = memo(function NewContextNode({ data, selected }: ActionNodeProps) {
  return (
    <BaseNode category="navigation" icon="🌐" label="New Context" selected={selected}>
      <div className="flex flex-col gap-0.5">
        <span className="text-blue-300 text-xs font-mono">{data.contextVariable ?? 'context'}</span>
        {data.options && (
          <span className="text-zinc-400 text-[10px] font-mono truncate max-w-[200px]">{data.options}</span>
        )}
      </div>
    </BaseNode>
  );
}, areNodePropsEqual);

export const IterationNode = memo(function IterationNode({ data, selected }: ActionNodeProps) {
  const method = data.method ?? 'forEach';
  const arrayExpr = data.arrayExpression ?? 'items';
  const params = data.callbackParams?.join(', ') ?? 'item';
  const children = (Array.isArray(data.children) ? data.children : []) as import('../../../api/hooks.js').ActionNode[];
  const methodLabels: Record<string, string> = { forEach: 'forEach', map: 'map', filter: 'filter' };

  return (
    <BaseNode category="code" icon="&#128260;" label={methodLabels[method] ?? 'Iteration'} selected={selected}>
      <div className="flex flex-col gap-0.5">
        <code className="text-cyan-300 text-xs font-mono break-all">
          {arrayExpr}.{method}({data.isAsync ? 'async ' : ''}({params}) =&gt; ...)
        </code>
        {data.resultVariable && (
          <span className="text-zinc-400 text-[10px]">&rarr; {data.resultVariable}</span>
        )}
        <span className="text-zinc-500 text-[10px]">
          {children.length} action{children.length !== 1 ? 's' : ''} inside
        </span>
      </div>
    </BaseNode>
  );
}, areNodePropsEqual);

export const UtilityCallNode = memo(function UtilityCallNode({ data, selected }: ActionNodeProps) {
  const funcName = data.functionName ?? 'utilityFn';
  const args = data.args ?? [];
  return (
    <BaseNode category="utility" icon="⚙️" label="Utility Call" selected={selected}>
      <div className="flex flex-col gap-0.5">
        <span className="text-purple-300 text-xs font-mono">
          {data.awaitExpression ? 'await ' : ''}{funcName}({args.join(', ')})
        </span>
        {data.resultVariable && (
          <span className="text-zinc-400 text-[10px]">→ {data.resultVariable}</span>
        )}
        {data.modulePath && (
          <span className="text-zinc-500 text-[10px] truncate max-w-[200px]">from {data.modulePath}</span>
        )}
      </div>
    </BaseNode>
  );
}, areNodePropsEqual);

export const WaitNode = memo(function WaitNode({ data, selected }: ActionNodeProps) {
  return (
    <BaseNode category="utility" icon="⏱️" label="Wait" selected={selected}>
      <span className="text-purple-300 text-xs">{data.duration}ms</span>
    </BaseNode>
  );
}, areNodePropsEqual);

export const ScreenshotNode = memo(function ScreenshotNode({ data, selected }: ActionNodeProps) {
  return (
    <BaseNode category="utility" icon="📸" label="Screenshot" selected={selected}>
      <span className="text-purple-300 text-xs">
        {data.name ?? 'auto'}{data.fullPage ? ' (full page)' : ''}
      </span>
    </BaseNode>
  );
}, areNodePropsEqual);

export const CodeBlockNode = memo(function CodeBlockNode({ data, selected }: ActionNodeProps) {
  return (
    <BaseNode category="code" icon="💻" label="Code" selected={selected}>
      <pre className="text-zinc-400 text-xs font-mono whitespace-pre-wrap max-h-[80px] overflow-hidden">
        {data.code}
      </pre>
    </BaseNode>
  );
}, areNodePropsEqual);

export const PageObjectRefNode = memo(function PageObjectRefNode({ data, selected }: ActionNodeProps) {
  return (
    <BaseNode category="code" icon="📦" label="Page Object" selected={selected}>
      <span className="text-purple-300 text-xs font-mono">
        {data.method}({data.args?.join(', ')})
      </span>
    </BaseNode>
  );
}, areNodePropsEqual);

const methodBadgeColors: Record<string, string> = {
  GET: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  POST: 'bg-green-500/20 text-green-300 border-green-500/30',
  PUT: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  DELETE: 'bg-red-500/20 text-red-300 border-red-500/30',
  PATCH: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
};

export const ApiRequestNode = memo(function ApiRequestNode({ data, selected }: ActionNodeProps) {
  const method = data.method ?? 'GET';
  const badgeClass = methodBadgeColors[method] ?? methodBadgeColors['GET'];
  const body = typeof data.body === 'string' ? data.body : undefined;

  return (
    <BaseNode category="navigation" icon="" label="API Request" selected={selected}>
      <div className="flex items-center gap-1.5">
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${badgeClass}`}>
          {method}
        </span>
        <span className="text-blue-300 text-xs font-mono truncate max-w-[180px]">
          {data.url}
        </span>
      </div>
      {data.resultVariable && (
        <div className="mt-1 text-zinc-500 text-[10px]">
          &rarr; {data.resultVariable}
        </div>
      )}
      {body && (
        <div className="mt-1 text-zinc-400 text-[10px] font-mono truncate max-w-[200px]">
          {body.length > 50 ? body.slice(0, 50) + '...' : body}
        </div>
      )}
    </BaseNode>
  );
}, areNodePropsEqual);

export const SwitchNode = memo(function SwitchNode({ data, selected }: ActionNodeProps) {
  const cases = Array.isArray(data.cases) ? data.cases : [];
  const caseLabels = cases.map((c: { value: string | null }) =>
    c.value === null ? 'default' : String(c.value),
  );
  return (
    <BaseNode category="code" icon="&#x2194;" label="Switch" selected={selected}>
      <div className="flex flex-col gap-0.5">
        <span className="text-cyan-300 text-xs font-mono truncate max-w-[200px]">
          {data.expression}
        </span>
        <span className="text-zinc-400 text-[10px]">
          {cases.length} case{cases.length !== 1 ? 's' : ''}: {caseLabels.join(', ')}
        </span>
      </div>
    </BaseNode>
  );
}, areNodePropsEqual);

const dataTypeBadgeColors: Record<string, string> = {
  'array-of-objects': 'bg-teal-500/20 text-teal-300 border-teal-500/30',
  'array-of-primitives': 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  'object': 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
};

export const InlineDataNode = memo(function InlineDataNode({ data, selected }: ActionNodeProps) {
  const varName = data.variableName ?? 'data';
  const dataType = data.dataType ?? 'object';
  const badgeClass = dataTypeBadgeColors[dataType] ?? dataTypeBadgeColors['object'];
  const values = data.values;

  let preview = '';
  if (Array.isArray(values)) {
    preview = `${values.length} item${values.length !== 1 ? 's' : ''}`;
  } else if (values && typeof values === 'object') {
    const keys = Object.keys(values as Record<string, unknown>);
    preview = keys.length <= 3 ? keys.join(', ') : `${keys.slice(0, 3).join(', ')}...`;
  }

  return (
    <BaseNode category="code" icon="&#128202;" label="Inline Data" selected={selected}>
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-green-300 text-xs font-mono font-semibold">{data.isConst ? 'const' : 'let'} {varName}</span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${badgeClass}`}>
            {dataType}
          </span>
        </div>
        {preview && (
          <span className="text-zinc-400 text-[10px] font-mono truncate max-w-[200px]">
            {preview}
          </span>
        )}
      </div>
    </BaseNode>
  );
}, areNodePropsEqual);

export const HarRouteNode = memo(function HarRouteNode({ data, selected }: ActionNodeProps) {
  const fileName = (data.harFilePath ?? '').split('/').pop() ?? data.harFilePath ?? 'har';
  const mode = data.mode ?? 'playback';
  const icon = mode === 'record' ? '🔴' : '▶️';
  return (
    <BaseNode category="network" icon={icon} label={`HAR ${mode === 'record' ? 'Record' : 'Playback'}`} selected={selected}>
      <div className="flex flex-col gap-0.5">
        <span className="text-blue-300 text-xs font-mono truncate max-w-[200px]">{fileName}</span>
        {data.url && <span className="text-zinc-400 text-[10px]">url: {data.url}</span>}
        {data.notFound && <span className="text-zinc-500 text-[10px]">notFound: {data.notFound}</span>}
      </div>
    </BaseNode>
  );
}, areNodePropsEqual);

export const HookLabelNode = memo(function HookLabelNode({ data }: ActionNodeProps) {
  const hookName = data.hookName ?? 'Hook';
  const colorMap: Record<string, string> = {
    beforeAll: 'border-purple-600/50 bg-purple-900/30 text-purple-400',
    beforeEach: 'border-amber-600/50 bg-amber-900/30 text-amber-400',
    afterEach: 'border-amber-600/50 bg-amber-900/30 text-amber-400',
    afterAll: 'border-purple-600/50 bg-purple-900/30 text-purple-400',
  };
  const colors = colorMap[hookName] ?? 'border-zinc-600 bg-zinc-800 text-zinc-400';
  return (
    <>
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-zinc-500" />
      <div className={`px-4 py-1.5 rounded-full border text-xs font-semibold uppercase tracking-wider ${colors}`}>
        {hookName}
      </div>
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-zinc-500" />
    </>
  );
}, areNodePropsEqual);

/**
 * Full-detail node types (no LOD wrapping).
 * Useful for contexts where LOD is not needed.
 */
export const fullNodeTypes = {
  navigate: NavigateNode,
  click: ClickNode,
  fill: FillNode,
  hover: HoverNode,
  selectOption: SelectOptionNode,
  assertText: AssertTextNode,
  assertVisible: AssertVisibleNode,
  assertCount: AssertCountNode,
  assertURL: AssertURLNode,
  assertTitle: AssertTitleNode,
  assertScreenshot: AssertScreenshotNode,
  assertAttribute: AssertAttributeNode,
  assertValue: AssertValueNode,
  assertClass: AssertClassNode,
  assertEnabled: AssertEnabledNode,
  assertDisabled: AssertDisabledNode,
  assertChecked: AssertCheckedNode,
  assertHidden: AssertHiddenNode,
  wait: WaitNode,
  screenshot: ScreenshotNode,
  codeBlock: CodeBlockNode,
  pageObjectRef: PageObjectRefNode,
  loop: LoopNode,
  conditional: ConditionalNode,
  networkRoute: NetworkRouteNode,
  apiRequest: ApiRequestNode,
  newTab: NewTabNode,
  dialogHandler: DialogHandlerNode,
  fileUpload: FileUploadNode,
  storageState: StorageStateNode,
  cookieAction: CookieActionNode,
  fileDownload: FileDownloadNode,
  group: GroupNode,
  tryCatch: TryCatchNode,
  parameterizedTest: ParameterizedTestNode,
  responseAssertion: ResponseAssertionNode,
  browserStorage: BrowserStorageNode,
  newContext: NewContextNode,
  utilityCall: UtilityCallNode,
  iteration: IterationNode,
  switch: SwitchNode,
  inlineData: InlineDataNode,
  harRoute: HarRouteNode,
  hookLabel: HookLabelNode,
};

/**
 * LOD-aware node types: each node component is wrapped with `withLod`
 * so it automatically switches between full/compact/minimal rendering
 * based on the current zoom level (provided via LodContext).
 */
export const nodeTypes = Object.fromEntries(
  Object.entries(fullNodeTypes).map(([key, Component]) => [
    key,
    withLod(Component as unknown as React.ComponentType<NodeProps>, key),
  ]),
) as unknown as typeof fullNodeTypes;
