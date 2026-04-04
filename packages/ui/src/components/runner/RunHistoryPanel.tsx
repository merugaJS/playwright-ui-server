import { useState } from 'react';
import { useRunHistory, useClearHistory, type RunResult } from '../../hooks/useRunHistory.js';
import { ScreenshotViewer } from './ScreenshotViewer.js';

interface RunHistoryPanelProps {
  testFilePath: string | null;
  onViewTrace?: (tracePath: string) => void;
}

export function RunHistoryPanel({ testFilePath, onViewTrace }: RunHistoryPanelProps) {
  const { data: history, isLoading } = useRunHistory(testFilePath);
  const clearHistory = useClearHistory();
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedEntry, setExpandedEntry] = useState<number | null>(null);

  if (!testFilePath) return null;

  const results = history?.results ?? [];
  // Show in reverse chronological order
  const sortedResults = [...results].reverse();

  const handleClear = async () => {
    if (testFilePath) {
      await clearHistory(testFilePath);
    }
  };

  return (
    <div className="border-t border-zinc-800">
      {/* Collapsible header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-1.5 text-xs hover:bg-zinc-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-500">{isExpanded ? '\u25BC' : '\u25B6'}</span>
          <span className="text-zinc-400 font-semibold">History</span>
          {results.length > 0 && (
            <span className="text-zinc-600">({results.length} run{results.length !== 1 ? 's' : ''})</span>
          )}
          {history?.trend && history.trend !== 'unknown' && (
            <TrendBadge trend={history.trend} />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-2 max-h-[200px] overflow-y-auto">
          {isLoading && (
            <p className="text-zinc-600 text-[10px] py-2">Loading history...</p>
          )}

          {!isLoading && sortedResults.length === 0 && (
            <p className="text-zinc-600 text-[10px] py-2">No run history yet.</p>
          )}

          {sortedResults.length > 0 && (
            <>
              {/* Mini bar chart of last 10 runs */}
              <div className="flex items-center gap-0.5 mb-2">
                {sortedResults.slice(0, 10).reverse().map((r, i) => (
                  <div
                    key={i}
                    className={`h-3 w-2 rounded-sm ${statusColor(r.status)}`}
                    title={`${r.status} - ${formatDate(r.timestamp)}`}
                  />
                ))}
              </div>

              {/* History entries */}
              <div className="space-y-0.5">
                {sortedResults.map((result, idx) => (
                  <HistoryEntry
                    key={result.timestamp + '-' + idx}
                    result={result}
                    isExpanded={expandedEntry === idx}
                    onToggle={() => setExpandedEntry(expandedEntry === idx ? null : idx)}
                    onViewTrace={onViewTrace}
                  />
                ))}
              </div>

              {/* Clear button */}
              <button
                onClick={handleClear}
                className="mt-2 text-[10px] text-zinc-600 hover:text-red-400 transition-colors"
              >
                Clear History
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────

function HistoryEntry({
  result,
  isExpanded,
  onToggle,
  onViewTrace,
}: {
  result: RunResult;
  isExpanded: boolean;
  onToggle: () => void;
  onViewTrace?: (tracePath: string) => void;
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 text-[10px] py-1 px-1.5 rounded hover:bg-zinc-800/50 transition-colors"
      >
        <StatusIcon status={result.status} />
        <span className="text-zinc-400">{formatDate(result.timestamp)}</span>
        <span className="text-zinc-600">{formatDuration(result.durationMs)}</span>
        {result.screenshots && result.screenshots.length > 0 && (
          <span className="text-zinc-600" title="Has screenshots">&#128247;</span>
        )}
        <span className="text-zinc-700 ml-auto">{isExpanded ? '\u25BC' : '\u25B6'}</span>
      </button>

      {isExpanded && (
        <div className="ml-5 pl-2 border-l border-zinc-800 py-1">
          {result.status === 'passed' ? (
            <p className="text-green-500/70 text-[10px]">Test passed successfully.</p>
          ) : result.errorMessage ? (
            <pre className="text-red-400/70 text-[10px] whitespace-pre-wrap break-words max-h-[100px] overflow-y-auto">
              {result.errorMessage}
            </pre>
          ) : (
            <p className="text-red-400/70 text-[10px]">Test {result.status}. No error details available.</p>
          )}

          {/* Show screenshots and trace for failed runs */}
          {result.status !== 'passed' && (result.screenshots?.length || result.traceFile) && (
            <ScreenshotViewer
              screenshots={result.screenshots ?? []}
              traceFile={result.traceFile}
              onViewTrace={onViewTrace}
            />
          )}
        </div>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: RunResult['status'] }) {
  switch (status) {
    case 'passed':
      return <span className="text-green-400" title="Passed">&#x2713;</span>;
    case 'failed':
      return <span className="text-red-400" title="Failed">&#x2717;</span>;
    case 'skipped':
      return <span className="text-yellow-400" title="Skipped">&#x25CB;</span>;
    case 'timed-out':
      return <span className="text-orange-400" title="Timed out">&#x29D6;</span>;
  }
}

export function TrendBadge({ trend }: { trend: string }) {
  switch (trend) {
    case 'stable-pass':
      return <span className="text-green-400 text-[10px]" title="All recent runs passed">&#x2713; passing</span>;
    case 'stable-fail':
      return <span className="text-red-400 text-[10px]" title="All recent runs failed">&#x2717; failing</span>;
    case 'flaky':
      return <span className="text-yellow-400 text-[10px]" title="Mixed pass/fail — flaky">&#x26A0; flaky</span>;
    default:
      return null;
  }
}

export function TrendIndicator({ trend }: { trend: string }) {
  switch (trend) {
    case 'stable-pass':
      return <span className="text-green-400 text-[10px]" title="All recent runs passed">&#x2713;</span>;
    case 'stable-fail':
      return <span className="text-red-400 text-[10px]" title="All recent runs failed">&#x2717;</span>;
    case 'flaky':
      return <span className="text-yellow-400 text-[10px]" title="Flaky — mixed results">&#x26A0;</span>;
    default:
      return null;
  }
}

// ─── Formatting helpers ───────────────────────────────────────────────

function statusColor(status: RunResult['status']): string {
  switch (status) {
    case 'passed': return 'bg-green-500';
    case 'failed': return 'bg-red-500';
    case 'skipped': return 'bg-yellow-500';
    case 'timed-out': return 'bg-orange-500';
  }
}

function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();

  if (isToday) {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = (ms / 1000).toFixed(1);
  return `${seconds}s`;
}
