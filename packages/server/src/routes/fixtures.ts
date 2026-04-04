import path from 'node:path';
import { Router } from 'express';
import { parseFixtureFile, findFixtureFiles, getBuiltInFixtures } from '@playwright-server/core';
import type { ProjectInfo } from '../project-scanner.js';

export function createFixturesRouter(projectInfo: ProjectInfo): Router {
  const router = Router();

  // Get all fixtures (built-in + custom)
  router.get('/', (_req, res) => {
    const builtIn = getBuiltInFixtures();

    // Discover and parse custom fixture files
    const testDir = path.resolve(projectInfo.rootDir, projectInfo.config.testDir);
    const fixtureFiles = findFixtureFiles(projectInfo.rootDir, testDir);

    const custom = fixtureFiles.flatMap((filePath) => {
      try {
        const fixtures = parseFixtureFile(filePath);
        // Update filePath to be relative
        return fixtures.map((f) => ({
          ...f,
          filePath: path.relative(projectInfo.rootDir, f.filePath),
        }));
      } catch (err: any) {
        console.error(`Failed to parse fixture file ${filePath}:`, err.message);
        return [];
      }
    });

    res.json({
      builtIn,
      custom,
      fixtureFiles: fixtureFiles.map((f) => path.relative(projectInfo.rootDir, f)),
      total: builtIn.length + custom.length,
    });
  });

  return router;
}
