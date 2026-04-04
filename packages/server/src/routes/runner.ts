import { Router } from 'express';
import type { ProjectInfo } from '../project-scanner.js';
import { runTests, stopTests, isRunning } from '../test-runner.js';

export function createRunnerRouter(projectInfo: ProjectInfo): Router {
  const router = Router();

  // Run tests
  router.post('/run', (req, res) => {
    const { testFile, testName, project, headed, workers } = req.body;

    if (isRunning()) {
      res.status(409).json({ error: 'Tests are already running. Stop them first.' });
      return;
    }

    try {
      const { pid } = runTests({
        rootDir: projectInfo.rootDir,
        testFile,
        testName,
        project,
        headed,
        workers,
      });

      res.json({ status: 'started', pid });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to start test run', message: err.message });
    }
  });

  // Stop running tests
  router.post('/stop', (_req, res) => {
    const stopped = stopTests();
    res.json({ status: stopped ? 'stopped' : 'not_running' });
  });

  // Check status
  router.get('/status', (_req, res) => {
    res.json({ running: isRunning() });
  });

  return router;
}
