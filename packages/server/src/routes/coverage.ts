import path from 'node:path';
import { Router } from 'express';
import { parseTestFile, parsePageObjectFile, analyzeCoverage } from '@playwright-server/core';
import type { ProjectInfo } from '../project-scanner.js';
import { flowCache, computeContentHash } from '../flow-cache.js';

export function createCoverageRouter(projectInfo: ProjectInfo): Router {
  const router = Router();

  // GET /api/coverage — compute coverage of page object methods/locators across tests
  router.get('/', (_req, res) => {
    try {
      // Parse all page objects
      const pageObjects = projectInfo.pageObjectFiles
        .map((f) => {
          try {
            const absolutePath = path.resolve(projectInfo.rootDir, f.filePath);
            const po = parsePageObjectFile(absolutePath);
            if (!po) return null;
            po.id = f.id;
            po.filePath = f.filePath;
            return po;
          } catch {
            return null;
          }
        })
        .filter((po): po is NonNullable<typeof po> => po !== null);

      // Parse all test flows (with caching)
      const testFlows = projectInfo.testFiles
        .map((f) => {
          try {
            const absolutePath = path.resolve(projectInfo.rootDir, f.filePath);
            const contentHash = computeContentHash(absolutePath);

            const cached = flowCache.get(absolutePath, contentHash);
            if (cached) return cached;

            const flow = parseTestFile(absolutePath);
            flow.filePath = f.filePath;
            flow.id = f.id;
            flowCache.set(absolutePath, contentHash, flow);
            return flow;
          } catch {
            return null;
          }
        })
        .filter((flow): flow is NonNullable<typeof flow> => flow !== null);

      const report = analyzeCoverage(testFlows, pageObjects);
      res.json(report);
    } catch (err: any) {
      console.error('Coverage error:', err);
      res.status(500).json({
        error: 'Failed to compute coverage',
        message: err.message,
        stack: err.stack,
      });
    }
  });

  return router;
}
