import chokidar, { type FSWatcher } from 'chokidar';
import { EventEmitter } from 'node:events';

export interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink';
  filePath: string;
  timestamp: number;
}

export interface BatchedFileChangeEvent {
  type: 'file-changes';
  changes: FileChangeEvent[];
  timestamp: number;
}

/**
 * Debounced file watcher that batches rapid file system changes.
 *
 * - Watches for `.spec.ts`, `.test.ts`, `.spec.js`, `.test.js` files
 * - Per-file debounce: rapid changes to the same file within `perFileDebounceMs`
 *   produce only one event
 * - Batch window: all events within `batchWindowMs` are emitted as a single batch
 * - Ignores `node_modules/`, `.git/`, `dist/`, `test-results/`
 */
export class FileWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private batchTimer: NodeJS.Timeout | null = null;
  private perFileTimers: Map<string, NodeJS.Timeout> = new Map();
  /** Events waiting for per-file debounce to expire (not yet enqueued). */
  private debouncingEvents: Map<string, FileChangeEvent> = new Map();
  private pendingChanges: Map<string, FileChangeEvent> = new Map();
  private readonly batchWindowMs: number;
  private readonly perFileDebounceMs: number;

  constructor(options?: { batchWindowMs?: number; perFileDebounceMs?: number }) {
    super();
    this.batchWindowMs = options?.batchWindowMs ?? 300;
    this.perFileDebounceMs = options?.perFileDebounceMs ?? 500;
  }

  /**
   * Start watching a directory for test file changes.
   */
  start(dir: string): void {
    if (this.watcher) {
      throw new Error('FileWatcher is already started. Call stop() first.');
    }

    this.watcher = chokidar.watch(dir, {
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/test-results/**',
      ],
      persistent: true,
      ignoreInitial: true,
    });

    this.watcher.on('add', (filePath) => this.handleEvent('add', filePath));
    this.watcher.on('change', (filePath) => this.handleEvent('change', filePath));
    this.watcher.on('unlink', (filePath) => this.handleEvent('unlink', filePath));
  }

  /**
   * Stop watching and clean up all timers.
   */
  stop(): void {
    // Clear per-file debounce timers and promote debouncing events to pending
    for (const timer of this.perFileTimers.values()) {
      clearTimeout(timer);
    }
    this.perFileTimers.clear();

    // Move any debouncing events into pendingChanges so they get flushed
    for (const [filePath, event] of this.debouncingEvents) {
      this.pendingChanges.set(filePath, event);
    }
    this.debouncingEvents.clear();

    // Clear batch timer
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    // Flush any pending changes before stopping
    if (this.pendingChanges.size > 0) {
      this.flush();
    }

    // Close chokidar watcher
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }

  private handleEvent(type: FileChangeEvent['type'], filePath: string): void {
    // Only handle test files
    if (!isTestFile(filePath)) return;

    // Per-file debounce: if the same file fires multiple times within the
    // debounce window, only the last event wins.
    const existingTimer = this.perFileTimers.get(filePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Track the latest event for this file so stop() can flush it
    this.debouncingEvents.set(filePath, { type, filePath, timestamp: Date.now() });

    const timer = setTimeout(() => {
      this.perFileTimers.delete(filePath);
      const event = this.debouncingEvents.get(filePath);
      this.debouncingEvents.delete(filePath);
      if (event) {
        this.enqueue(event);
      }
    }, this.perFileDebounceMs);

    this.perFileTimers.set(filePath, timer);
  }

  /**
   * Add a change to the pending batch and (re)start the batch window timer.
   */
  private enqueue(event: FileChangeEvent): void {
    this.pendingChanges.set(event.filePath, event);

    // Reset the batch window timer — batch fires `batchWindowMs` after the
    // last enqueue, so rapid file changes keep extending the window.
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }
    this.batchTimer = setTimeout(() => this.flush(), this.batchWindowMs);
  }

  /**
   * Emit all pending changes as a single batched event.
   */
  private flush(): void {
    const changes = Array.from(this.pendingChanges.values());
    this.pendingChanges.clear();
    this.batchTimer = null;

    if (changes.length > 0) {
      const batch: BatchedFileChangeEvent = {
        type: 'file-changes',
        changes,
        timestamp: Date.now(),
      };
      this.emit('changes', batch);
    }
  }
}

function isTestFile(filePath: string): boolean {
  return /\.(spec|test)\.(ts|js)$/.test(filePath);
}
