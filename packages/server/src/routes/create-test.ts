import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { parseTestFile } from '@playwright-server/core';
import type { ProjectInfo, TestFileInfo } from '../project-scanner.js';
import { markSelfEdit } from '../watcher.js';
import { broadcast } from '../ws.js';

export function createNewTestRouter(projectInfo: ProjectInfo): Router {
  const router = Router();

  // Create a new test file
  router.post('/', (req, res) => {
    try {
      const { fileName, describeName, testName } = req.body;

      if (!fileName) {
        res.status(400).json({ error: 'fileName is required' });
        return;
      }

      // Normalize file name
      let normalizedName = fileName;
      if (!normalizedName.endsWith('.spec.ts') && !normalizedName.endsWith('.test.ts')) {
        normalizedName += '.spec.ts';
      }

      const testDir = path.resolve(projectInfo.rootDir, projectInfo.config.testDir);
      const absolutePath = path.join(testDir, normalizedName);
      const relativePath = path.relative(projectInfo.rootDir, absolutePath);

      // Ensure directory exists
      const dirPath = path.dirname(absolutePath);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }

      // Check if file already exists
      if (fs.existsSync(absolutePath)) {
        res.status(409).json({ error: 'Test file already exists' });
        return;
      }

      // Generate test file content
      const describe = describeName || normalizedName.replace(/\.(spec|test)\.ts$/, '').replace(/-/g, ' ');
      const test = testName || 'should work';

      const code = [
        `import { test, expect } from '@playwright/test';`,
        '',
        `test.describe('${describe}', () => {`,
        `  test('${test}', async ({ page }) => {`,
        `    // TODO: Add test steps`,
        `  });`,
        '});',
        '',
      ].join('\n');

      markSelfEdit(absolutePath);
      fs.writeFileSync(absolutePath, code, 'utf-8');

      // Add to project info
      const fileId = Buffer.from(relativePath).toString('base64url');
      const stat = fs.statSync(absolutePath);
      const newFile: TestFileInfo = {
        id: fileId,
        filePath: relativePath,
        fileName: path.basename(normalizedName),
        directory: path.dirname(relativePath),
        size: stat.size,
        lastModified: stat.mtimeMs,
      };

      if (!projectInfo.testFiles.find((f) => f.id === fileId)) {
        projectInfo.testFiles.push(newFile);
        projectInfo.testFiles.sort((a, b) => a.filePath.localeCompare(b.filePath));
      }

      // Broadcast creation
      broadcast({
        type: 'file:created',
        payload: { fileId, file: newFile },
      });

      // Parse and return
      const testFlow = parseTestFile(absolutePath);
      testFlow.filePath = relativePath;
      testFlow.id = fileId;

      res.status(201).json({ file: newFile, testFlow });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to create test file', message: err.message });
    }
  });

  return router;
}
