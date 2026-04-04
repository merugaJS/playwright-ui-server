import express from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ProjectInfo } from './project-scanner.js';
import { createConfigRouter } from './routes/config.js';
import { createTestsRouter } from './routes/tests.js';
import { createPageObjectsRouter } from './routes/page-objects.js';
import { createFixturesRouter } from './routes/fixtures.js';
import { createRunnerRouter } from './routes/runner.js';
import { createNewTestRouter } from './routes/create-test.js';
import { createHistoryRouter } from './routes/history.js';
import { createArtifactsRouter } from './routes/artifacts.js';
import { createEnvRouter } from './routes/env.js';
import { createCoverageRouter } from './routes/coverage.js';
import { RunHistoryService } from './run-history.js';
import { setRunHistoryService } from './test-runner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp(projectInfo: ProjectInfo): express.Express {
  const app = express();

  app.use(express.json());

  // Initialize run history service
  const runHistoryService = new RunHistoryService(projectInfo.rootDir);
  setRunHistoryService(runHistoryService);

  // API routes
  app.use('/api/config', createConfigRouter(projectInfo));
  app.use('/api/tests', createTestsRouter(projectInfo));
  app.use('/api/page-objects', createPageObjectsRouter(projectInfo));
  app.use('/api/fixtures', createFixturesRouter(projectInfo));
  app.use('/api/runner', createRunnerRouter(projectInfo));
  app.use('/api/tests/new', createNewTestRouter(projectInfo));
  app.use('/api/history', createHistoryRouter(runHistoryService));
  app.use('/api/artifacts', createArtifactsRouter(projectInfo));
  app.use('/api/env', createEnvRouter(projectInfo));
  app.use('/api/coverage', createCoverageRouter(projectInfo));

  // Serve the UI static files
  // When bundled for npm: dist/server.mjs → dist/ui/
  // When running from workspace: packages/server/dist/ → ../../ui/dist/
  const bundledUiPath = path.resolve(__dirname, 'ui');
  const workspaceUiPath = path.resolve(__dirname, '../../ui/dist');
  const uiDistPath = existsSync(bundledUiPath) ? bundledUiPath : workspaceUiPath;
  app.use(express.static(uiDistPath));

  // SPA fallback — serve index.html for all non-API routes
  app.get('*', (_req, res) => {
    res.sendFile(path.join(uiDistPath, 'index.html'));
  });

  return app;
}
