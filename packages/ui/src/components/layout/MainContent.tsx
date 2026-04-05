import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useProjectStore } from '../../stores/projectStore.js';
import { useFlowStore } from '../../stores/flowStore.js';
import { useTestFlow, useConfig, useRunnerStatus, useFixtures } from '../../api/hooks.js';
import { saveTestFlow, runTests, stopTests, deleteTestFile } from '../../api/mutations.js';
import type { ActionNode } from '../../api/hooks.js';
import { useQueryClient } from '@tanstack/react-query';
import { FlowEditor } from '../editor/FlowEditor.js';
import { PropertiesPanel } from '../editor/PropertiesPanel.js';
import { PageObjectEditor } from '../page-objects/PageObjectEditor.js';
import { TestRunnerPanel } from '../runner/TestRunnerPanel.js';
import { CodePreviewPanel } from '../editor/CodePreviewPanel.js';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts.js';
import { showToast } from '../ui/Toast.js';
import { ConfigEditor } from '../config/ConfigEditor.js';

export function MainContent() {
  const { selectedTestId, selectedFile, viewMode, selectedPageObjectId, selectPageObject, selectTest, setSelectedFile } = useProjectStore();
  const { data: testFlow, isLoading, error, refetch } = useTestFlow(selectedTestId);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [runnerOpen, setRunnerOpen] = useState(false);
  const [codePreviewOpen, setCodePreviewOpen] = useState(false);
  const [runMenuTestIndex, setRunMenuTestIndex] = useState<number | null>(null);
  const runMenuRef = useRef<HTMLDivElement>(null);
  const { data: config } = useConfig();
  const { data: runnerStatus } = useRunnerStatus();
  const isTestRunning = runnerStatus?.running ?? false;

  const { data: fixturesData } = useFixtures();

  const loadTestFlow = useFlowStore((s) => s.loadTestFlow);
  const setActiveTestIndex = useFlowStore((s) => s.setActiveTestIndex);
  const setActiveView = useFlowStore((s) => s.setActiveView);
  const activeView = useFlowStore((s) => s.activeView);
  const activeTestIndex = useFlowStore((s) => s.activeTestIndex);
  const selectedNodeId = useFlowStore((s) => s.selectedNodeId);
  const isDirty = useFlowStore((s) => s.isDirty);
  const getTestFlowForSave = useFlowStore((s) => s.getTestFlowForSave);
  const markClean = useFlowStore((s) => s.markClean);
  const nodes = useFlowStore((s) => s.nodes);
  const deleteTestCase = useFlowStore((s) => s.deleteTestCase);
  const updateFixtures = useFlowStore((s) => s.updateFixtures);
  const selectedNodeIds = useFlowStore((s) => s.selectedNodeIds);
  const canUndo = useFlowStore((s) => s.canUndo);
  const canRedo = useFlowStore((s) => s.canRedo);
  const undo = useFlowStore((s) => s.undo);
  const redo = useFlowStore((s) => s.redo);
  const queryClient = useQueryClient();
  const [fixtureMenuOpen, setFixtureMenuOpen] = useState(false);
  const fixtureMenuRef = useRef<HTMLDivElement>(null);
  const [showNewTestInput, setShowNewTestInput] = useState(false);
  const [newTestName, setNewTestName] = useState('');
  const addTestCase = useFlowStore((s) => s.addTestCase);

  // Load test flow into the store when data arrives or is updated externally
  const [prevFlowHash, setPrevFlowHash] = useState<string | null>(null);
  useEffect(() => {
    if (testFlow) {
      const hash = testFlow.id + ':' + testFlow.metadata.contentHash;
      if (hash !== prevFlowHash && !isDirty) {
        setPrevFlowHash(hash);
        loadTestFlow(testFlow);
      }
    }
  }, [testFlow, prevFlowHash, isDirty, loadTestFlow]);

  // Find selected node
  const selectedNode: ActionNode | null = useMemo(() => {
    if (!selectedNodeId) return null;
    const n = nodes.find((n) => n.id === selectedNodeId);
    if (!n) return null;
    return {
      id: n.id,
      type: n.type!,
      position: n.position,
      data: n.data as any,
    };
  }, [nodes, selectedNodeId]);

  // Save handler
  const handleSave = useCallback(async () => {
    if (!selectedTestId) return;
    const flow = getTestFlowForSave();
    if (!flow) return;

    setSaving(true);
    setSaveError(null);
    try {
      await saveTestFlow(selectedTestId, flow);
      markClean();
      refetch();
      showToast('Test saved successfully', 'success');
    } catch (err: any) {
      setSaveError(err.message);
      showToast(`Save failed: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  }, [selectedTestId, getTestFlowForSave, markClean, refetch]);

  // Keyboard shortcuts
  const handleToggleCodePreview = useCallback(() => {
    setCodePreviewOpen((prev) => !prev);
  }, []);
  useKeyboardShortcuts({ onSave: handleSave, onToggleCodePreview: handleToggleCodePreview });

  // Run a specific test or the whole file
  const handleRunTest = useCallback(async (testName?: string, options?: { project?: string; headed?: boolean }) => {
    if (isTestRunning) {
      try { await stopTests(); } catch {}
      return;
    }
    setRunnerOpen(true);
    setRunMenuTestIndex(null);
    try {
      await runTests({
        testFile: selectedFile?.filePath,
        testName,
        project: options?.project,
        headed: options?.headed,
      });
    } catch (err: any) {
      showToast(`Run failed: ${err.message}`, 'error');
    }
  }, [selectedFile, isTestRunning]);

  // Delete a single test case
  const handleDeleteTestCase = useCallback((index: number, testName: string) => {
    if (!confirm(`Delete test '${testName}'? This will remove it from the file.`)) return;
    deleteTestCase(index);
    // Auto-save after deletion
    setTimeout(async () => {
      if (!selectedTestId) return;
      const flow = getTestFlowForSave();
      if (!flow) return;
      setSaving(true);
      try {
        await saveTestFlow(selectedTestId, flow);
        markClean();
        refetch();
        showToast(`Deleted test '${testName}'`, 'success');
      } catch (err: any) {
        showToast(`Save failed: ${err.message}`, 'error');
      } finally {
        setSaving(false);
      }
    }, 0);
  }, [deleteTestCase, selectedTestId, getTestFlowForSave, markClean, refetch]);

  // Delete the entire test file
  const handleDeleteFile = useCallback(async () => {
    if (!selectedTestId || !selectedFile) return;
    if (!confirm(`Delete file '${selectedFile.fileName}'? This cannot be undone.`)) return;
    try {
      await deleteTestFile(selectedTestId);
      selectTest(null);
      setSelectedFile(null);
      queryClient.invalidateQueries({ queryKey: ['testFiles'] });
      showToast(`Deleted ${selectedFile.fileName}`, 'success');
    } catch (err: any) {
      showToast(`Delete failed: ${err.message}`, 'error');
    }
  }, [selectedTestId, selectedFile, selectTest, setSelectedFile, queryClient]);

  // Close menus on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (runMenuRef.current && !runMenuRef.current.contains(e.target as Node)) {
        setRunMenuTestIndex(null);
      }
      if (fixtureMenuRef.current && !fixtureMenuRef.current.contains(e.target as Node)) {
        setFixtureMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const projects = config?.config.projects ?? [];

  // Available fixtures — combine built-in and custom from the API
  const availableFixtures = useMemo(() => {
    if (!fixturesData) return ['page', 'context', 'browser', 'request', 'browserName'];
    const all = [
      ...fixturesData.builtIn.map((f) => f.name),
      ...fixturesData.custom.map((f) => f.name),
    ];
    // Dedupe
    return [...new Set(all)];
  }, [fixturesData]);

  const storeTestFlow = useFlowStore((s) => s.testFlow);
  const currentFixtures = storeTestFlow?.fixtures ?? [];

  const handleToggleFixture = useCallback((name: string) => {
    const current = storeTestFlow?.fixtures ?? [];
    if (current.includes(name)) {
      updateFixtures(current.filter((f) => f !== name));
    } else {
      updateFixtures([...current, name]);
    }
  }, [storeTestFlow, updateFixtures]);

  // Config editor view mode
  if (viewMode === 'config') {
    return <ConfigEditor onClose={() => selectTest(null)} />;
  }

  // Page Object view mode
  if (viewMode === 'pageObject' && selectedPageObjectId) {
    return (
      <PageObjectEditor
        pageObjectId={selectedPageObjectId}
        onClose={() => selectPageObject(null)}
        onDeleted={() => selectPageObject(null)}
      />
    );
  }

  if (!selectedFile) {
    return (
      <div className="flex-1 flex flex-col bg-zinc-950">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-6xl mb-4">🎭</div>
            <h2 className="text-zinc-300 text-xl font-semibold mb-2">
              Welcome to Playwright UI Server
            </h2>
            <p className="text-zinc-500 text-sm max-w-md">
              Select a test file from the sidebar to view its visual flow,
              or create a new test to get started.
            </p>
          </div>
        </div>
        {/* Runner panel always available */}
        <TestRunnerPanel
          isOpen={runnerOpen}
          onToggle={() => setRunnerOpen(!runnerOpen)}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 flex flex-col bg-zinc-950">
        {/* Toolbar */}
        <div className="bg-zinc-900 border-b border-zinc-700 shrink-0">
          <div className="flex items-center px-4 h-10">
            <span className="text-zinc-400 text-sm">{selectedFile.filePath}</span>

            <div className="ml-auto flex items-center gap-2">
              {saveError && (
                <span className="text-red-400 text-xs">{saveError}</span>
              )}

              {/* Undo / Redo */}
              <button
                onClick={undo}
                disabled={!canUndo}
                className="px-1.5 py-1 text-xs rounded transition-colors text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed"
                title="Undo (Ctrl+Z)"
              >
                ↩
              </button>
              <button
                onClick={redo}
                disabled={!canRedo}
                className="px-1.5 py-1 text-xs rounded transition-colors text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed"
                title="Redo (Ctrl+Shift+Z)"
              >
                ↪
              </button>

              {/* Code Preview toggle */}
              <button
                onClick={() => setCodePreviewOpen(!codePreviewOpen)}
                className={`px-1.5 py-1 text-xs rounded transition-colors ${
                  codePreviewOpen
                    ? 'bg-blue-900/40 text-blue-400 border border-blue-800/50'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                }`}
                title="Toggle code preview (Ctrl+Shift+P)"
              >
                &lt;/&gt;
              </button>

              <span className="w-px h-4 bg-zinc-700" />

              {isDirty && (
                <span className="text-amber-500 text-xs">unsaved</span>
              )}
              <button
                onClick={handleSave}
                disabled={!isDirty || saving}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  isDirty
                    ? 'bg-blue-600 hover:bg-blue-500 text-white'
                    : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                }`}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              {testFlow && (
                <span className="text-zinc-500 text-xs">{testFlow.describe}</span>
              )}

              <span className="w-px h-4 bg-zinc-700" />

              <button
                onClick={handleDeleteFile}
                className="px-2 py-1 text-xs rounded transition-colors text-zinc-500 hover:text-red-400 hover:bg-red-900/20"
                title="Delete this test file"
              >
                Delete File
              </button>
            </div>
          </div>

          {/* Test case tabs with run buttons */}
          {storeTestFlow && storeTestFlow.tests.length > 0 && (
            <div className="flex items-center px-2 gap-1 pb-1">
              {storeTestFlow.tests.map((tc, i) => (
                <div key={tc.id} className="group/tab relative flex items-center">
                  <button
                    onClick={() => { setActiveView('test'); setActiveTestIndex(i); }}
                    title={tc.name}
                    className={`px-3 py-1.5 text-xs rounded-tl transition-colors truncate max-w-[180px] flex items-center gap-1 ${
                      i === activeTestIndex && activeView === 'test'
                        ? 'bg-zinc-800 text-zinc-200 border border-zinc-700 border-b-zinc-800 border-r-0'
                        : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
                    }`}
                  >
                    {tc.name}
                    {/* Delete test case button - appears on hover */}
                    <span
                      role="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteTestCase(i, tc.name);
                      }}
                      className="ml-1 opacity-0 group-hover/tab:opacity-100 text-zinc-500 hover:text-red-400 transition-opacity text-[10px] leading-none p-0.5 rounded hover:bg-red-900/30"
                      title={`Delete "${tc.name}"`}
                    >
                      ✕
                    </span>
                  </button>
                  {/* Run button for this test */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (projects.length > 0) {
                        setRunMenuTestIndex(runMenuTestIndex === i ? null : i);
                      } else {
                        handleRunTest(tc.name);
                      }
                    }}
                    disabled={isTestRunning}
                    title={isTestRunning ? 'Tests running...' : `Run "${tc.name}"`}
                    className={`px-1.5 py-1.5 text-[10px] rounded-tr transition-colors ${
                      i === activeTestIndex && activeView === 'test'
                        ? 'bg-zinc-800 border border-zinc-700 border-b-zinc-800 border-l-0'
                        : ''
                    } ${
                      isTestRunning
                        ? 'text-zinc-600 cursor-not-allowed'
                        : 'text-green-500 hover:text-green-400 hover:bg-green-900/30'
                    }`}
                  >
                    ▶
                  </button>
                  {/* Run options dropdown */}
                  {runMenuTestIndex === i && (
                    <div
                      ref={runMenuRef}
                      className="absolute top-full left-0 z-50 mt-0.5 bg-zinc-800 border border-zinc-700 rounded-md shadow-xl min-w-[180px]"
                    >
                      <button
                        onClick={() => handleRunTest(tc.name)}
                        className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors"
                      >
                        ▶ Run (all browsers)
                      </button>
                      <button
                        onClick={() => handleRunTest(tc.name, { headed: true })}
                        className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors"
                      >
                        ▶ Run headed
                      </button>
                      {projects.map((p) => (
                        <button
                          key={p.name}
                          onClick={() => handleRunTest(tc.name, { project: p.name })}
                          className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors"
                        >
                          ▶ Run on {p.name}
                        </button>
                      ))}
                      {projects.map((p) => (
                        <button
                          key={`${p.name}-headed`}
                          onClick={() => handleRunTest(tc.name, { project: p.name, headed: true })}
                          className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors"
                        >
                          ▶ Run on {p.name} (headed)
                        </button>
                      ))}
                      <div className="border-t border-zinc-700" />
                      <button
                        onClick={() => { setRunMenuTestIndex(null); handleRunTest(); }}
                        className="w-full text-left px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-700 transition-colors"
                      >
                        Run entire file
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {/* Add new test case */}
              {showNewTestInput ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={newTestName}
                    onChange={(e) => setNewTestName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newTestName.trim()) {
                        addTestCase(newTestName.trim());
                        setNewTestName('');
                        setShowNewTestInput(false);
                      }
                      if (e.key === 'Escape') {
                        setNewTestName('');
                        setShowNewTestInput(false);
                      }
                    }}
                    placeholder="test name..."
                    className="w-36 bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:border-blue-500"
                    autoFocus
                  />
                  <button
                    onClick={() => {
                      if (newTestName.trim()) {
                        addTestCase(newTestName.trim());
                        setNewTestName('');
                        setShowNewTestInput(false);
                      }
                    }}
                    disabled={!newTestName.trim()}
                    className="text-[10px] text-green-400 hover:text-green-300 disabled:text-zinc-600 px-1"
                  >
                    ✓
                  </button>
                  <button
                    onClick={() => { setNewTestName(''); setShowNewTestInput(false); }}
                    className="text-[10px] text-zinc-500 hover:text-zinc-300 px-1"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowNewTestInput(true)}
                  className="px-1.5 py-1 text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded transition-colors"
                  title="Add new test case"
                >
                  +
                </button>
              )}

              {/* Separator before hook tabs */}
              <span className="w-px h-5 bg-zinc-700 mx-1" />

              {/* beforeAll tab */}
              <button
                onClick={() => setActiveView('beforeAll')}
                className={`px-2 py-1.5 text-[10px] rounded transition-colors whitespace-nowrap ${
                  activeView === 'beforeAll'
                    ? 'bg-purple-900/40 text-purple-400 border border-purple-800/50'
                    : 'text-zinc-500 hover:text-purple-400 hover:bg-purple-900/20'
                }`}
                title="Edit beforeAll hook (runs once per describe)"
              >
                beforeAll
                {storeTestFlow?.beforeAll && storeTestFlow.beforeAll.length > 0 && (
                  <span className="ml-1 text-zinc-500">({storeTestFlow.beforeAll.length})</span>
                )}
              </button>

              {/* beforeEach tab */}
              <button
                onClick={() => setActiveView('beforeEach')}
                className={`px-2 py-1.5 text-[10px] rounded transition-colors whitespace-nowrap ${
                  activeView === 'beforeEach'
                    ? 'bg-amber-900/40 text-amber-400 border border-amber-800/50'
                    : 'text-zinc-500 hover:text-amber-400 hover:bg-amber-900/20'
                }`}
                title="Edit beforeEach hook (runs per test)"
              >
                beforeEach
                {storeTestFlow?.beforeEach && storeTestFlow.beforeEach.length > 0 && (
                  <span className="ml-1 text-zinc-500">({storeTestFlow.beforeEach.length})</span>
                )}
              </button>

              {/* afterEach tab */}
              <button
                onClick={() => setActiveView('afterEach')}
                className={`px-2 py-1.5 text-[10px] rounded transition-colors whitespace-nowrap ${
                  activeView === 'afterEach'
                    ? 'bg-amber-900/40 text-amber-400 border border-amber-800/50'
                    : 'text-zinc-500 hover:text-amber-400 hover:bg-amber-900/20'
                }`}
                title="Edit afterEach hook (runs per test)"
              >
                afterEach
                {storeTestFlow?.afterEach && storeTestFlow.afterEach.length > 0 && (
                  <span className="ml-1 text-zinc-500">({storeTestFlow.afterEach.length})</span>
                )}
              </button>

              {/* afterAll tab */}
              <button
                onClick={() => setActiveView('afterAll')}
                className={`px-2 py-1.5 text-[10px] rounded transition-colors whitespace-nowrap ${
                  activeView === 'afterAll'
                    ? 'bg-purple-900/40 text-purple-400 border border-purple-800/50'
                    : 'text-zinc-500 hover:text-purple-400 hover:bg-purple-900/20'
                }`}
                title="Edit afterAll hook (runs once per describe)"
              >
                afterAll
                {storeTestFlow?.afterAll && storeTestFlow.afterAll.length > 0 && (
                  <span className="ml-1 text-zinc-500">({storeTestFlow.afterAll.length})</span>
                )}
              </button>

              {/* Run all button */}
              <div className="ml-auto flex items-center gap-1.5">
                {isTestRunning && (
                  <button
                    onClick={async () => { try { await stopTests(); } catch {} }}
                    className="px-2 py-1 text-[10px] bg-red-900/50 hover:bg-red-900/70 border border-red-800/50 text-red-400 rounded transition-colors"
                  >
                    Stop
                  </button>
                )}
                <button
                  onClick={() => handleRunTest()}
                  disabled={isTestRunning}
                  className={`px-2 py-1 text-[10px] rounded transition-colors ${
                    isTestRunning
                      ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                      : 'bg-green-900/40 hover:bg-green-900/60 border border-green-800/40 text-green-400'
                  }`}
                >
                  ▶ Run All
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Flow editor */}
        <div className="flex-1 relative">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-zinc-500 text-sm">Parsing test file...</p>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <p className="text-red-400 text-sm mb-2">Failed to parse test file</p>
                <p className="text-zinc-500 text-xs">{(error as Error).message}</p>
              </div>
            </div>
          )}

          {testFlow && activeView === 'test' && testFlow.tests.length > 0 && <FlowEditor />}

          {testFlow && activeView !== 'test' && (
            <>
              {/* Hook editing banner */}
              <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 bg-amber-900/60 border border-amber-700/50 text-amber-300 text-xs px-3 py-1 rounded-full">
                Editing {activeView} hook
              </div>
              <FlowEditor />
            </>
          )}

          {testFlow && activeView === 'test' && testFlow.tests.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-zinc-500 text-sm">No test cases found in this file</p>
            </div>
          )}
        </div>

        {/* Code Preview Panel */}
        <CodePreviewPanel
          isOpen={codePreviewOpen}
          onToggle={() => setCodePreviewOpen(!codePreviewOpen)}
        />

        {/* Test Runner Panel */}
        <TestRunnerPanel
          testFile={selectedFile?.filePath}
          isOpen={runnerOpen}
          onToggle={() => setRunnerOpen(!runnerOpen)}
        />

        {/* Bottom bar */}
        {testFlow && (
          <div className="h-8 bg-zinc-900 border-t border-zinc-700 flex items-center px-4 gap-4 shrink-0">
            {/* Fixture selector */}
            <div className="relative" ref={fixtureMenuRef}>
              <button
                onClick={() => setFixtureMenuOpen(!fixtureMenuOpen)}
                className="text-zinc-500 text-xs hover:text-zinc-300 transition-colors flex items-center gap-1"
              >
                Fixtures: <span className="text-zinc-400">{currentFixtures.length > 0 ? currentFixtures.join(', ') : 'none'}</span>
                <span className="text-[10px] text-zinc-600 ml-0.5">{fixtureMenuOpen ? '\u25B2' : '\u25BC'}</span>
              </button>
              {fixtureMenuOpen && (
                <div className="absolute bottom-full left-0 mb-1 bg-zinc-800 border border-zinc-700 rounded-md shadow-xl min-w-[200px] max-h-[300px] overflow-y-auto z-50">
                  <div className="px-3 py-1.5 text-[10px] text-zinc-500 uppercase tracking-wider border-b border-zinc-700">
                    Toggle Fixtures
                  </div>
                  {availableFixtures.map((name) => (
                    <label
                      key={name}
                      className="flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={currentFixtures.includes(name)}
                        onChange={() => handleToggleFixture(name)}
                        className="rounded border-zinc-600 bg-zinc-900 text-blue-500 focus:ring-0 focus:ring-offset-0"
                      />
                      <span className="font-mono">{name}</span>
                    </label>
                  ))}
                  {availableFixtures.length === 0 && (
                    <p className="px-3 py-2 text-zinc-500 text-xs">No fixtures available</p>
                  )}
                </div>
              )}
            </div>

            <span className="text-zinc-700">|</span>

            <span className="text-zinc-500 text-xs">
              {activeView === 'test' ? `Test: ${storeTestFlow?.tests[activeTestIndex]?.name ?? ''}` : activeView}
            </span>

            <span className="text-zinc-600 text-xs ml-auto flex items-center gap-3">
              {selectedNodeIds.size > 1 && (
                <span className="text-blue-400">{selectedNodeIds.size} nodes selected</span>
              )}
              {nodes.length} node(s)
            </span>
          </div>
        )}
      </div>

      {/* Properties panel */}
      <PropertiesPanel node={selectedNode} />
    </div>
  );
}
