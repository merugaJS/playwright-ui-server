import type { ActionData, ActionNode, LocatorRef, LocatorStep, PageObjectSummary, PageObjectMethod } from '../../api/hooks.js';
import { useFlowStore } from '../../stores/flowStore.js';
import { usePageObjects, usePageObject } from '../../api/hooks.js';
import { useState, useEffect } from 'react';

interface PropertiesPanelProps {
  node: ActionNode | null;
}

const typeLabels: Record<string, string> = {
  navigate: 'Navigate',
  click: 'Click',
  fill: 'Fill',
  hover: 'Hover',
  selectOption: 'Select Option',
  assertText: 'Assert Text',
  assertVisible: 'Assert Visible',
  wait: 'Wait',
  screenshot: 'Screenshot',
  codeBlock: 'Code Block',
  pageObjectRef: 'Page Object',
  loop: 'Loop',
  conditional: 'Conditional',
  networkRoute: 'Network Route',
  apiRequest: 'API Request',
};

const strategyOptions = [
  'getByRole', 'getByText', 'getByLabel', 'getByPlaceholder', 'getByTestId', 'locator',
];

function EditField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="mb-3">
      <label className="text-zinc-500 text-xs uppercase tracking-wider block mb-1">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-zinc-300 text-sm font-mono focus:outline-none focus:border-blue-500 transition-colors"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="mb-3">
      <label className="text-zinc-500 text-xs uppercase tracking-wider block mb-1">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-zinc-300 text-sm focus:outline-none focus:border-blue-500 transition-colors"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </div>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  rows,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <div className="mb-3">
      <label className="text-zinc-500 text-xs uppercase tracking-wider block mb-1">
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows ?? 4}
        className="w-full bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-zinc-300 text-xs font-mono focus:outline-none focus:border-blue-500 transition-colors resize-y"
      />
    </div>
  );
}

function LocatorStepEditor({
  step,
  index,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  canRemove,
  canMoveUp,
  canMoveDown,
}: {
  step: { strategy: string; value: string };
  index: number;
  onChange: (s: { strategy: string; value: string }) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canRemove: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  return (
    <div className="mb-2 p-2 bg-zinc-800/60 rounded border border-zinc-700/30">
      <div className="flex items-center justify-between mb-1">
        <span className="text-blue-400 text-[10px] font-semibold uppercase">Step {index + 1}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={onMoveUp}
            disabled={!canMoveUp}
            className="text-zinc-400 hover:text-zinc-200 disabled:text-zinc-700 disabled:cursor-not-allowed text-[10px] px-0.5"
            title="Move up"
          >
            ▲
          </button>
          <button
            onClick={onMoveDown}
            disabled={!canMoveDown}
            className="text-zinc-400 hover:text-zinc-200 disabled:text-zinc-700 disabled:cursor-not-allowed text-[10px] px-0.5"
            title="Move down"
          >
            ▼
          </button>
          {canRemove && (
            <button onClick={onRemove} className="text-red-400/70 hover:text-red-400 text-[10px]">
              Remove
            </button>
          )}
        </div>
      </div>
      <select
        value={step.strategy}
        onChange={(e) => onChange({ ...step, strategy: e.target.value })}
        className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-300 text-xs mb-1 focus:outline-none focus:border-blue-500 transition-colors"
      >
        {strategyOptions.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
      <input
        type="text"
        value={step.value}
        onChange={(e) => onChange({ ...step, value: e.target.value })}
        placeholder="selector value"
        className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-300 text-xs font-mono focus:outline-none focus:border-blue-500 transition-colors"
      />
    </div>
  );
}

function LocatorEditor({
  locator,
  onChange,
}: {
  locator: LocatorRef;
  onChange: (l: LocatorRef) => void;
}) {
  const { data: pageObjectsData } = usePageObjects();
  const pageObjects = pageObjectsData?.files ?? [];

  const selectedPOId = locator.kind === 'pageObject' ? locator.pageObjectId : '';
  const { data: selectedPO } = usePageObject(selectedPOId || null);

  const locatorKindOptions = ['inline', 'pageObject'];

  // Get steps array — use chain if present, otherwise create from single step
  const steps: LocatorStep[] = locator.kind === 'inline'
    ? (locator.chain && locator.chain.length > 0
        ? locator.chain
        : [{ strategy: locator.strategy ?? 'locator', value: locator.value ?? '' }])
    : [];

  const updateSteps = (newSteps: { strategy: string; value: string }[]) => {
    if (newSteps.length <= 1) {
      // Single step — use flat format for backward compat
      const s = newSteps[0] ?? { strategy: 'locator', value: '' };
      onChange({ kind: 'inline', strategy: s.strategy, value: s.value });
    } else {
      // Multi-step — use chain format
      onChange({ kind: 'inline', strategy: newSteps[0].strategy, value: newSteps[0].value, chain: newSteps });
    }
  };

  return (
    <>
      {/* Kind selector — only show if there are page objects */}
      {pageObjects.length > 0 && (
        <SelectField
          label="Locator Source"
          value={locator.kind}
          options={locatorKindOptions}
          onChange={(v) => {
            if (v === 'inline') {
              onChange({ kind: 'inline', strategy: 'locator', value: '' });
            } else {
              onChange({ kind: 'pageObject', pageObjectId: '', locatorName: '' });
            }
          }}
        />
      )}

      {locator.kind === 'pageObject' ? (
        <>
          {/* Page Object selector */}
          <SelectField
            label="Page Object"
            value={locator.pageObjectId ?? ''}
            options={['', ...pageObjects.map((po) => po.id)]}
            onChange={(v) => onChange({ ...locator, kind: 'pageObject', pageObjectId: v, locatorName: '' })}
          />
          {locator.pageObjectId && (
            <p className="text-zinc-500 text-xs mb-2">
              {pageObjects.find((po) => po.id === locator.pageObjectId)?.name ?? ''}
            </p>
          )}
          {selectedPO && selectedPO.locators.length > 0 && (
            <SelectField
              label="Locator"
              value={locator.locatorName ?? ''}
              options={['', ...selectedPO.locators.map((l) => l.name)]}
              onChange={(v) => onChange({ ...locator, locatorName: v })}
            />
          )}
        </>
      ) : (
        <>
          <label className="text-zinc-500 text-xs uppercase tracking-wider block mb-1">
            Locator Steps
          </label>
          {steps.map((step, i) => (
            <LocatorStepEditor
              key={i}
              step={step}
              index={i}
              onChange={(s) => {
                const updated = [...steps];
                updated[i] = s;
                updateSteps(updated);
              }}
              onRemove={() => {
                const updated = steps.filter((_: { strategy: string; value: string }, idx: number) => idx !== i);
                updateSteps(updated);
              }}
              onMoveUp={() => {
                if (i === 0) return;
                const updated = [...steps];
                [updated[i - 1], updated[i]] = [updated[i], updated[i - 1]];
                updateSteps(updated);
              }}
              onMoveDown={() => {
                if (i >= steps.length - 1) return;
                const updated = [...steps];
                [updated[i], updated[i + 1]] = [updated[i + 1], updated[i]];
                updateSteps(updated);
              }}
              canRemove={steps.length > 1}
              canMoveUp={i > 0}
              canMoveDown={i < steps.length - 1}
            />
          ))}
          <button
            onClick={() => updateSteps([...steps, { strategy: 'locator', value: '' }])}
            className="w-full px-2 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-400 text-xs rounded transition-colors mb-3"
          >
            + Add Chain Step
          </button>
        </>
      )}
    </>
  );
}

export function PropertiesPanel({ node }: PropertiesPanelProps) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData);
  const deleteNode = useFlowStore((s) => s.deleteNode);

  if (!node) {
    return (
      <aside className="w-64 bg-zinc-900 border-l border-zinc-700 p-4 shrink-0">
        <p className="text-zinc-500 text-sm text-center mt-8">
          Select a node to view its properties
        </p>
      </aside>
    );
  }

  const { data } = node;

  const update = (partial: Partial<ActionData>) => {
    updateNodeData(node.id, { ...data, ...partial } as ActionData);
  };

  const updateLocator = (locator: LocatorRef) => {
    update({ locator } as Partial<ActionData>);
  };

  return (
    <aside className="w-64 bg-zinc-900 border-l border-zinc-700 shrink-0 overflow-y-auto flex flex-col">
      <div className="p-4 border-b border-zinc-700">
        <h3 className="text-zinc-300 text-xs font-semibold uppercase tracking-wider mb-1">
          Properties
        </h3>
        <p className="text-zinc-200 text-sm font-medium">
          {typeLabels[node.type] ?? node.type}
        </p>
        <p className="text-zinc-500 text-xs mt-0.5">ID: {node.id}</p>
      </div>

      <div className="p-4 flex-1">
        {/* Navigate */}
        {data.type === 'navigate' && (
          <EditField label="URL" value={data.url ?? ''} onChange={(v) => update({ url: v })} placeholder="/path" />
        )}

        {/* Locator-based actions */}
        {data.locator && (
          <LocatorEditor locator={data.locator} onChange={updateLocator} />
        )}

        {/* Fill / SelectOption value */}
        {(data.type === 'fill' || data.type === 'selectOption') && (
          <EditField label="Value" value={data.value ?? ''} onChange={(v) => update({ value: v })} placeholder="Text to fill" />
        )}

        {/* Assert text */}
        {data.type === 'assertText' && (
          <>
            <EditField label="Expected Text" value={data.expected ?? ''} onChange={(v) => update({ expected: v })} />
            <div className="mb-3">
              <label className="flex items-center gap-2 text-zinc-400 text-xs">
                <input
                  type="checkbox"
                  checked={data.exact ?? false}
                  onChange={(e) => update({ exact: e.target.checked })}
                  className="rounded bg-zinc-800 border-zinc-600"
                />
                Exact match
              </label>
            </div>
          </>
        )}

        {/* Wait */}
        {data.type === 'wait' && (
          <EditField
            label="Duration (ms)"
            value={String(data.duration ?? 1000)}
            onChange={(v) => update({ duration: parseInt(v, 10) || 0 })}
          />
        )}

        {/* Screenshot */}
        {data.type === 'screenshot' && (
          <>
            <EditField label="Name" value={data.name ?? ''} onChange={(v) => update({ name: v })} placeholder="screenshot.png" />
            <div className="mb-3">
              <label className="flex items-center gap-2 text-zinc-400 text-xs">
                <input
                  type="checkbox"
                  checked={data.fullPage ?? false}
                  onChange={(e) => update({ fullPage: e.target.checked })}
                  className="rounded bg-zinc-800 border-zinc-600"
                />
                Full page
              </label>
            </div>
          </>
        )}

        {/* Code block */}
        {data.type === 'codeBlock' && (
          <TextAreaField label="Code" value={data.code ?? ''} onChange={(v) => update({ code: v })} rows={6} />
        )}

        {/* Loop */}
        {data.type === 'loop' && (
          <LoopEditor data={data} onChange={update} />
        )}

        {/* Conditional */}
        {data.type === 'conditional' && (
          <ConditionalEditor data={data} onChange={update} />
        )}

        {/* Network Route */}
        {data.type === 'networkRoute' && (
          <NetworkRouteEditor data={data} onChange={update} />
        )}

        {/* API Request */}
        {data.type === 'apiRequest' && (
          <ApiRequestEditor data={data} onChange={update} />
        )}

        {/* Page Object Ref */}
        {data.type === 'pageObjectRef' && (
          <PageObjectRefEditor data={data} onChange={update} />
        )}
      </div>

      {/* Delete button */}
      <div className="p-4 border-t border-zinc-700">
        <button
          onClick={() => deleteNode(node.id)}
          className="w-full px-3 py-2 bg-red-900/30 hover:bg-red-900/50 border border-red-800/50 text-red-400 text-xs rounded transition-colors"
        >
          Delete Node
        </button>
      </div>
    </aside>
  );
}

const loopKindOptions = ['for', 'for...of', 'for...in'];

function LoopEditor({
  data,
  onChange,
}: {
  data: ActionData;
  onChange: (partial: Partial<ActionData>) => void;
}) {
  const kind = data.loopKind ?? 'for';

  return (
    <>
      <SelectField
        label="Loop Kind"
        value={kind}
        options={loopKindOptions}
        onChange={(v) => {
          const partial: Partial<ActionData> = { loopKind: v as ActionData['loopKind'] };
          // Reset fields when switching kinds
          if (v === 'for') {
            partial.initializer = data.initializer ?? 'let i = 0';
            partial.condition = data.condition ?? 'i < 10';
            partial.incrementer = data.incrementer ?? 'i++';
            partial.variableName = undefined;
            partial.iterable = undefined;
          } else {
            partial.initializer = undefined;
            partial.condition = undefined;
            partial.incrementer = undefined;
            partial.variableName = data.variableName ?? 'item';
            partial.iterable = data.iterable ?? 'items';
          }
          onChange(partial);
        }}
      />

      {kind === 'for' && (
        <>
          <EditField
            label="Initializer"
            value={data.initializer ?? ''}
            onChange={(v) => onChange({ initializer: v })}
            placeholder="let i = 0"
          />
          <EditField
            label="Condition"
            value={data.condition ?? ''}
            onChange={(v) => onChange({ condition: v })}
            placeholder="i < 10"
          />
          <EditField
            label="Incrementer"
            value={data.incrementer ?? ''}
            onChange={(v) => onChange({ incrementer: v })}
            placeholder="i++"
          />
        </>
      )}

      {(kind === 'for...of' || kind === 'for...in') && (
        <>
          <EditField
            label="Variable Name"
            value={data.variableName ?? ''}
            onChange={(v) => onChange({ variableName: v })}
            placeholder={kind === 'for...of' ? 'item' : 'key'}
          />
          <EditField
            label={kind === 'for...of' ? 'Iterable' : 'Object'}
            value={data.iterable ?? ''}
            onChange={(v) => onChange({ iterable: v })}
            placeholder={kind === 'for...of' ? 'items' : 'obj'}
          />
        </>
      )}

      {/* Body summary */}
      <div className="mb-3">
        <label className="text-zinc-500 text-xs uppercase tracking-wider block mb-1">
          Body
        </label>
        <p className="text-zinc-400 text-xs">
          {Array.isArray(data.body) && data.body.length > 0
            ? `${data.body.length} action${data.body.length !== 1 ? 's' : ''} inside`
            : 'Empty body'}
        </p>
      </div>
    </>
  );
}

function ConditionalEditor({
  data,
  onChange,
}: {
  data: ActionData;
  onChange: (partial: Partial<ActionData>) => void;
}) {
  const thenChildren = data.thenChildren ?? [];
  const elseIfBranches = data.elseIfBranches ?? [];
  const elseChildren = data.elseChildren ?? [];

  return (
    <>
      <EditField
        label="Condition"
        value={data.condition ?? ''}
        onChange={(v) => onChange({ condition: v })}
        placeholder="e.g., isLoggedIn"
      />

      {/* Then summary */}
      <div className="mb-3">
        <label className="text-zinc-500 text-xs uppercase tracking-wider block mb-1">
          Then Branch
        </label>
        <p className="text-zinc-400 text-xs">
          {thenChildren.length > 0
            ? `${thenChildren.length} action${thenChildren.length !== 1 ? 's' : ''} inside`
            : 'Empty'}
        </p>
      </div>

      {/* Else-if branches */}
      <div className="mb-3">
        <label className="text-zinc-500 text-xs uppercase tracking-wider block mb-1">
          Else-If Branches
        </label>
        {elseIfBranches.length === 0 && (
          <p className="text-zinc-600 text-xs italic mb-1">None</p>
        )}
        {elseIfBranches.map((branch, idx) => (
          <div key={idx} className="mb-2 p-2 bg-zinc-800/60 rounded border border-zinc-700/30">
            <div className="flex items-center justify-between mb-1">
              <span className="text-blue-400 text-[10px] font-semibold uppercase">Else If #{idx + 1}</span>
              <button
                onClick={() => {
                  const updated = [...elseIfBranches];
                  updated.splice(idx, 1);
                  onChange({ elseIfBranches: updated });
                }}
                className="text-red-400/70 hover:text-red-400 text-[10px]"
              >
                Remove
              </button>
            </div>
            <input
              type="text"
              value={branch.condition}
              onChange={(e) => {
                const updated = [...elseIfBranches];
                updated[idx] = { ...branch, condition: e.target.value };
                onChange({ elseIfBranches: updated });
              }}
              placeholder="condition"
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-300 text-xs font-mono focus:outline-none focus:border-blue-500 transition-colors"
            />
            <p className="text-zinc-500 text-[10px] mt-1">
              {branch.children.length > 0
                ? `${branch.children.length} action${branch.children.length !== 1 ? 's' : ''}`
                : 'Empty'}
            </p>
          </div>
        ))}
        <button
          onClick={() => {
            onChange({
              elseIfBranches: [...elseIfBranches, { condition: '', children: [] }],
            });
          }}
          className="w-full px-2 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-400 text-xs rounded transition-colors"
        >
          + Add Else-If
        </button>
      </div>

      {/* Else summary */}
      <div className="mb-3">
        <label className="text-zinc-500 text-xs uppercase tracking-wider block mb-1">
          Else Branch
        </label>
        <p className="text-zinc-400 text-xs">
          {elseChildren.length > 0
            ? `${elseChildren.length} action${elseChildren.length !== 1 ? 's' : ''} inside`
            : 'Empty (no else)'}
        </p>
      </div>
    </>
  );
}

const handlerActionOptions = ['fulfill', 'abort', 'continue'];

function NetworkRouteEditor({
  data,
  onChange,
}: {
  data: ActionData;
  onChange: (partial: Partial<ActionData>) => void;
}) {
  const handlerAction = data.handlerAction ?? 'fulfill';

  return (
    <>
      <EditField
        label="URL Pattern"
        value={data.urlPattern ?? ''}
        onChange={(v) => onChange({ urlPattern: v })}
        placeholder="**/api/data"
      />

      <SelectField
        label="Handler Action"
        value={handlerAction}
        options={handlerActionOptions}
        onChange={(v) => {
          const partial: Partial<ActionData> = { handlerAction: v as ActionData['handlerAction'] };
          // Reset handler-specific fields when switching
          if (v === 'fulfill') {
            partial.fulfillOptions = { status: 200 };
            partial.abortReason = undefined;
            partial.continueOverrides = undefined;
          } else if (v === 'abort') {
            partial.fulfillOptions = undefined;
            partial.continueOverrides = undefined;
          } else {
            partial.fulfillOptions = undefined;
            partial.abortReason = undefined;
          }
          onChange(partial);
        }}
      />

      {handlerAction === 'fulfill' && (
        <>
          <EditField
            label="Status Code"
            value={String(data.fulfillOptions?.status ?? 200)}
            onChange={(v) => onChange({ fulfillOptions: { ...data.fulfillOptions, status: parseInt(v, 10) || 200 } })}
            placeholder="200"
          />
          <EditField
            label="Content Type"
            value={data.fulfillOptions?.contentType ?? ''}
            onChange={(v) => onChange({ fulfillOptions: { ...data.fulfillOptions, contentType: v || undefined } })}
            placeholder="application/json"
          />
          <TextAreaField
            label="JSON Response"
            value={data.fulfillOptions?.json ?? ''}
            onChange={(v) => onChange({ fulfillOptions: { ...data.fulfillOptions, json: v || undefined } })}
            rows={4}
          />
          <TextAreaField
            label="Body (string)"
            value={data.fulfillOptions?.body ?? ''}
            onChange={(v) => onChange({ fulfillOptions: { ...data.fulfillOptions, body: v || undefined } })}
            rows={3}
          />
        </>
      )}

      {handlerAction === 'abort' && (
        <EditField
          label="Abort Reason"
          value={data.abortReason ?? ''}
          onChange={(v) => onChange({ abortReason: v || undefined })}
          placeholder="e.g., blockedbyclient"
        />
      )}

      {handlerAction === 'continue' && (
        <>
          <EditField
            label="Override URL"
            value={data.continueOverrides?.url ?? ''}
            onChange={(v) => onChange({ continueOverrides: { ...data.continueOverrides, url: v || undefined } })}
            placeholder="https://..."
          />
          <EditField
            label="Override Method"
            value={data.continueOverrides?.method ?? ''}
            onChange={(v) => onChange({ continueOverrides: { ...data.continueOverrides, method: v || undefined } })}
            placeholder="GET, POST, etc."
          />
          <EditField
            label="Override Post Data"
            value={data.continueOverrides?.postData ?? ''}
            onChange={(v) => onChange({ continueOverrides: { ...data.continueOverrides, postData: v || undefined } })}
            placeholder="request body"
          />
        </>
      )}
    </>
  );
}

function PageObjectRefEditor({
  data,
  onChange,
}: {
  data: ActionData;
  onChange: (partial: Partial<ActionData>) => void;
}) {
  const { data: pageObjectsData } = usePageObjects();
  const pageObjects = pageObjectsData?.files ?? [];
  const { data: selectedPO } = usePageObject(data.pageObjectId || null);

  // When the selected page object or method changes, sync args array length
  const selectedMethod = selectedPO?.methods.find((m) => m.name === data.method) ?? null;

  return (
    <>
      {/* Page Object selector */}
      <div className="mb-3">
        <label className="text-zinc-500 text-xs uppercase tracking-wider block mb-1">
          Page Object
        </label>
        <select
          value={data.pageObjectId ?? ''}
          onChange={(e) => {
            onChange({ pageObjectId: e.target.value, method: '', args: [] });
          }}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-zinc-300 text-sm focus:outline-none focus:border-blue-500 transition-colors"
        >
          <option value="">-- Select --</option>
          {pageObjects.map((po) => (
            <option key={po.id} value={po.id}>{po.name}</option>
          ))}
        </select>
      </div>

      {/* Method selector */}
      {selectedPO && (
        <div className="mb-3">
          <label className="text-zinc-500 text-xs uppercase tracking-wider block mb-1">
            Method
          </label>
          <select
            value={data.method ?? ''}
            onChange={(e) => {
              const methodName = e.target.value;
              const method = selectedPO.methods.find((m) => m.name === methodName);
              const argCount = method?.parameters.length ?? 0;
              onChange({ method: methodName, args: new Array(argCount).fill('') });
            }}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-zinc-300 text-sm focus:outline-none focus:border-blue-500 transition-colors"
          >
            <option value="">-- Select method --</option>
            {selectedPO.methods.map((m) => (
              <option key={m.name} value={m.name}>
                {m.name}({m.parameters.map((p) => `${p.name}: ${p.type}`).join(', ')})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Method parameter inputs */}
      {selectedMethod && selectedMethod.parameters.length > 0 && (
        <div className="mb-3">
          <label className="text-zinc-500 text-xs uppercase tracking-wider block mb-1">
            Arguments
          </label>
          {selectedMethod.parameters.map((param, i) => (
            <div key={param.name} className="mb-2">
              <label className="text-zinc-500 text-[10px] block mb-0.5">
                {param.name}: <span className="text-amber-400/70">{param.type}</span>
              </label>
              <input
                type="text"
                value={data.args?.[i] ?? ''}
                onChange={(e) => {
                  const newArgs = [...(data.args ?? [])];
                  // Ensure array is long enough
                  while (newArgs.length <= i) newArgs.push('');
                  newArgs[i] = e.target.value;
                  onChange({ args: newArgs });
                }}
                placeholder={param.name}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-zinc-300 text-xs font-mono focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
          ))}
        </div>
      )}

      {/* Show description if set */}
      {data.description && (
        <div className="mb-3">
          <label className="text-zinc-500 text-xs uppercase tracking-wider block mb-1">
            Description
          </label>
          <p className="text-zinc-400 text-xs">{data.description}</p>
        </div>
      )}
    </>
  );
}

const httpMethodOptions = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

function ApiRequestEditor({
  data,
  onChange,
}: {
  data: ActionData;
  onChange: (partial: Partial<ActionData>) => void;
}) {
  const headersStr = data.headers
    ? Object.entries(data.headers).map(([k, v]) => `${k}: ${v}`).join('\n')
    : '';

  const paramsStr = data.params
    ? Object.entries(data.params).map(([k, v]) => `${k}: ${v}`).join('\n')
    : '';

  const parseKeyValuePairs = (text: string): Record<string, string> => {
    const result: Record<string, string> = {};
    for (const line of text.split('\n')) {
      const idx = line.indexOf(':');
      if (idx > 0) {
        const key = line.slice(0, idx).trim();
        const val = line.slice(idx + 1).trim();
        if (key) result[key] = val;
      }
    }
    return result;
  };

  return (
    <>
      <SelectField
        label="HTTP Method"
        value={data.method ?? 'GET'}
        options={httpMethodOptions}
        onChange={(v) => onChange({ method: v })}
      />

      <EditField
        label="URL"
        value={data.url ?? ''}
        onChange={(v) => onChange({ url: v })}
        placeholder="/api/endpoint"
      />

      <EditField
        label="Result Variable"
        value={data.resultVariable ?? ''}
        onChange={(v) => onChange({ resultVariable: v || undefined })}
        placeholder="response"
      />

      <TextAreaField
        label="Headers (key: value per line)"
        value={headersStr}
        onChange={(v) => {
          const headers = parseKeyValuePairs(v);
          onChange({ headers: Object.keys(headers).length > 0 ? headers : undefined });
        }}
        rows={3}
      />

      <TextAreaField
        label="Body (data)"
        value={typeof data.body === 'string' ? data.body : ''}
        onChange={(v) => onChange({ body: v || undefined } as Partial<ActionData>)}
        rows={4}
      />

      <TextAreaField
        label="Query Params (key: value per line)"
        value={paramsStr}
        onChange={(v) => {
          const params = parseKeyValuePairs(v);
          onChange({ params: Object.keys(params).length > 0 ? params : undefined });
        }}
        rows={3}
      />
    </>
  );
}
