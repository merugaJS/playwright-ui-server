import { useState, useMemo, useRef, useEffect } from 'react';
import { useFlowStore } from '../../stores/flowStore.js';
import type { ActionData } from '../../api/hooks.js';
import { usePageObjects, usePageObject } from '../../api/hooks.js';
import type { PageObjectSummary } from '../../api/hooks.js';

interface ActionTemplate {
  type: string;
  icon: string;
  label: string;
  category: string;
  defaultData: ActionData;
}

const actionTemplates: ActionTemplate[] = [
  {
    type: 'navigate',
    icon: '🌐',
    label: 'Navigate',
    category: 'Navigation',
    defaultData: { type: 'navigate', url: '/' },
  },
  {
    type: 'click',
    icon: '👆',
    label: 'Click',
    category: 'Interaction',
    defaultData: { type: 'click', locator: { kind: 'inline', strategy: 'getByRole', value: "'button'" } },
  },
  {
    type: 'fill',
    icon: '✏️',
    label: 'Fill',
    category: 'Interaction',
    defaultData: { type: 'fill', locator: { kind: 'inline', strategy: 'getByLabel', value: '' }, value: '' },
  },
  {
    type: 'hover',
    icon: '🖱️',
    label: 'Hover',
    category: 'Interaction',
    defaultData: { type: 'hover', locator: { kind: 'inline', strategy: 'locator', value: '' } },
  },
  {
    type: 'selectOption',
    icon: '📋',
    label: 'Select',
    category: 'Interaction',
    defaultData: { type: 'selectOption', locator: { kind: 'inline', strategy: 'locator', value: '' }, value: '' },
  },
  {
    type: 'assertText',
    icon: '✅',
    label: 'Assert Text',
    category: 'Assertion',
    defaultData: { type: 'assertText', locator: { kind: 'inline', strategy: 'getByText', value: '' }, expected: '', exact: true },
  },
  {
    type: 'assertVisible',
    icon: '👁️',
    label: 'Assert Visible',
    category: 'Assertion',
    defaultData: { type: 'assertVisible', locator: { kind: 'inline', strategy: 'locator', value: '' } },
  },
  {
    type: 'wait',
    icon: '⏱️',
    label: 'Wait',
    category: 'Utility',
    defaultData: { type: 'wait', duration: 1000 },
  },
  {
    type: 'screenshot',
    icon: '📸',
    label: 'Screenshot',
    category: 'Utility',
    defaultData: { type: 'screenshot' },
  },
  {
    type: 'codeBlock',
    icon: '💻',
    label: 'Code',
    category: 'Utility',
    defaultData: { type: 'codeBlock', code: '// your code here' },
  },
  {
    type: 'loop',
    icon: '\u{1f501}',
    label: 'For Loop',
    category: 'Control Flow',
    defaultData: { type: 'loop', loopKind: 'for', initializer: 'let i = 0', condition: 'i < 10', incrementer: 'i++', body: [] },
  },
  {
    type: 'loop',
    icon: '\u{1f501}',
    label: 'For...of Loop',
    category: 'Control Flow',
    defaultData: { type: 'loop', loopKind: 'for...of', variableName: 'item', iterable: 'items', body: [] },
  },
  {
    type: 'loop',
    icon: '\u{1f501}',
    label: 'For...in Loop',
    category: 'Control Flow',
    defaultData: { type: 'loop', loopKind: 'for...in', variableName: 'key', iterable: 'obj', body: [] },
  },
  {
    type: 'conditional',
    icon: '\u{2666}',
    label: 'If/Else Conditional',
    category: 'Control Flow',
    defaultData: { type: 'conditional', condition: 'true', thenChildren: [], elseIfBranches: [], elseChildren: [] },
  },
  {
    type: 'networkRoute',
    icon: '\u{1F310}',
    label: 'Network Route (Fulfill)',
    category: 'Network',
    defaultData: { type: 'networkRoute', urlPattern: '**/api/data', handlerAction: 'fulfill', fulfillOptions: { status: 200, json: '[]' } },
  },
  {
    type: 'networkRoute',
    icon: '\u{1F310}',
    label: 'Network Route (Abort)',
    category: 'Network',
    defaultData: { type: 'networkRoute', urlPattern: '**/api/data', handlerAction: 'abort' },
  },
  {
    type: 'networkRoute',
    icon: '\u{1F310}',
    label: 'Network Route (Continue)',
    category: 'Network',
    defaultData: { type: 'networkRoute', urlPattern: '**/api/data', handlerAction: 'continue' },
  },
  {
    type: 'apiRequest',
    icon: '\u{1F4E1}',
    label: 'API Request',
    category: 'Network',
    defaultData: { type: 'apiRequest', method: 'GET', url: '/api/endpoint' },
  },
];

const categoryColors: Record<string, string> = {
  Navigation: 'border-blue-500/50',
  Interaction: 'border-green-500/50',
  Assertion: 'border-amber-500/50',
  Utility: 'border-purple-500/50',
  'Control Flow': 'border-cyan-500/50',
  Network: 'border-teal-500/50',
  'Page Object': 'border-pink-500/50',
};

const categoryHeaderColors: Record<string, string> = {
  Navigation: 'text-blue-400/70',
  Interaction: 'text-green-400/70',
  Assertion: 'text-amber-400/70',
  Utility: 'text-purple-400/70',
  'Control Flow': 'text-cyan-400/70',
  Network: 'text-teal-400/70',
  'Page Objects': 'text-pink-400/70',
};

const builtInCategories = ['Navigation', 'Interaction', 'Assertion', 'Utility', 'Control Flow', 'Network'] as const;

export function ActionPalette() {
  const addNode = useFlowStore((s) => s.addNode);
  const [isOpen, setIsOpen] = useState(false);
  const { data: pageObjectsData } = usePageObjects();
  const pageObjects = pageObjectsData?.files ?? [];
  const [expandedPO, setExpandedPO] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    () => new Set(['Page Objects'])
  );
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus search input when palette opens
  useEffect(() => {
    if (isOpen) {
      // Small delay to ensure DOM is ready
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
    } else {
      setSearchQuery('');
      setCollapsedCategories(new Set(['Page Objects']));
    }
  }, [isOpen]);

  // Group by category
  const categories = useMemo(() => {
    const map = new Map<string, ActionTemplate[]>();
    for (const t of actionTemplates) {
      if (!map.has(t.category)) map.set(t.category, []);
      map.get(t.category)!.push(t);
    }
    return map;
  }, []);

  // Filter logic
  const query = searchQuery.toLowerCase().trim();
  const isSearching = query.length > 0;

  const filteredCategories = useMemo(() => {
    if (!isSearching) return categories;
    const filtered = new Map<string, ActionTemplate[]>();
    for (const [cat, templates] of categories) {
      const matching = templates.filter(
        (t) =>
          t.label.toLowerCase().includes(query) ||
          t.type.toLowerCase().includes(query) ||
          t.category.toLowerCase().includes(query)
      );
      if (matching.length > 0) {
        filtered.set(cat, matching);
      }
    }
    return filtered;
  }, [categories, query, isSearching]);

  const filteredPageObjects = useMemo(() => {
    if (!isSearching) return pageObjects;
    return pageObjects.filter(
      (po) =>
        po.name.toLowerCase().includes(query) ||
        'page object'.includes(query) ||
        'page objects'.includes(query)
    );
  }, [pageObjects, query, isSearching]);

  const totalFilteredCount =
    [...filteredCategories.values()].reduce((sum, arr) => sum + arr.length, 0) +
    filteredPageObjects.length;

  const toggleCategory = (category: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const isCategoryCollapsed = (category: string) => {
    // When searching, force all categories open
    if (isSearching) return false;
    return collapsedCategories.has(category);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="absolute top-3 left-3 z-10 bg-zinc-900/95 border border-zinc-700 rounded-lg shadow-xl px-3 py-2 text-zinc-300 text-xs hover:bg-zinc-800 transition-colors backdrop-blur-sm flex items-center gap-1.5"
      >
        <span className="text-sm">+</span> Add Action
      </button>
    );
  }

  return (
    <div className="absolute top-3 left-3 z-10 bg-zinc-900/95 border border-zinc-700 rounded-lg shadow-xl w-56 backdrop-blur-sm flex flex-col max-h-[70vh]">
      {/* Header */}
      <div className="px-3 py-2 border-b border-zinc-700 flex items-center justify-between shrink-0">
        <h3 className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">Actions</h3>
        <button
          onClick={() => setIsOpen(false)}
          className="text-zinc-500 hover:text-zinc-300 text-xs"
        >
          {'\u2715'}
        </button>
      </div>

      {/* Search bar */}
      <div className="px-2 py-1.5 border-b border-zinc-700/50 shrink-0">
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search actions..."
          className="w-full bg-zinc-800/80 border border-zinc-700/50 rounded px-2 py-1 text-xs text-zinc-300 placeholder-zinc-600 outline-none focus:border-zinc-500 transition-colors"
        />
      </div>

      {/* Scrollable content */}
      <div className="p-1 overflow-y-auto min-h-0">
        {/* Empty state when searching */}
        {isSearching && totalFilteredCount === 0 && (
          <div className="px-3 py-6 text-center">
            <p className="text-zinc-500 text-xs">No actions matching</p>
            <p className="text-zinc-400 text-xs font-medium mt-0.5">"{searchQuery}"</p>
          </div>
        )}

        {/* Built-in categories */}
        {builtInCategories.map((category) => {
          const templates = filteredCategories.get(category);
          if (!templates || templates.length === 0) return null;
          const allTemplatesCount = categories.get(category)?.length ?? 0;
          const collapsed = isCategoryCollapsed(category);

          return (
            <div key={category} className="mb-0.5">
              <button
                onClick={() => toggleCategory(category)}
                className={`w-full text-left px-2 py-1 text-[10px] uppercase tracking-wider flex items-center gap-1 hover:bg-zinc-800/50 rounded transition-colors ${categoryHeaderColors[category] ?? 'text-zinc-600'}`}
              >
                <span className="text-[8px]">{collapsed ? '\u25B6' : '\u25BC'}</span>
                <span>{category}</span>
                <span className="ml-auto bg-zinc-800 text-zinc-500 rounded-full px-1.5 text-[9px] font-medium">
                  {allTemplatesCount}
                </span>
              </button>
              {!collapsed &&
                templates.map((t) => (
                  <button
                    key={t.type}
                    onClick={() => {
                      addNode(t.type, { ...t.defaultData });
                      setIsOpen(false);
                    }}
                    className={`w-full text-left px-2 py-1 rounded text-xs flex items-center gap-1.5 hover:bg-zinc-800 text-zinc-300 transition-colors border-l-2 ${categoryColors[t.category] ?? 'border-zinc-500/50'}`}
                  >
                    <span className="text-xs">{t.icon}</span>
                    <span>{t.label}</span>
                  </button>
                ))}
            </div>
          );
        })}

        {/* Page Objects section */}
        {filteredPageObjects.length > 0 && (
          <div className="mb-0.5">
            <button
              onClick={() => toggleCategory('Page Objects')}
              className={`w-full text-left px-2 py-1 text-[10px] uppercase tracking-wider flex items-center gap-1 hover:bg-zinc-800/50 rounded transition-colors ${categoryHeaderColors['Page Objects']}`}
            >
              <span className="text-[8px]">
                {isCategoryCollapsed('Page Objects') ? '\u25B6' : '\u25BC'}
              </span>
              <span>Page Objects</span>
              <span className="ml-auto bg-zinc-800 text-zinc-500 rounded-full px-1.5 text-[9px] font-medium">
                {pageObjects.length}
              </span>
            </button>
            {!isCategoryCollapsed('Page Objects') &&
              filteredPageObjects.map((po) => (
                <PageObjectPaletteItem
                  key={po.id}
                  po={po}
                  isExpanded={expandedPO === po.id}
                  onToggle={() => setExpandedPO(expandedPO === po.id ? null : po.id)}
                  searchQuery={query}
                  onAddMethod={(methodName, paramCount) => {
                    addNode('pageObjectRef', {
                      type: 'pageObjectRef',
                      pageObjectId: po.id,
                      method: methodName,
                      args: new Array(paramCount).fill(''),
                      description: `${po.name}.${methodName}()`,
                    });
                    setIsOpen(false);
                  }}
                />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PageObjectPaletteItem({
  po,
  isExpanded,
  onToggle,
  onAddMethod,
  searchQuery,
}: {
  po: PageObjectSummary;
  isExpanded: boolean;
  onToggle: () => void;
  onAddMethod: (methodName: string, paramCount: number) => void;
  searchQuery: string;
}) {
  const { data: fullPO } = usePageObject(isExpanded ? po.id : null);

  const filteredMethods = useMemo(() => {
    if (!fullPO) return [];
    if (!searchQuery) return fullPO.methods;
    return fullPO.methods.filter(
      (m) =>
        m.name.toLowerCase().includes(searchQuery) ||
        m.parameters.some((p) => p.name.toLowerCase().includes(searchQuery))
    );
  }, [fullPO, searchQuery]);

  return (
    <div>
      <button
        onClick={onToggle}
        className={`w-full text-left px-2 py-1 rounded text-xs flex items-center gap-1.5 hover:bg-zinc-800 text-zinc-300 transition-colors border-l-2 ${categoryColors['Page Object']}`}
      >
        <span className="text-[10px] text-zinc-500">{isExpanded ? '\u25BC' : '\u25B6'}</span>
        <span className="truncate">{po.name}</span>
        <span className="text-zinc-600 text-[10px] ml-auto shrink-0">{po.methodCount}m</span>
      </button>

      {isExpanded && fullPO && (
        <div className="ml-3">
          {filteredMethods.length === 0 && (
            <p className="text-zinc-600 text-[10px] px-2 py-0.5">
              {searchQuery ? 'No matching methods' : 'No methods'}
            </p>
          )}
          {filteredMethods.map((m) => (
            <button
              key={m.name}
              onClick={() => onAddMethod(m.name, m.parameters.length)}
              className="w-full text-left px-2 py-1 rounded text-xs flex items-center gap-1 hover:bg-zinc-800 text-zinc-300 transition-colors"
              title={`${m.name}(${m.parameters.map((p) => `${p.name}: ${p.type}`).join(', ')})`}
            >
              <span className="text-blue-400 font-mono truncate">{m.name}</span>
              <span className="text-zinc-600 text-[10px] truncate">
                ({m.parameters.map((p) => p.name).join(', ')})
              </span>
            </button>
          ))}
        </div>
      )}

      {isExpanded && !fullPO && (
        <p className="text-zinc-600 text-[10px] px-4 py-0.5">Loading...</p>
      )}
    </div>
  );
}
