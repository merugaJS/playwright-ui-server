import { useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRunnerStatus, useConfig } from '../../api/hooks.js';
import { runTests, stopTests } from '../../api/mutations.js';
import { testRunnerEvents } from '../../api/useWebSocket.js';
import { RunHistoryPanel } from './RunHistoryPanel.js';
import { ScreenshotViewer } from './ScreenshotViewer.js';

interface OutputLine {
  stream: 'stdout' | 'stderr' | 'info';
  text: string;
}

interface TestRunnerPanelProps {
  testFile?: string; // Pre-selected test file to run
  isOpen: boolean;
  onToggle: () => void;
}

export function TestRunnerPanel({ testFile, isOpen, onToggle }: TestRunnerPanelProps) {
  const { data: config } = useConfig();
  const { data: status } = useRunnerStatus();
  const queryClient = useQueryClient();
  const [output, setOutput] = useState<OutputLine[]>([]);
  const [runError, setRunError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ passed: boolean; exitCode: number } | null>(null);
  const [lastScreenshots, setLastScreenshots] = useState<string[]>([]);
  const [lastTraceFile, setLastTraceFile] = useState<string | undefined>();
  const outputRef = useRef<HTMLDivElement>(null);

  // Run options
  const [headed, setHeaded] = useState(false);
  const [selectedProject, setSelectedProject] = useState<string>('');

  const isRunning = status?.running ?? false;

  // Subscribe to WebSocket test runner events
  useEffect(() => {
    function handleStarted(e: Event) {
      const detail = (e as CustomEvent).detail;
      setOutput([{ stream: 'info', text: `▶ Running: ${detail.command}` }]);
      setLastResult(null);
      setLastScreenshots([]);
      setLastTraceFile(undefined);
      setRunError(null);
    }

    function handleOutput(e: Event) {
      const detail = (e as CustomEvent).detail;
      setOutput((prev) => [...prev, { stream: detail.stream, text: detail.text }]);
    }

    function handleFinished(e: Event) {
      const detail = (e as CustomEvent).detail;
      setLastResult({ passed: detail.passed, exitCode: detail.exitCode });
      // Capture screenshots and trace from the finished event
      if (detail.screenshots && Array.isArray(detail.screenshots)) {
        setLastScreenshots(detail.screenshots);
      }
      if (detail.traceFile) {
        setLastTraceFile(detail.traceFile);
      }
      setOutput((prev) => [
        ...prev,
        {
          stream: 'info',
          text: detail.passed
            ? '\n✅ Tests passed!'
            : `\n❌ Tests failed (exit code: ${detail.exitCode})`,
        },
      ]);
      // Invalidate run history queries so the history panel refreshes
      queryClient.invalidateQueries({ queryKey: ['runHistory'] });
      queryClient.invalidateQueries({ queryKey: ['runHistories'] });
    }

    function handleStopped() {
      setOutput((prev) => [...prev, { stream: 'info', text: '\n⏹ Tests stopped.' }]);
      setLastResult(null);
    }

    function handleError(e: Event) {
      const detail = (e as CustomEvent).detail;
      setRunError(detail.message);
      setOutput((prev) => [...prev, { stream: 'stderr', text: `Error: ${detail.message}` }]);
    }

    testRunnerEvents.addEventListener('testRun:started', handleStarted);
    testRunnerEvents.addEventListener('testRun:output', handleOutput);
    testRunnerEvents.addEventListener('testRun:finished', handleFinished);
    testRunnerEvents.addEventListener('testRun:stopped', handleStopped);
    testRunnerEvents.addEventListener('testRun:error', handleError);

    return () => {
      testRunnerEvents.removeEventListener('testRun:started', handleStarted);
      testRunnerEvents.removeEventListener('testRun:output', handleOutput);
      testRunnerEvents.removeEventListener('testRun:finished', handleFinished);
      testRunnerEvents.removeEventListener('testRun:stopped', handleStopped);
      testRunnerEvents.removeEventListener('testRun:error', handleError);
    };
  }, []);

  // Auto-scroll output
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const handleRun = useCallback(async () => {
    setRunError(null);
    try {
      await runTests({
        testFile,
        project: selectedProject || undefined,
        headed,
      });
    } catch (err: any) {
      setRunError(err.message);
    }
  }, [testFile, selectedProject, headed]);

  const handleStop = useCallback(async () => {
    try {
      await stopTests();
    } catch (err: any) {
      setRunError(err.message);
    }
  }, []);

  const handleViewTrace = useCallback(async (tracePath: string) => {
    try {
      const res = await fetch('/api/artifacts/trace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: tracePath }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setRunError(err.message ?? 'Failed to launch trace viewer');
      }
    } catch (err: any) {
      setRunError(err.message);
    }
  }, []);

  const projects = config?.config.projects ?? [];

  if (!isOpen) {
    return (
      <div className="bg-zinc-900 border-t border-zinc-700 shrink-0">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-between px-4 h-8 text-xs hover:bg-zinc-800 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="text-zinc-400">Test Runner</span>
            {isRunning && (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                <span className="text-blue-400">Running...</span>
              </span>
            )}
            {lastResult && !isRunning && (
              <span className={lastResult.passed ? 'text-green-400' : 'text-red-400'}>
                {lastResult.passed ? '✅ Passed' : '❌ Failed'}
              </span>
            )}
          </div>
          <span className="text-zinc-600">▲</span>
        </button>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 border-t border-zinc-700 shrink-0 flex flex-col" style={{ height: '280px' }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 h-9 border-b border-zinc-800 shrink-0">
        <span className="text-zinc-300 text-xs font-semibold">Test Runner</span>

        {/* Run options */}
        {projects.length > 0 && (
          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-zinc-300 text-[10px] focus:outline-none"
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
          </select>
        )}

        <label className="flex items-center gap-1 text-zinc-500 text-[10px]">
          <input
            type="checkbox"
            checked={headed}
            onChange={(e) => setHeaded(e.target.checked)}
            className="rounded bg-zinc-800 border-zinc-600"
          />
          Headed
        </label>

        <div className="ml-auto flex items-center gap-1.5">
          {runError && <span className="text-red-400 text-[10px]">{runError}</span>}

          {testFile && (
            <span className="text-zinc-500 text-[10px] truncate max-w-[150px]">{testFile}</span>
          )}

          {isRunning ? (
            <button
              onClick={handleStop}
              className="px-2 py-0.5 text-[10px] bg-red-900/50 hover:bg-red-900/70 border border-red-800/50 text-red-400 rounded transition-colors"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={handleRun}
              className="px-2 py-0.5 text-[10px] bg-green-900/50 hover:bg-green-900/70 border border-green-800/50 text-green-400 rounded transition-colors"
            >
              {testFile ? 'Run File' : 'Run All'}
            </button>
          )}

          <button
            onClick={() => setOutput([])}
            className="text-zinc-600 hover:text-zinc-400 text-[10px] transition-colors"
            title="Clear output"
          >
            Clear
          </button>

          <button
            onClick={onToggle}
            className="text-zinc-600 hover:text-zinc-400 text-xs transition-colors"
          >
            ▼
          </button>
        </div>
      </div>

      {/* Output */}
      <div
        ref={outputRef}
        className="flex-1 overflow-y-auto px-4 py-2 font-mono text-xs leading-relaxed"
      >
        {output.length === 0 && (
          <p className="text-zinc-600 text-center mt-8">
            Click "Run" to execute Playwright tests
          </p>
        )}
        {output.map((line, i) => (
          <div
            key={i}
            className={
              line.stream === 'stderr'
                ? 'text-red-400'
                : line.stream === 'info'
                  ? 'text-zinc-400 font-semibold'
                  : 'text-zinc-300'
            }
          >
            {line.text}
          </div>
        ))}
      </div>

      {/* Failure Screenshots */}
      {lastResult && !lastResult.passed && (lastScreenshots.length > 0 || lastTraceFile) && (
        <div className="px-4 py-2 border-t border-zinc-800 shrink-0 max-h-[150px] overflow-y-auto">
          <ScreenshotViewer
            screenshots={lastScreenshots}
            traceFile={lastTraceFile}
            onViewTrace={handleViewTrace}
          />
        </div>
      )}

      {/* Run History */}
      <RunHistoryPanel testFilePath={testFile ?? null} onViewTrace={handleViewTrace} />
    </div>
  );
}
