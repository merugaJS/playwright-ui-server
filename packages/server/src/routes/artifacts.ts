import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { ProjectInfo } from '../project-scanner.js';

export function createArtifactsRouter(projectInfo: ProjectInfo): Router {
  const router = Router();

  /**
   * GET /api/artifacts/screenshot?path=<relative-path>
   * Serves a screenshot image file from the project's test-results directory.
   */
  router.get('/screenshot', (req, res) => {
    const relativePath = req.query.path as string;
    if (!relativePath) {
      res.status(400).json({ error: 'Missing "path" query parameter' });
      return;
    }

    // Resolve the full path and ensure it's within the project root
    const fullPath = path.resolve(projectInfo.rootDir, relativePath);
    if (!fullPath.startsWith(projectInfo.rootDir)) {
      res.status(403).json({ error: 'Path traversal not allowed' });
      return;
    }

    // Ensure the file is within the test-results directory
    const testResultsDir = path.join(projectInfo.rootDir, 'test-results');
    if (!fullPath.startsWith(testResultsDir)) {
      res.status(403).json({ error: 'Only files within test-results/ can be served' });
      return;
    }

    if (!fs.existsSync(fullPath)) {
      res.status(404).json({ error: 'Screenshot file not found', path: relativePath });
      return;
    }

    // Determine content type
    const ext = path.extname(fullPath).toLowerCase();
    const contentTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
    };
    const contentType = contentTypes[ext] ?? 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-cache');
    fs.createReadStream(fullPath).pipe(res);
  });

  /**
   * POST /api/artifacts/trace
   * Launches the Playwright Trace Viewer for a given trace file.
   * Body: { path: "test-results/.../trace.zip" }
   */
  router.post('/trace', (req, res) => {
    const { path: relativePath } = req.body;
    if (!relativePath || typeof relativePath !== 'string') {
      res.status(400).json({ error: 'Missing "path" in request body' });
      return;
    }

    const fullPath = path.resolve(projectInfo.rootDir, relativePath);
    if (!fullPath.startsWith(projectInfo.rootDir)) {
      res.status(403).json({ error: 'Path traversal not allowed' });
      return;
    }

    if (!fs.existsSync(fullPath)) {
      res.status(404).json({ error: 'Trace file not found', path: relativePath });
      return;
    }

    // Spawn the trace viewer process (detached so it runs independently)
    try {
      const child = spawn('npx', ['playwright', 'show-trace', fullPath], {
        cwd: projectInfo.rootDir,
        shell: true,
        detached: true,
        stdio: 'ignore',
      });
      child.unref();

      res.json({ status: 'launched', path: relativePath });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to launch trace viewer', message: err.message });
    }
  });

  return router;
}
