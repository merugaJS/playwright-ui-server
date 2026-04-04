import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

/**
 * Category-to-color mapping, matching BaseNode.
 */
const categoryColors: Record<string, string> = {
  navigation: '#3b82f6',
  interaction: '#22c55e',
  assertion: '#f59e0b',
  utility: '#8b5cf6',
  code: '#6b7280',
};

/**
 * Map node types to their category for compact/minimal rendering.
 */
const typeToCategory: Record<string, string> = {
  navigate: 'navigation',
  click: 'interaction',
  fill: 'interaction',
  hover: 'interaction',
  selectOption: 'interaction',
  assertText: 'assertion',
  assertVisible: 'assertion',
  assertCount: 'assertion',
  assertURL: 'assertion',
  assertTitle: 'assertion',
  assertScreenshot: 'assertion',
  assertAttribute: 'assertion',
  assertValue: 'assertion',
  assertClass: 'assertion',
  assertEnabled: 'assertion',
  assertDisabled: 'assertion',
  assertChecked: 'assertion',
  assertHidden: 'assertion',
  wait: 'utility',
  screenshot: 'utility',
  codeBlock: 'code',
  pageObjectRef: 'code',
  loop: 'utility',
  conditional: 'utility',
  networkRoute: 'utility',
  apiRequest: 'navigation',
  newTab: 'navigation',
  dialogHandler: 'utility',
  fileUpload: 'interaction',
  storageState: 'utility',
  cookieAction: 'utility',
  fileDownload: 'interaction',
  group: 'utility',
  tryCatch: 'code',
  parameterizedTest: 'utility',
  responseAssertion: 'assertion',
  browserStorage: 'utility',
  newContext: 'navigation',
};

/**
 * Short labels for compact mode.
 */
const typeToLabel: Record<string, string> = {
  navigate: 'Navigate',
  click: 'Click',
  fill: 'Fill',
  hover: 'Hover',
  selectOption: 'Select',
  assertText: 'Assert Text',
  assertVisible: 'Assert Visible',
  assertCount: 'Assert Count',
  assertURL: 'Assert URL',
  assertTitle: 'Assert Title',
  assertScreenshot: 'Assert Screenshot',
  assertAttribute: 'Assert Attr',
  assertValue: 'Assert Value',
  assertClass: 'Assert Class',
  assertEnabled: 'Assert Enabled',
  assertDisabled: 'Assert Disabled',
  assertChecked: 'Assert Checked',
  assertHidden: 'Assert Hidden',
  wait: 'Wait',
  screenshot: 'Screenshot',
  codeBlock: 'Code',
  pageObjectRef: 'Page Object',
  loop: 'Loop',
  conditional: 'Conditional',
  networkRoute: 'Net Route',
  apiRequest: 'API Request',
  newTab: 'New Tab',
  dialogHandler: 'Dialog',
  fileUpload: 'Upload',
  storageState: 'Storage',
  cookieAction: 'Cookie',
  fileDownload: 'Download',
  group: 'Group',
  tryCatch: 'Try/Catch',
  parameterizedTest: 'Param Test',
  responseAssertion: 'Response Assert',
  browserStorage: 'Browser Storage',
  newContext: 'New Context',
};

interface CompactNodeProps {
  type: string;
  selected?: boolean;
}

/**
 * Compact node: renders a small colored rectangle with a short label.
 * Used at zoom levels between 25% and 50%.
 */
export const CompactNode = memo(function CompactNode({ type, selected }: CompactNodeProps) {
  const category = typeToCategory[type] ?? 'utility';
  const borderColor = categoryColors[category] ?? '#6b7280';
  const label = typeToLabel[type] ?? type;

  return (
    <>
      <Handle type="target" position={Position.Top} className="!w-1.5 !h-1.5 !bg-zinc-500" />
      <div
        className={`rounded px-2 py-1 text-[10px] font-semibold text-zinc-300 ${
          selected ? 'ring-1 ring-blue-500/50' : ''
        }`}
        style={{
          backgroundColor: '#27272a',
          borderLeft: `3px solid ${borderColor}`,
          minWidth: '80px',
          maxWidth: '120px',
        }}
      >
        {label}
      </div>
      <Handle type="source" position={Position.Bottom} className="!w-1.5 !h-1.5 !bg-zinc-500" />
    </>
  );
});

/**
 * Minimal node: renders a small colored pill/dot.
 * Used at zoom levels below 25%.
 */
export const MinimalNode = memo(function MinimalNode({ type, selected }: CompactNodeProps) {
  const category = typeToCategory[type] ?? 'utility';
  const bgColor = categoryColors[category] ?? '#6b7280';

  return (
    <>
      <Handle type="target" position={Position.Top} className="!w-1 !h-1 !bg-zinc-600" />
      <div
        className={`rounded-full ${selected ? 'ring-1 ring-blue-400' : ''}`}
        style={{
          backgroundColor: bgColor,
          width: '16px',
          height: '16px',
          opacity: 0.8,
        }}
      />
      <Handle type="source" position={Position.Bottom} className="!w-1 !h-1 !bg-zinc-600" />
    </>
  );
});

export { typeToCategory, categoryColors };
