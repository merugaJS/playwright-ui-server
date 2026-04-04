import fs from 'node:fs';
import path from 'node:path';
import { parsePlaywrightConfig, type PlaywrightConfig } from '@playwright-server/core';

export interface TestFileInfo {
  id: string;
  filePath: string; // Relative to project root
  fileName: string;
  directory: string; // Relative directory
  size: number; // File size in bytes
  lastModified: number; // Last modified timestamp (ms since epoch)
}

export interface PageObjectFileInfo {
  id: string;
  filePath: string; // Relative to project root
  fileName: string;
  directory: string;
}

export interface ProjectInfo {
  rootDir: string;
  configPath: string | null;
  config: PlaywrightConfig;
  testFiles: TestFileInfo[];
  pageObjectFiles: PageObjectFileInfo[];
}

/**
 * Scan a project directory for Playwright config and test files.
 */
export function scanProject(projectDir: string): ProjectInfo {
  const rootDir = path.resolve(projectDir);

  // Find playwright config
  const configPath = findConfig(rootDir);
  const config = configPath ? parsePlaywrightConfig(configPath) : { testDir: './tests' };

  // Discover test files
  const testDir = path.resolve(rootDir, config.testDir);
  const testFiles = discoverTestFiles(rootDir, testDir, config.testMatch);

  // Discover page object files
  const pageObjectFiles = discoverPageObjectFiles(rootDir);

  return {
    rootDir,
    configPath,
    config,
    testFiles,
    pageObjectFiles,
  };
}

function findConfig(rootDir: string): string | null {
  const candidates = [
    'playwright.config.ts',
    'playwright.config.js',
    'playwright.config.mjs',
  ];
  for (const candidate of candidates) {
    const fullPath = path.join(rootDir, candidate);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }
  return null;
}

function discoverTestFiles(
  rootDir: string,
  testDir: string,
  testMatch?: string | string[],
): TestFileInfo[] {
  if (!fs.existsSync(testDir)) {
    return [];
  }

  const patterns = normalizeTestMatch(testMatch);
  const files: TestFileInfo[] = [];

  walkDir(testDir, (filePath) => {
    const relativePath = path.relative(rootDir, filePath);
    const fileName = path.basename(filePath);

    if (matchesTestPattern(fileName, patterns)) {
      const stat = fs.statSync(filePath);
      files.push({
        id: Buffer.from(relativePath).toString('base64url'),
        filePath: relativePath,
        fileName,
        directory: path.dirname(relativePath),
        size: stat.size,
        lastModified: stat.mtimeMs,
      });
    }
  });

  return files.sort((a, b) => a.filePath.localeCompare(b.filePath));
}

function normalizeTestMatch(testMatch?: string | string[]): RegExp[] {
  if (!testMatch) {
    // Default Playwright test file patterns
    return [
      /\.spec\.ts$/,
      /\.spec\.js$/,
      /\.test\.ts$/,
      /\.test\.js$/,
    ];
  }

  const patterns = Array.isArray(testMatch) ? testMatch : [testMatch];
  return patterns.map(p => {
    // Convert glob-like pattern to regex
    const escaped = p
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(escaped);
  });
}

function matchesTestPattern(fileName: string, patterns: RegExp[]): boolean {
  return patterns.some(p => p.test(fileName));
}

function walkDir(dir: string, callback: (filePath: string) => void): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      walkDir(fullPath, callback);
    } else if (entry.isFile()) {
      callback(fullPath);
    }
  }
}

/** Well-known directory names that typically contain page object files. */
const PAGE_OBJECT_DIR_NAMES = ['pages', 'page-objects', 'pom', 'page_objects', 'models'];

/**
 * Find directories under `rootDir` that are likely to contain page objects.
 * Checks for well-known names (pages/, page-objects/, pom/, models/) and
 * only includes `models/` if it contains at least one .ts class file.
 */
export function discoverPageObjectDirs(rootDir: string): string[] {
  const dirs: string[] = [];

  for (const dirName of PAGE_OBJECT_DIR_NAMES) {
    const fullDir = path.join(rootDir, dirName);
    if (!fs.existsSync(fullDir) || !fs.statSync(fullDir).isDirectory()) continue;

    // For 'models/' we require at least one .ts file that looks like it contains a class
    if (dirName === 'models') {
      if (dirContainsTsClassFiles(fullDir)) {
        dirs.push(fullDir);
      }
    } else {
      dirs.push(fullDir);
    }
  }

  return dirs;
}

/**
 * Check whether a directory (recursively) contains at least one .ts file
 * with a class declaration.
 */
function dirContainsTsClassFiles(dir: string): boolean {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
      if (dirContainsTsClassFiles(fullPath)) return true;
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      if (/\bclass\s+\w+/.test(content)) return true;
    }
  }
  return false;
}

/**
 * Discover page object files by scanning common directories.
 * Page objects are typically in pages/, page-objects/, or pom/ directories,
 * or any .page.ts file in the project.
 */
export function discoverPageObjectFiles(rootDir: string): PageObjectFileInfo[] {
  const files: PageObjectFileInfo[] = [];

  // Scan known page object directories at root level
  const pageDirs = discoverPageObjectDirs(rootDir);
  for (const fullDir of pageDirs) {
    if (fs.existsSync(fullDir)) {
      walkDir(fullDir, (filePath) => {
        if (isPageObjectFile(filePath)) {
          addPageObjectFile(files, rootDir, filePath);
        }
      });
    }
  }

  // Also scan inside the test dir for page object subdirectories (e.g., tests/pages/)
  const testDir = path.join(rootDir, 'tests');
  if (fs.existsSync(testDir)) {
    // Check for known PO directory names inside testDir
    for (const dirName of PAGE_OBJECT_DIR_NAMES) {
      const poDir = path.join(testDir, dirName);
      if (fs.existsSync(poDir) && fs.statSync(poDir).isDirectory()) {
        walkDir(poDir, (filePath) => {
          if (isPageObjectFile(filePath)) {
            addPageObjectFile(files, rootDir, filePath);
          }
        });
      }
    }
    // Also pick up *.page.ts files co-located with tests
    walkDir(testDir, (filePath) => {
      if (filePath.endsWith('.page.ts') || filePath.endsWith('.page.js')) {
        addPageObjectFile(files, rootDir, filePath);
      }
    });
  }

  // Scan src/ directory too
  const srcDir = path.join(rootDir, 'src');
  if (fs.existsSync(srcDir)) {
    for (const dirName of PAGE_OBJECT_DIR_NAMES) {
      const poDir = path.join(srcDir, dirName);
      if (fs.existsSync(poDir) && fs.statSync(poDir).isDirectory()) {
        walkDir(poDir, (filePath) => {
          if (isPageObjectFile(filePath)) {
            addPageObjectFile(files, rootDir, filePath);
          }
        });
      }
    }
  }

  return files.sort((a, b) => a.filePath.localeCompare(b.filePath));
}

function isPageObjectFile(filePath: string): boolean {
  const fileName = path.basename(filePath);
  // Match *.page.ts, *.page.js, or any .ts/.js file in page object directories
  return /\.(page|po)\.(ts|js)$/.test(fileName) || /\.(ts|js)$/.test(fileName);
}

function addPageObjectFile(
  files: PageObjectFileInfo[],
  rootDir: string,
  filePath: string,
): void {
  const relativePath = path.relative(rootDir, filePath);
  const id = Buffer.from(relativePath).toString('base64url');

  // Avoid duplicates
  if (files.some((f) => f.id === id)) return;

  files.push({
    id,
    filePath: relativePath,
    fileName: path.basename(filePath),
    directory: path.dirname(relativePath),
  });
}
