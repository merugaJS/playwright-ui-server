import { Router } from 'express';
import { RunHistoryService } from '../run-history.js';

export function createHistoryRouter(historyService: RunHistoryService): Router {
  const router = Router();

  // Get history for a specific test file (testPath is base64url-encoded)
  router.get('/:testPath', (req, res) => {
    const testFilePath = decodeTestPath(req.params.testPath);
    if (!testFilePath) {
      res.status(400).json({ error: 'Invalid testPath parameter' });
      return;
    }

    const history = historyService.getHistory(testFilePath);
    const trend = RunHistoryService.calculateTrend(history);
    res.json({ ...history, trend });
  });

  // Delete history for a specific test file
  router.delete('/:testPath', (req, res) => {
    const testFilePath = decodeTestPath(req.params.testPath);
    if (!testFilePath) {
      res.status(400).json({ error: 'Invalid testPath parameter' });
      return;
    }

    historyService.clearHistory(testFilePath);
    res.json({ status: 'cleared', testFilePath });
  });

  // Get all histories with trends (for sidebar indicators)
  router.get('/', (_req, res) => {
    const histories = historyService.getAllHistories();
    const summaries = histories.map(h => ({
      testFilePath: h.testFilePath,
      trend: RunHistoryService.calculateTrend(h),
      lastRun: h.results.length > 0 ? h.results[h.results.length - 1] : null,
      totalRuns: h.results.length,
    }));
    res.json({ histories: summaries });
  });

  return router;
}

function decodeTestPath(encoded: string): string | null {
  try {
    return Buffer.from(encoded, 'base64url').toString('utf-8');
  } catch {
    return null;
  }
}
