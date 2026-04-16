import { useState, useMemo } from 'react';
import { useTestFiles, useConfig, usePageObjects, usePageObject, useFixtures } from '../../api/hooks.js';
import { useProjectStore } from '../../stores/projectStore.js';
import { createPageObject, deleteTestFile } from '../../api/mutations.js';
import { useQueryClient } from '@tanstack/react-query';
import type { PageObjectSummary } from '../../api/hooks.js';
import { FixturesPanel } from '../fixtures/FixturesPanel.js';
import { showToast } from '../ui/Toast.js';
import { FileTree } from '../sidebar/FileTree.js';

function SectionHeader({
  label,
  count,
  filteredCount,
  collapsed,
  onToggle,
  actions,
}: {
  label: string;
  count?: number;
  filteredCount?: number;
  collapsed: boolean;
  onToggle: () => void;
  actions?: React.ReactNode;
}) {
  const badgeText = count !== undefined && count > 0
    ? (filteredCount !== undefined && filteredCount !== count
      ? `${filteredCount} of ${count}`
      : `${count}`)
    : null;

  return (
    <h2 className="text-zinc-300 text-xs font-semibold uppercase tracking-wider flex items-center justify-between">
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 hover:text-zinc-100 transition-colors py-1"
      >
        <span className="text-[10px] text-zinc-500 w-3 inline-block">
          {collapsed ? '\u25B6' : '\u25BC'}
        </span>
        <span>{label}</span>
      </button>
      <div className="flex items-center gap-1">
        {badgeText && (
          <span className="bg-zinc-700 text-zinc-300 px-1.5 py-0.5 rounded text-xs font-normal">
            {badgeText}
          </span>
        )}
        {actions}
      </div>
    </h2>
  );
}

export function Sidebar() {
  const { data: config } = useConfig();
  const { data: tests, isLoading: testsLoading, error: testsError } = useTestFiles();
  const { data: pageObjects, isLoading: poLoading } = usePageObjects();
  const { data: fixturesData } = useFixtures();
  const { selectedTestId, selectTest, setSelectedFile, selectedPageObjectId, selectPageObject, openConfig } = useProjectStore();
  const queryClient = useQueryClient();
  const [showNewTestForm, setShowNewTestForm] = useState(false);
  const [newTestFileName, setNewTestFileName] = useState('');
  const [creatingTest, setCreatingTest] = useState(false);

  // Collapsible section state: Tests expanded, Fixtures collapsed, Page Objects expanded
  const [testsCollapsed, setTestsCollapsed] = useState(false);
  const [fixturesCollapsed, setFixturesCollapsed] = useState(true);
  const [pageObjectsCollapsed, setPageObjectsCollapsed] = useState(false);

  // Search/filter for tests
  const [testFilter, setTestFilter] = useState('');

  const filteredFiles = useMemo(() => {
    if (!tests || !testFilter.trim()) return tests?.files ?? [];
    const q = testFilter.toLowerCase();
    return tests.files.filter(
      (f) => f.fileName.toLowerCase().includes(q) || f.directory.toLowerCase().includes(q)
    );
  }, [tests, testFilter]);

  const handleCreateTest = async () => {
    if (!newTestFileName.trim()) return;
    setCreatingTest(true);
    try {
      const res = await fetch('/api/tests/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: newTestFileName.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ['testFiles'] });
      setNewTestFileName('');
      setShowNewTestForm(false);
      showToast(`Created ${data.file.fileName}`, 'success');
      // Select the new file
      selectTest(data.file.id);
      setSelectedFile(data.file);
    } catch (err: any) {
      showToast(`Failed to create test: ${err.message}`, 'error');
    } finally {
      setCreatingTest(false);
    }
  };

  return (
    <aside className="w-64 bg-zinc-900 border-r border-zinc-700 flex flex-col shrink-0 overflow-hidden">
      {/* Project info */}
      <div className="p-4 border-b border-zinc-700">
        <h2 className="text-zinc-300 text-xs font-semibold uppercase tracking-wider mb-1">
          Project
        </h2>
        <p className="text-zinc-400 text-sm truncate">
          {config?.rootDir.split('/').pop() ?? '...'}
        </p>
        {config?.config.baseURL && (
          <p className="text-zinc-500 text-xs mt-1 truncate">
            {config.config.baseURL}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Test files section */}
        <div className="p-4 border-b border-zinc-800">
          <SectionHeader
            label="Tests"
            count={tests?.total}
            filteredCount={testFilter.trim() ? filteredFiles.length : undefined}
            collapsed={testsCollapsed}
            onToggle={() => setTestsCollapsed(!testsCollapsed)}
            actions={
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowNewTestForm(!showNewTestForm);
                  // Expand if collapsed when creating
                  if (testsCollapsed) setTestsCollapsed(false);
                }}
                className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors ml-1"
                title="New test file"
              >
                +
              </button>
            }
          />

          {!testsCollapsed && (
            <div className="mt-3">
              {/* New test form */}
              {showNewTestForm && (
                <div className="mb-3 bg-zinc-800 rounded p-2">
                  <input
                    type="text"
                    value={newTestFileName}
                    onChange={(e) => setNewTestFileName(e.target.value)}
                    placeholder="my-feature.spec.ts"
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-300 text-xs font-mono focus:outline-none focus:border-blue-500 mb-2"
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateTest()}
                    autoFocus
                  />
                  <div className="flex gap-1">
                    <button
                      onClick={handleCreateTest}
                      disabled={creatingTest || !newTestFileName.trim()}
                      className="px-2 py-1 text-[10px] bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors disabled:opacity-50"
                    >
                      {creatingTest ? '...' : 'Create'}
                    </button>
                    <button
                      onClick={() => { setShowNewTestForm(false); setNewTestFileName(''); }}
                      className="px-2 py-1 text-[10px] text-zinc-400 hover:text-zinc-300 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {testsLoading && (
                <p className="text-zinc-500 text-sm">Scanning...</p>
              )}

              {testsError && (
                <p className="text-red-400 text-sm">
                  Failed to load tests
                </p>
              )}

              {tests && tests.files.length === 0 && (
                <div className="text-zinc-500 text-sm">
                  <p>No test files found.</p>
                  <p className="mt-2 text-xs">
                    Looking in: <code className="text-zinc-400">{tests.testDir}</code>
                  </p>
                </div>
              )}

              {/* Search filter - shown when >5 files */}
              {tests && tests.files.length > 5 && (
                <div className="mb-2">
                  <input
                    type="text"
                    value={testFilter}
                    onChange={(e) => setTestFilter(e.target.value)}
                    placeholder="Filter tests..."
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-300 text-xs focus:outline-none focus:border-blue-500"
                  />
                  {testFilter && (
                    <p className="text-zinc-500 text-[10px] mt-1">
                      {filteredFiles.length} of {tests.files.length} files
                    </p>
                  )}
                </div>
              )}

              {tests && filteredFiles.length > 0 && (
                <FileTree
                  files={filteredFiles}
                  selectedId={selectedTestId}
                  onSelect={(file) => {
                    selectTest(file.id);
                    setSelectedFile(file);
                  }}
                  onDelete={async (file) => {
                    if (!confirm(`Delete file '${file.fileName}'? This cannot be undone.`)) return;
                    try {
                      await deleteTestFile(file.id);
                      if (selectedTestId === file.id) {
                        selectTest(null);
                        setSelectedFile(null);
                      }
                      queryClient.invalidateQueries({ queryKey: ['testFiles'] });
                      showToast(`Deleted ${file.fileName}`, 'success');
                    } catch (err: any) {
                      showToast(`Delete failed: ${err.message}`, 'error');
                    }
                  }}
                />
              )}

              {tests && tests.files.length > 0 && filteredFiles.length === 0 && testFilter && (
                <p className="text-zinc-500 text-xs">No tests matching "{testFilter}"</p>
              )}
            </div>
          )}
        </div>

        {/* Fixtures section */}
        <div className="p-4 border-b border-zinc-800">
          <SectionHeader
            label="Fixtures"
            count={fixturesData?.total}
            collapsed={fixturesCollapsed}
            onToggle={() => setFixturesCollapsed(!fixturesCollapsed)}
          />
          <FixturesPanel collapsed={fixturesCollapsed} />
        </div>

        {/* Page Objects section */}
        <div className="p-4">
          <PageObjectSection
            pageObjects={pageObjects?.files ?? []}
            isLoading={poLoading}
            selectedId={selectedPageObjectId}
            onSelect={(po) => selectPageObject(po.id)}
            collapsed={pageObjectsCollapsed}
            onToggle={() => setPageObjectsCollapsed(!pageObjectsCollapsed)}
          />
        </div>
      </div>

      {/* Config button at bottom */}
      <div className="p-3 border-t border-zinc-700">
        <button
          onClick={() => openConfig()}
          className="w-full px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors flex items-center gap-2"
        >
          <span>&#9881;</span>
          <span>Config</span>
        </button>
      </div>
    </aside>
  );
}


function PageObjectSection({
  pageObjects,
  isLoading,
  selectedId,
  onSelect,
  collapsed,
  onToggle,
}: {
  pageObjects: PageObjectSummary[];
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (po: PageObjectSummary) => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const queryClient = useQueryClient();
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createPageObject(newName.trim());
      queryClient.invalidateQueries({ queryKey: ['pageObjects'] });
      setNewName('');
      setShowNewForm(false);
    } catch (err) {
      console.error('Failed to create page object:', err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <SectionHeader
        label="Page Objects"
        count={pageObjects.length}
        collapsed={collapsed}
        onToggle={onToggle}
        actions={
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowNewForm(!showNewForm);
              // Expand if collapsed when creating
              if (collapsed) onToggle();
            }}
            className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors ml-1"
            title="New page object"
          >
            +
          </button>
        }
      />

      {!collapsed && (
        <div className="mt-3">
          {/* New page object form */}
          {showNewForm && (
            <div className="mb-3 bg-zinc-800 rounded p-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="LoginPage"
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-300 text-xs font-mono focus:outline-none focus:border-blue-500 mb-2"
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                autoFocus
              />
              <div className="flex gap-1">
                <button
                  onClick={handleCreate}
                  disabled={creating || !newName.trim()}
                  className="px-2 py-1 text-[10px] bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors disabled:opacity-50"
                >
                  {creating ? '...' : 'Create'}
                </button>
                <button
                  onClick={() => { setShowNewForm(false); setNewName(''); }}
                  className="px-2 py-1 text-[10px] text-zinc-400 hover:text-zinc-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {isLoading && <p className="text-zinc-500 text-sm">Scanning...</p>}

          {pageObjects.length === 0 && !isLoading && (
            <p className="text-zinc-600 text-xs">
              No page objects found. Create one or add <code className="text-zinc-500">pages/</code> directory.
            </p>
          )}

          <div className="space-y-0.5">
            {pageObjects.map((po) => (
              <PageObjectItem
                key={po.id}
                po={po}
                isSelected={selectedId === po.id}
                onSelect={() => onSelect(po)}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function PageObjectItem({
  po,
  isSelected,
  onSelect,
}: {
  po: PageObjectSummary;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { data: fullPO } = usePageObject(expanded ? po.id : null);
  const navigateToPageObjectItem = useProjectStore((s) => s.navigateToPageObjectItem);

  return (
    <div>
      <button
        onClick={() => {
          onSelect();
          setExpanded(!expanded);
        }}
        className={`w-full text-left px-3 py-1.5 text-sm rounded transition-colors flex items-center gap-2 ${
          isSelected
            ? 'bg-purple-600/20 text-purple-400'
            : 'text-zinc-300 hover:bg-zinc-800'
        }`}
      >
        <span className="text-[10px] text-zinc-500">{expanded ? '\u25BC' : '\u25B6'}</span>
        <div className="min-w-0 flex-1">
          <span className="block truncate">{po.name}</span>
          <span className="text-zinc-500 text-[10px]">
            {po.locatorCount} locator{po.locatorCount !== 1 ? 's' : ''} {'\u00B7'} {po.methodCount} method{po.methodCount !== 1 ? 's' : ''}
          </span>
        </div>
      </button>

      {expanded && fullPO && (
        <div className="ml-5 mt-0.5 mb-1 border-l border-zinc-700 pl-2">
          {/* Locators */}
          {fullPO.locators.length > 0 && (
            <div className="mb-1">
              <p className="text-zinc-500 text-[10px] uppercase tracking-wider py-0.5">Locators</p>
              {fullPO.locators.map((loc) => (
                <button
                  key={loc.name}
                  onClick={(e) => {
                    e.stopPropagation();
                    navigateToPageObjectItem(po.id, { type: 'locator', name: loc.name });
                  }}
                  className="w-full text-left text-xs py-0.5 pl-1 truncate cursor-pointer hover:bg-zinc-800/60 rounded transition-colors group"
                  title={`Go to locator: ${loc.name}`}
                >
                  <span className="text-purple-400 font-mono underline decoration-purple-400/30 group-hover:decoration-purple-400">{loc.name}</span>
                  <span className="text-zinc-600 ml-1">{loc.strategy}({loc.value})</span>
                </button>
              ))}
            </div>
          )}

          {/* Methods */}
          {fullPO.methods.length > 0 && (
            <div>
              <p className="text-zinc-500 text-[10px] uppercase tracking-wider py-0.5">Methods</p>
              {fullPO.methods.map((m) => (
                <button
                  key={m.name}
                  onClick={(e) => {
                    e.stopPropagation();
                    navigateToPageObjectItem(po.id, { type: 'method', name: m.name });
                  }}
                  className="w-full text-left text-xs py-0.5 pl-1 truncate cursor-pointer hover:bg-zinc-800/60 rounded transition-colors group"
                  title={`Go to method: ${m.name}`}
                >
                  <span className="text-blue-400 font-mono underline decoration-blue-400/30 group-hover:decoration-blue-400">{m.name}</span>
                  <span className="text-zinc-600">(</span>
                  {m.parameters.map((p, i) => (
                    <span key={p.name}>
                      {i > 0 && <span className="text-zinc-600">, </span>}
                      <span className="text-zinc-400">{p.name}</span>
                      <span className="text-zinc-600">: </span>
                      <span className="text-amber-400/70">{p.type}</span>
                    </span>
                  ))}
                  <span className="text-zinc-600">)</span>
                </button>
              ))}
            </div>
          )}

          {fullPO.locators.length === 0 && fullPO.methods.length === 0 && (
            <p className="text-zinc-600 text-[10px] py-0.5 pl-1">Empty page object</p>
          )}
        </div>
      )}

      {expanded && !fullPO && (
        <div className="ml-5 mt-0.5 mb-1 pl-2">
          <p className="text-zinc-600 text-[10px]">Loading...</p>
        </div>
      )}
    </div>
  );
}
