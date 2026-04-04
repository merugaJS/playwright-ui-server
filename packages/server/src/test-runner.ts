import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { broadcast } from './ws.js';
import type { RunHistoryService, RunResult } from './run-history.js';

let activeProcess: ChildProcess | null = null;
let historyService: RunHistoryService | null = null;

/**
 * Set the run history service instance (called during app initialization).
 */
export function setRunHistoryService(service: RunHistoryService): void {
  historyService = service;
}

export interface RunTestOptions {
  rootDir: string;
  testFile?: string;   // Relative path to run a specific test file
  testName?: string;   // Grep pattern to run a specific test by name
  project?: string;    // Playwright project name (e.g., 'chromium')
  headed?: boolean;    // Run in headed mode
  workers?: number;    // Number of parallel workers
}

/**
 * Run Playwright tests and stream output via WebSocket.
 */
export function runTests(options: RunTestOptions): { pid: number } {
  // Kill any existing test run
  if (activeProcess) {
    killActiveProcess();
  }

  const args = buildPlaywrightArgs(options);

  broadcast({
    type: 'testRun:started',
    payload: {
      command: `npx playwright test ${args.join(' ')}`,
      testFile: options.testFile,
      testName: options.testName,
    },
  });

  const child = spawn('npx', ['playwright', 'test', ...args], {
    cwd: options.rootDir,
    shell: true,
    env: {
      ...process.env,
      FORCE_COLOR: '0', // Disable color codes for cleaner output
    },
  });

  activeProcess = child;
  const pid = child.pid ?? 0;

  let stdout = '';
  let stderr = '';

  child.stdout?.on('data', (data: Buffer) => {
    const text = data.toString();
    stdout += text;
    broadcast({
      type: 'testRun:output',
      payload: { stream: 'stdout', text, pid },
    });
  });

  child.stderr?.on('data', (data: Buffer) => {
    const text = data.toString();
    stderr += text;
    broadcast({
      type: 'testRun:output',
      payload: { stream: 'stderr', text, pid },
    });
  });

  const startTime = Date.now();

  child.on('close', (code) => {
    activeProcess = null;
    const durationMs = Date.now() - startTime;
    const passed = code === 0;

    // Scan for failure artifacts (screenshots and traces)
    const artifacts = !passed
      ? scanTestArtifacts(options.rootDir, options.testFile)
      : { screenshots: [], traceFile: undefined };

    broadcast({
      type: 'testRun:finished',
      payload: {
        pid,
        exitCode: code ?? 1,
        stdout,
        stderr,
        passed,
        screenshots: artifacts.screenshots,
        traceFile: artifacts.traceFile,
      },
    });

    // Record result in run history
    if (historyService && options.testFile) {
      const errorMessage = !passed ? extractErrorSummary(stderr || stdout) : undefined;
      const result: RunResult = {
        timestamp: Date.now(),
        status: passed ? 'passed' : 'failed',
        durationMs,
        errorMessage,
        testFilePath: options.testFile,
        screenshots: artifacts.screenshots.length > 0 ? artifacts.screenshots : undefined,
        traceFile: artifacts.traceFile,
      };
      historyService.recordResult(result);
    }
  });

  child.on('error', (err) => {
    activeProcess = null;
    broadcast({
      type: 'testRun:error',
      payload: {
        pid,
        message: err.message,
      },
    });
  });

  return { pid };
}

/**
 * Stop the currently running test process.
 */
export function stopTests(): boolean {
  if (!activeProcess) return false;
  killActiveProcess();
  return true;
}

/**
 * Check if tests are currently running.
 */
export function isRunning(): boolean {
  return activeProcess !== null;
}

function killActiveProcess(): void {
  if (!activeProcess) return;
  try {
    // Kill the process group to ensure all child processes are killed
    if (activeProcess.pid) {
      process.kill(-activeProcess.pid, 'SIGTERM');
    } else {
      activeProcess.kill('SIGTERM');
    }
  } catch {
    try {
      activeProcess.kill('SIGKILL');
    } catch {
      // already dead
    }
  }
  activeProcess = null;

  broadcast({
    type: 'testRun:stopped',
    payload: {},
  });
}

/**
 * Extract a short error summary from test output (max 500 chars).
 */
function extractErrorSummary(output: string): string {
  // Look for common Playwright error patterns
  const lines = output.split('\n');
  const errorLines: string[] = [];
  let capturing = false;

  for (const line of lines) {
    if (/Error:|FAIL|expect\(/.test(line)) {
      capturing = true;
    }
    if (capturing) {
      errorLines.push(line.trim());
      if (errorLines.length >= 10) break;
    }
  }

  const summary = errorLines.length > 0 ? errorLines.join('\n') : output.slice(0, 500);
  return summary.slice(0, 500);
}

/**
 * Scan the test-results directory for screenshots and trace files
 * produced by a failed test run.
 */
function scanTestArtifacts(
  rootDir: string,
  testFile?: string,
): { screenshots: string[]; traceFile: string | undefined } {
  const screenshots: string[] = [];
  let traceFile: string | undefined;

  const testResultsDir = path.join(rootDir, 'test-results');
  if (!fs.existsSync(testResultsDir)) {
    return { screenshots, traceFile };
  }

  try {
    const entries = fs.readdirSync(testResultsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      // If a specific test file was run, try to match the directory name
      // Playwright names result dirs like "test-name-browser" based on the test
      const dirPath = path.join(testResultsDir, entry.name);

      // If we have a test file filter, match against the directory name
      if (testFile) {
        const testBaseName = path.basename(testFile, path.extname(testFile))
          .replace(/\.spec$/, '')
          .replace(/\.test$/, '');
        // Playwright result dir names contain the test file base name (with dashes)
        const normalizedDirName = entry.name.toLowerCase();
        const normalizedTestName = testBaseName.toLowerCase().replace(/[^a-z0-9]/g, '-');
        if (!normalizedDirName.includes(normalizedTestName)) continue;
      }

      // Scan for screenshots and traces within this directory
      try {
        const files = fs.readdirSync(dirPath);
        for (const file of files) {
          const filePath = path.join(dirPath, file);
          const relativePath = path.relative(rootDir, filePath);

          if (/\.(png|jpg|jpeg)$/i.test(file)) {
            screenshots.push(relativePath);
          } else if (file === 'trace.zip' && !traceFile) {
            traceFile = relativePath;
          }
        }
      } catch {
        // Directory unreadable — skip
      }
    }
  } catch {
    // test-results directory unreadable
  }

  // Sort screenshots by name for consistent ordering
  screenshots.sort();
  return { screenshots, traceFile };
}

function buildPlaywrightArgs(options: RunTestOptions): string[] {
  const args: string[] = [];

  // Specific test file
  if (options.testFile) {
    args.push(options.testFile);
  }

  // Grep by test name — escape regex chars and use exact boundary match
  if (options.testName) {
    const escaped = options.testName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    args.push('--grep', escaped);
  }

  // Project (browser)
  if (options.project) {
    args.push('--project', options.project);
  }

  // Headed mode
  if (options.headed) {
    args.push('--headed');
  }

  // Workers
  if (options.workers !== undefined) {
    args.push('--workers', String(options.workers));
  }

  // Reporter for cleaner output
  args.push('--reporter', 'list');

  return args;
}
