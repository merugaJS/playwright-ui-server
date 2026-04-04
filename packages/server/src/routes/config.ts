import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import type { ProjectInfo } from '../project-scanner.js';
import { parsePlaywrightConfig, updatePlaywrightConfig, type PlaywrightConfig } from '@playwright-server/core';

export function createConfigRouter(projectInfo: ProjectInfo): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    // Re-parse config on each request to pick up external changes
    let config = projectInfo.config;
    if (projectInfo.configPath && fs.existsSync(projectInfo.configPath)) {
      try {
        config = parsePlaywrightConfig(projectInfo.configPath);
      } catch {
        // Fall back to cached config
      }
    }

    res.json({
      rootDir: projectInfo.rootDir,
      configPath: projectInfo.configPath,
      config,
    });
  });

  router.put('/', (req, res) => {
    if (!projectInfo.configPath) {
      res.status(400).json({ error: 'No Playwright config file found in this project.' });
      return;
    }

    const updates: PlaywrightConfig = req.body;

    // Validate basic constraints
    const errors: string[] = [];
    if (updates.timeout !== undefined && updates.timeout < 0) {
      errors.push('Timeout must be a non-negative number.');
    }
    if (updates.retries !== undefined && updates.retries < 0) {
      errors.push('Retries must be a non-negative number.');
    }
    if (updates.workers !== undefined && typeof updates.workers === 'number' && updates.workers < 1) {
      errors.push('Workers must be at least 1.');
    }
    if (errors.length > 0) {
      res.status(400).json({ error: errors.join(' ') });
      return;
    }

    try {
      // Create backup
      const backupPath = projectInfo.configPath + '.bak';
      fs.copyFileSync(projectInfo.configPath, backupPath);

      // Use AST-based update
      const newContent = updatePlaywrightConfig(projectInfo.configPath, updates);
      fs.writeFileSync(projectInfo.configPath, newContent, 'utf-8');

      // Update in-memory projectInfo
      projectInfo.config = parsePlaywrightConfig(projectInfo.configPath);

      res.json({
        success: true,
        config: projectInfo.config,
        backupPath: path.relative(projectInfo.rootDir, backupPath),
      });
    } catch (err: any) {
      res.status(500).json({ error: `Failed to update config: ${err.message}` });
    }
  });

  return router;
}
