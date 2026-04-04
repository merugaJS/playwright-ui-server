import { useQuery, useQueryClient } from '@tanstack/react-query';

// ─── Types ────────────────────────────────────────────────────────────

export interface RunResult {
  timestamp: number;
  status: 'passed' | 'failed' | 'skipped' | 'timed-out';
  durationMs: number;
  errorMessage?: string;
  testFilePath: string;
  screenshots?: string[];
  traceFile?: string;
}

export type TrendStatus = 'stable-pass' | 'stable-fail' | 'flaky' | 'unknown';

export interface RunHistoryResponse {
  testFilePath: string;
  results: RunResult[];
  trend: TrendStatus;
}

export interface HistorySummary {
  testFilePath: string;
  trend: TrendStatus;
  lastRun: RunResult | null;
  totalRuns: number;
}

interface AllHistoriesResponse {
  histories: HistorySummary[];
}

// ─── Fetch helpers ────────────────────────────────────────────────────

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

function encodeTestPath(testFilePath: string): string {
  // Base64url encode the test file path
  return btoa(testFilePath)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ─── Hooks ────────────────────────────────────────────────────────────

/**
 * Fetch run history for a specific test file.
 */
export function useRunHistory(testFilePath: string | null) {
  return useQuery({
    queryKey: ['runHistory', testFilePath],
    queryFn: () => fetchJson<RunHistoryResponse>(`/api/history/${encodeTestPath(testFilePath!)}`),
    enabled: !!testFilePath,
  });
}

/**
 * Fetch all history summaries (for sidebar trend indicators).
 */
export function useAllRunHistories() {
  return useQuery({
    queryKey: ['runHistories'],
    queryFn: () => fetchJson<AllHistoriesResponse>('/api/history'),
    refetchInterval: 10000, // Refresh every 10s
  });
}

/**
 * Clear history for a test file.
 */
export function useClearHistory() {
  const queryClient = useQueryClient();

  return async (testFilePath: string) => {
    const encoded = encodeTestPath(testFilePath);
    const res = await fetch(`/api/history/${encoded}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    // Invalidate related queries
    queryClient.invalidateQueries({ queryKey: ['runHistory', testFilePath] });
    queryClient.invalidateQueries({ queryKey: ['runHistories'] });
  };
}
