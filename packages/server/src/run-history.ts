import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// ─── Types ────────────────────────────────────────────────────────────

export interface RunResult {
  timestamp: number;          // Unix timestamp ms
  status: 'passed' | 'failed' | 'skipped' | 'timed-out';
  durationMs: number;
  errorMessage?: string;
  testFilePath: string;
  screenshots?: string[];     // Relative paths to failure screenshot files
  traceFile?: string;         // Relative path to trace.zip if it exists
}

export interface RunHistory {
  testFilePath: string;
  results: RunResult[];
}

export type TrendStatus = 'stable-pass' | 'stable-fail' | 'flaky' | 'unknown';

// ─── Constants ────────────────────────────────────────────────────────

const MAX_RESULTS = 20;
const TREND_WINDOW = 5;

// ─── Service ──────────────────────────────────────────────────────────

export class RunHistoryService {
  private storageDir: string;

  constructor(projectRootDir: string) {
    this.storageDir = path.join(projectRootDir, '.playwright-server', 'run-history');
    this.ensureDir();
  }

  /**
   * Record a test run result. Appends to history and prunes to MAX_RESULTS.
   */
  recordResult(result: RunResult): RunHistory {
    const history = this.loadHistory(result.testFilePath);
    history.results.push(result);

    // Prune to keep only last MAX_RESULTS
    if (history.results.length > MAX_RESULTS) {
      history.results = history.results.slice(-MAX_RESULTS);
    }

    this.saveHistory(history);
    return history;
  }

  /**
   * Get the run history for a test file.
   */
  getHistory(testFilePath: string): RunHistory {
    return this.loadHistory(testFilePath);
  }

  /**
   * Clear all history for a test file.
   */
  clearHistory(testFilePath: string): void {
    const filePath = this.historyFilePath(testFilePath);
    try {
      fs.unlinkSync(filePath);
    } catch {
      // File may not exist — that's fine
    }
  }

  /**
   * Get all histories (for bulk trend indicators).
   */
  getAllHistories(): RunHistory[] {
    this.ensureDir();
    const histories: RunHistory[] = [];
    try {
      const files = fs.readdirSync(this.storageDir);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        try {
          const raw = fs.readFileSync(path.join(this.storageDir, file), 'utf-8');
          const history = JSON.parse(raw) as RunHistory;
          if (history.testFilePath && Array.isArray(history.results)) {
            histories.push(history);
          }
        } catch {
          // Skip corrupt files
        }
      }
    } catch {
      // Directory doesn't exist or can't be read
    }
    return histories;
  }

  /**
   * Calculate the trend status for a test file.
   */
  static calculateTrend(history: RunHistory): TrendStatus {
    if (history.results.length === 0) return 'unknown';

    const recent = history.results.slice(-TREND_WINDOW);
    const passCount = recent.filter(r => r.status === 'passed').length;
    const failCount = recent.filter(r => r.status === 'failed' || r.status === 'timed-out').length;

    if (passCount === recent.length) return 'stable-pass';
    if (failCount === recent.length) return 'stable-fail';
    if (passCount > 0 && failCount > 0) return 'flaky';
    return 'unknown';
  }

  // ─── Private helpers ────────────────────────────────────────────────

  private historyFilePath(testFilePath: string): string {
    const hash = crypto.createHash('sha256').update(testFilePath).digest('hex').slice(0, 16);
    return path.join(this.storageDir, `${hash}.json`);
  }

  private loadHistory(testFilePath: string): RunHistory {
    const filePath = this.historyFilePath(testFilePath);
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw) as RunHistory;
      if (data.testFilePath && Array.isArray(data.results)) {
        return data;
      }
    } catch {
      // File doesn't exist or is corrupt
    }
    return { testFilePath, results: [] };
  }

  private saveHistory(history: RunHistory): void {
    this.ensureDir();
    const filePath = this.historyFilePath(history.testFilePath);
    fs.writeFileSync(filePath, JSON.stringify(history, null, 2), 'utf-8');
  }

  private ensureDir(): void {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }
}
