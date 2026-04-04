import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { RunHistoryService, type RunResult } from '../run-history.js';

describe('RunHistoryService', () => {
  let tmpDir: string;
  let service: RunHistoryService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-history-test-'));
    service = new RunHistoryService(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeResult(overrides: Partial<RunResult> = {}): RunResult {
    return {
      timestamp: Date.now(),
      status: 'passed',
      durationMs: 1234,
      testFilePath: 'tests/example.spec.ts',
      ...overrides,
    };
  }

  describe('recordResult', () => {
    it('appends a result and returns updated history', () => {
      const result = makeResult();
      const history = service.recordResult(result);
      expect(history.testFilePath).toBe('tests/example.spec.ts');
      expect(history.results).toHaveLength(1);
      expect(history.results[0]).toEqual(result);
    });

    it('accumulates multiple results', () => {
      service.recordResult(makeResult({ timestamp: 1000 }));
      service.recordResult(makeResult({ timestamp: 2000 }));
      const history = service.recordResult(makeResult({ timestamp: 3000 }));
      expect(history.results).toHaveLength(3);
    });

    it('prunes to 20 entries when more are added', () => {
      for (let i = 0; i < 25; i++) {
        service.recordResult(makeResult({ timestamp: i }));
      }
      const history = service.getHistory('tests/example.spec.ts');
      expect(history.results).toHaveLength(20);
      // Should keep the last 20 (timestamps 5-24)
      expect(history.results[0].timestamp).toBe(5);
      expect(history.results[19].timestamp).toBe(24);
    });
  });

  describe('getHistory', () => {
    it('returns empty history for unknown test file', () => {
      const history = service.getHistory('nonexistent.spec.ts');
      expect(history.testFilePath).toBe('nonexistent.spec.ts');
      expect(history.results).toHaveLength(0);
    });

    it('returns stored history', () => {
      service.recordResult(makeResult());
      const history = service.getHistory('tests/example.spec.ts');
      expect(history.results).toHaveLength(1);
    });
  });

  describe('clearHistory', () => {
    it('removes all entries for a test', () => {
      service.recordResult(makeResult());
      service.recordResult(makeResult());
      service.clearHistory('tests/example.spec.ts');
      const history = service.getHistory('tests/example.spec.ts');
      expect(history.results).toHaveLength(0);
    });

    it('does not throw when clearing nonexistent history', () => {
      expect(() => service.clearHistory('nonexistent.spec.ts')).not.toThrow();
    });
  });

  describe('getAllHistories', () => {
    it('returns all stored histories', () => {
      service.recordResult(makeResult({ testFilePath: 'a.spec.ts' }));
      service.recordResult(makeResult({ testFilePath: 'b.spec.ts' }));
      const all = service.getAllHistories();
      expect(all).toHaveLength(2);
      const paths = all.map(h => h.testFilePath).sort();
      expect(paths).toEqual(['a.spec.ts', 'b.spec.ts']);
    });
  });

  describe('calculateTrend', () => {
    it('returns "unknown" for empty history', () => {
      const trend = RunHistoryService.calculateTrend({ testFilePath: 'x', results: [] });
      expect(trend).toBe('unknown');
    });

    it('returns "stable-pass" when last 5 all passed', () => {
      const results = Array.from({ length: 5 }, (_, i) =>
        makeResult({ timestamp: i, status: 'passed' })
      );
      const trend = RunHistoryService.calculateTrend({ testFilePath: 'x', results });
      expect(trend).toBe('stable-pass');
    });

    it('returns "stable-fail" when last 5 all failed', () => {
      const results = Array.from({ length: 5 }, (_, i) =>
        makeResult({ timestamp: i, status: 'failed' })
      );
      const trend = RunHistoryService.calculateTrend({ testFilePath: 'x', results });
      expect(trend).toBe('stable-fail');
    });

    it('returns "flaky" for mixed pass/fail', () => {
      const results = [
        makeResult({ timestamp: 1, status: 'passed' }),
        makeResult({ timestamp: 2, status: 'failed' }),
        makeResult({ timestamp: 3, status: 'passed' }),
        makeResult({ timestamp: 4, status: 'failed' }),
        makeResult({ timestamp: 5, status: 'passed' }),
      ];
      const trend = RunHistoryService.calculateTrend({ testFilePath: 'x', results });
      expect(trend).toBe('flaky');
    });

    it('considers timed-out as failure for trend', () => {
      const results = Array.from({ length: 5 }, (_, i) =>
        makeResult({ timestamp: i, status: 'timed-out' })
      );
      const trend = RunHistoryService.calculateTrend({ testFilePath: 'x', results });
      expect(trend).toBe('stable-fail');
    });

    it('only considers the last 5 results for trend', () => {
      const results = [
        ...Array.from({ length: 10 }, (_, i) => makeResult({ timestamp: i, status: 'failed' })),
        ...Array.from({ length: 5 }, (_, i) => makeResult({ timestamp: 10 + i, status: 'passed' })),
      ];
      const trend = RunHistoryService.calculateTrend({ testFilePath: 'x', results });
      expect(trend).toBe('stable-pass');
    });
  });

  describe('persistence', () => {
    it('history persists across service instances', () => {
      service.recordResult(makeResult({ timestamp: 42 }));

      // Create a new service instance pointing to the same directory
      const service2 = new RunHistoryService(tmpDir);
      const history = service2.getHistory('tests/example.spec.ts');
      expect(history.results).toHaveLength(1);
      expect(history.results[0].timestamp).toBe(42);
    });
  });
});
