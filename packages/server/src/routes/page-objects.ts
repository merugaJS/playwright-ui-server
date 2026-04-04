import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { parsePageObjectFile, scanPageObjectFiles, generatePageObjectFile } from '@playwright-server/core';
import type { ProjectInfo, PageObjectFileInfo } from '../project-scanner.js';
import { markSelfEdit } from '../watcher.js';

export function createPageObjectsRouter(projectInfo: ProjectInfo): Router {
  const router = Router();

  // List all discovered page object files
  router.get('/', (_req, res) => {
    // Parse each page object to return summary info
    const pageObjects = projectInfo.pageObjectFiles.map((f) => {
      try {
        const absolutePath = path.resolve(projectInfo.rootDir, f.filePath);
        const po = parsePageObjectFile(absolutePath);
        if (!po) {
          throw new Error('Not a recognizable page object');
        }
        po.filePath = f.filePath;
        po.id = f.id;
        return {
          id: f.id,
          filePath: f.filePath,
          fileName: f.fileName,
          directory: f.directory,
          name: po.name,
          locatorCount: po.locators.length,
          methodCount: po.methods.length,
        };
      } catch {
        return {
          id: f.id,
          filePath: f.filePath,
          fileName: f.fileName,
          directory: f.directory,
          name: f.fileName.replace(/\.(page|po)\.(ts|js)$/, '').replace(/\.(ts|js)$/, ''),
          locatorCount: 0,
          methodCount: 0,
          parseError: true,
        };
      }
    });

    res.json({
      files: pageObjects,
      total: pageObjects.length,
    });
  });

  // Get a single page object's parsed model
  router.get('/:id', (req, res) => {
    const file = projectInfo.pageObjectFiles.find((f) => f.id === req.params.id);
    if (!file) {
      res.status(404).json({ error: 'Page object file not found' });
      return;
    }

    try {
      const absolutePath = path.resolve(projectInfo.rootDir, file.filePath);
      const po = parsePageObjectFile(absolutePath);
      if (!po) {
        res.status(422).json({
          error: 'File does not contain a recognizable page object class',
          filePath: file.filePath,
        });
        return;
      }
      po.filePath = file.filePath;
      po.id = file.id;
      res.json(po);
    } catch (err: any) {
      res.status(500).json({
        error: 'Failed to parse page object file',
        message: err.message,
        filePath: file.filePath,
      });
    }
  });

  // Update a page object from the UI editor
  router.put('/:id', (req, res) => {
    const file = projectInfo.pageObjectFiles.find((f) => f.id === req.params.id);
    if (!file) {
      res.status(404).json({ error: 'Page object file not found' });
      return;
    }

    try {
      const pageObject = req.body;
      const code = generatePageObjectFile(pageObject);
      const absolutePath = path.resolve(projectInfo.rootDir, file.filePath);
      markSelfEdit(absolutePath);
      fs.writeFileSync(absolutePath, code, 'utf-8');

      // Re-parse to return canonical model
      const updated = parsePageObjectFile(absolutePath);
      if (!updated) {
        res.status(500).json({ error: 'Failed to re-parse saved page object', filePath: file.filePath });
        return;
      }
      updated.filePath = file.filePath;
      updated.id = file.id;
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({
        error: 'Failed to save page object',
        message: err.message,
        filePath: file.filePath,
      });
    }
  });

  // Create a new page object
  router.post('/', (req, res) => {
    try {
      const { name, directory } = req.body;
      if (!name) {
        res.status(400).json({ error: 'Name is required' });
        return;
      }

      // Convert class name to file name: LoginPage -> login.page.ts
      const fileName = name
        .replace(/Page$/, '')
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .toLowerCase() + '.page.ts';

      const dir = directory || 'pages';
      const relativePath = path.join(dir, fileName);
      const absolutePath = path.resolve(projectInfo.rootDir, relativePath);

      // Ensure directory exists
      const dirPath = path.dirname(absolutePath);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }

      // Check if file already exists
      if (fs.existsSync(absolutePath)) {
        res.status(409).json({ error: 'Page object file already exists' });
        return;
      }

      // Generate initial page object
      const pageObject = {
        id: '',
        filePath: relativePath,
        name: name.endsWith('Page') ? name : name + 'Page',
        locators: [],
        methods: [],
      };

      const code = generatePageObjectFile(pageObject);
      markSelfEdit(absolutePath);
      fs.writeFileSync(absolutePath, code, 'utf-8');

      // Add to project info
      const id = Buffer.from(relativePath).toString('base64url');
      const newFile: PageObjectFileInfo = {
        id,
        filePath: relativePath,
        fileName,
        directory: dir,
      };
      projectInfo.pageObjectFiles.push(newFile);
      projectInfo.pageObjectFiles.sort((a, b) => a.filePath.localeCompare(b.filePath));

      // Parse and return
      const parsed = parsePageObjectFile(absolutePath);
      if (parsed) {
        parsed.filePath = relativePath;
        parsed.id = id;
        res.status(201).json(parsed);
      } else {
        // File was created but couldn't be parsed back — return basic info
        res.status(201).json({ id, filePath: relativePath, name: pageObject.name, locators: [], methods: [] });
      }
    } catch (err: any) {
      res.status(500).json({
        error: 'Failed to create page object',
        message: err.message,
      });
    }
  });

  // Delete a page object
  router.delete('/:id', (req, res) => {
    const file = projectInfo.pageObjectFiles.find((f) => f.id === req.params.id);
    if (!file) {
      res.status(404).json({ error: 'Page object file not found' });
      return;
    }

    try {
      const absolutePath = path.resolve(projectInfo.rootDir, file.filePath);
      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
      }

      // Remove from project info
      projectInfo.pageObjectFiles = projectInfo.pageObjectFiles.filter((f) => f.id !== req.params.id);

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({
        error: 'Failed to delete page object',
        message: err.message,
      });
    }
  });

  return router;
}
