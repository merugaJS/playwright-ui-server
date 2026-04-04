import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { parseTestFile, generateTestFile } from '@playwright-server/core';
import type { ProjectInfo } from '../project-scanner.js';
import { markSelfEdit } from '../watcher.js';
import { flowCache, computeContentHash } from '../flow-cache.js';

export function createTestsRouter(projectInfo: ProjectInfo): Router {
  const router = Router();

  // List all discovered test files (lightweight metadata only — no parsing)
  router.get('/', (_req, res) => {
    res.json({
      testDir: projectInfo.config.testDir,
      files: projectInfo.testFiles,
      total: projectInfo.testFiles.length,
    });
  });

  // Get a single test file's parsed TestFlow (on-demand, with caching)
  router.get('/:id', (req, res) => {
    const file = projectInfo.testFiles.find(f => f.id === req.params.id);
    if (!file) {
      res.status(404).json({ error: 'Test file not found' });
      return;
    }

    try {
      const absolutePath = path.resolve(projectInfo.rootDir, file.filePath);
      const contentHash = computeContentHash(absolutePath);

      // Check cache first
      const cached = flowCache.get(absolutePath, contentHash);
      if (cached) {
        res.json(cached);
        return;
      }

      // Parse on demand
      const testFlow = parseTestFile(absolutePath);
      testFlow.filePath = file.filePath;
      testFlow.id = file.id;

      // Cache the result
      flowCache.set(absolutePath, contentHash, testFlow);

      res.json(testFlow);
    } catch (err: any) {
      res.status(500).json({
        error: 'Failed to parse test file',
        message: err.message,
        filePath: file.filePath,
      });
    }
  });

  // Update a test file from visual editor changes
  router.put('/:id', (req, res) => {
    const file = projectInfo.testFiles.find(f => f.id === req.params.id);
    if (!file) {
      res.status(404).json({ error: 'Test file not found' });
      return;
    }

    try {
      const testFlow = req.body;
      const code = generateTestFile(testFlow);
      const absolutePath = path.resolve(projectInfo.rootDir, file.filePath);
      markSelfEdit(absolutePath);
      fs.writeFileSync(absolutePath, code, 'utf-8');

      // Invalidate stale cache entry
      flowCache.invalidate(absolutePath);

      // Re-parse to return the canonical model with updated hash
      const updated = parseTestFile(absolutePath);
      updated.filePath = file.filePath;
      updated.id = file.id;

      // Cache the freshly parsed result
      const contentHash = computeContentHash(absolutePath);
      flowCache.set(absolutePath, contentHash, updated);

      res.json(updated);
    } catch (err: any) {
      res.status(500).json({
        error: 'Failed to save test file',
        message: err.message,
        filePath: file.filePath,
      });
    }
  });

  // Delete a test file
  router.delete('/:id', (req, res) => {
    const fileIndex = projectInfo.testFiles.findIndex(f => f.id === req.params.id);
    if (fileIndex === -1) {
      res.status(404).json({ error: 'Test file not found' });
      return;
    }

    try {
      const file = projectInfo.testFiles[fileIndex];
      const absolutePath = path.resolve(projectInfo.rootDir, file.filePath);
      markSelfEdit(absolutePath);

      // Invalidate cache before deleting
      flowCache.invalidate(absolutePath);

      fs.unlinkSync(absolutePath);
      projectInfo.testFiles.splice(fileIndex, 1);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({
        error: 'Failed to delete test file',
        message: err.message,
      });
    }
  });

  return router;
}
