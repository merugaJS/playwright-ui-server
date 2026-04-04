import fs from 'node:fs';
import path from 'node:path';
import { watch } from 'chokidar';
import { parsePageObjectFile } from '@playwright-server/core';
import { broadcast } from './ws.js';
import { discoverPageObjectDirs } from './project-scanner.js';
import type { ProjectInfo, TestFileInfo, PageObjectFileInfo } from './project-scanner.js';
import { flowCache } from './flow-cache.js';

// Paths currently being written by the server (self-edit suppression)
const selfEditPaths = new Set<string>();
const SELF_EDIT_TIMEOUT = 1500;

/**
 * Mark a path as being written by the server so the watcher ignores it.
 */
export function markSelfEdit(absolutePath: string): void {
  selfEditPaths.add(absolutePath);
  setTimeout(() => selfEditPaths.delete(absolutePath), SELF_EDIT_TIMEOUT);
}

/**
 * Start watching the test directory and page object directories for external changes.
 */
export function startWatcher(projectInfo: ProjectInfo): void {
  const testDir = path.resolve(projectInfo.rootDir, projectInfo.config.testDir);

  // Collect all directories to watch
  const watchDirs = [testDir];
  const pageDirs = discoverPageObjectDirs(projectInfo.rootDir);
  for (const fullDir of pageDirs) {
    // Only add if it isn't already covered by testDir
    if (!fullDir.startsWith(testDir)) {
      watchDirs.push(fullDir);
    }
  }

  const watcher = watch(watchDirs, {
    ignored: /(node_modules|\.git)/,
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 300,
      pollInterval: 100,
    },
  });

  watcher.on('change', (filePath) => {
    if (isPageObjectFile(filePath)) {
      handlePageObjectChange(filePath, projectInfo);
    } else {
      handleFileChange(filePath, projectInfo);
    }
  });

  watcher.on('add', (filePath) => {
    if (isPageObjectFile(filePath)) {
      handlePageObjectAdd(filePath, projectInfo);
    } else {
      handleFileAdd(filePath, projectInfo);
    }
  });

  watcher.on('unlink', (filePath) => {
    if (isPageObjectFile(filePath)) {
      handlePageObjectDelete(filePath, projectInfo);
    } else {
      handleFileDelete(filePath, projectInfo);
    }
  });
}

function handleFileChange(filePath: string, projectInfo: ProjectInfo): void {
  const absolutePath = path.resolve(filePath);

  // Self-edit suppression
  if (selfEditPaths.has(absolutePath)) {
    return;
  }

  // Only handle test files
  if (!isTestFile(filePath)) return;

  const relativePath = path.relative(projectInfo.rootDir, absolutePath);
  const fileId = Buffer.from(relativePath).toString('base64url');

  // Invalidate the cached flow — it will be re-parsed on next request
  flowCache.invalidate(absolutePath);

  // Update file metadata if the file still exists
  const fileInfo = projectInfo.testFiles.find(f => f.id === fileId);
  if (fileInfo && fs.existsSync(absolutePath)) {
    const stat = fs.statSync(absolutePath);
    fileInfo.size = stat.size;
    fileInfo.lastModified = stat.mtimeMs;
  }

  broadcast({
    type: 'file:changed',
    payload: { fileId },
  });
}

function handleFileAdd(filePath: string, projectInfo: ProjectInfo): void {
  if (!isTestFile(filePath)) return;

  const absolutePath = path.resolve(filePath);
  const relativePath = path.relative(projectInfo.rootDir, absolutePath);
  const fileId = Buffer.from(relativePath).toString('base64url');
  const fileName = path.basename(relativePath);
  const directory = path.dirname(relativePath);

  const stat = fs.statSync(absolutePath);
  const newFile: TestFileInfo = {
    id: fileId,
    filePath: relativePath,
    fileName,
    directory,
    size: stat.size,
    lastModified: stat.mtimeMs,
  };

  // Add to project info if not already there
  if (!projectInfo.testFiles.find(f => f.id === fileId)) {
    projectInfo.testFiles.push(newFile);
    projectInfo.testFiles.sort((a, b) => a.filePath.localeCompare(b.filePath));
  }

  broadcast({
    type: 'file:created',
    payload: { fileId, file: newFile },
  });
}

function handleFileDelete(filePath: string, projectInfo: ProjectInfo): void {
  if (!isTestFile(filePath)) return;

  const absolutePath = path.resolve(filePath);
  const relativePath = path.relative(projectInfo.rootDir, absolutePath);
  const fileId = Buffer.from(relativePath).toString('base64url');

  // Invalidate cache for the deleted file
  flowCache.invalidate(absolutePath);

  // Remove from project info
  projectInfo.testFiles = projectInfo.testFiles.filter(f => f.id !== fileId);

  broadcast({
    type: 'file:deleted',
    payload: { fileId },
  });
}

function isTestFile(filePath: string): boolean {
  return /\.(spec|test)\.(ts|js)$/.test(filePath);
}

function isPageObjectFile(filePath: string): boolean {
  return /\.(page|po)\.(ts|js)$/.test(filePath);
}

// ─── Page Object Handlers ────────────────────────────────────────────

function handlePageObjectChange(filePath: string, projectInfo: ProjectInfo): void {
  const absolutePath = path.resolve(filePath);

  if (selfEditPaths.has(absolutePath)) return;

  const relativePath = path.relative(projectInfo.rootDir, absolutePath);
  const fileId = Buffer.from(relativePath).toString('base64url');

  try {
    const pageObject = parsePageObjectFile(absolutePath);
    if (!pageObject) return;
    pageObject.filePath = relativePath;
    pageObject.id = fileId;

    broadcast({
      type: 'pageObject:changed',
      payload: { fileId, pageObject },
    });
  } catch (err: any) {
    console.error(`Watcher: failed to parse page object ${relativePath}:`, err.message);
  }
}

function handlePageObjectAdd(filePath: string, projectInfo: ProjectInfo): void {
  const absolutePath = path.resolve(filePath);
  const relativePath = path.relative(projectInfo.rootDir, absolutePath);
  const fileId = Buffer.from(relativePath).toString('base64url');
  const fileName = path.basename(relativePath);
  const directory = path.dirname(relativePath);

  const newFile: PageObjectFileInfo = { id: fileId, filePath: relativePath, fileName, directory };

  if (!projectInfo.pageObjectFiles.find((f) => f.id === fileId)) {
    projectInfo.pageObjectFiles.push(newFile);
    projectInfo.pageObjectFiles.sort((a, b) => a.filePath.localeCompare(b.filePath));
  }

  broadcast({
    type: 'pageObject:created',
    payload: { fileId, file: newFile },
  });
}

function handlePageObjectDelete(filePath: string, projectInfo: ProjectInfo): void {
  const absolutePath = path.resolve(filePath);
  const relativePath = path.relative(projectInfo.rootDir, absolutePath);
  const fileId = Buffer.from(relativePath).toString('base64url');

  projectInfo.pageObjectFiles = projectInfo.pageObjectFiles.filter((f) => f.id !== fileId);

  broadcast({
    type: 'pageObject:deleted',
    payload: { fileId },
  });
}
