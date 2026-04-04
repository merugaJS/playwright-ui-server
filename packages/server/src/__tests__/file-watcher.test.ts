import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { FileChangeEvent, BatchedFileChangeEvent } from '../file-watcher.js';

// ---------------------------------------------------------------------------
// Mock chokidar — we don't want real FS watching in unit tests.
// The mock returns an EventEmitter we can drive manually.
// ---------------------------------------------------------------------------
class MockFSWatcher extends EventEmitter {
  close = vi.fn();
}

let mockWatcher: MockFSWatcher;

vi.mock('chokidar', () => ({
  default: {
    watch: vi.fn(() => {
      mockWatcher = new MockFSWatcher();
      return mockWatcher;
    }),
  },
}));

// Import after mock is set up
const { FileWatcher } = await import('../file-watcher.js');

describe('FileWatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── helpers ──────────────────────────────────────────────────────────
  function createWatcher(opts?: { batchWindowMs?: number; perFileDebounceMs?: number }) {
    const fw = new FileWatcher(opts);
    fw.start('/fake/dir');
    return fw;
  }

  function collectBatches(fw: InstanceType<typeof FileWatcher>): BatchedFileChangeEvent[] {
    const batches: BatchedFileChangeEvent[] = [];
    fw.on('changes', (batch: BatchedFileChangeEvent) => batches.push(batch));
    return batches;
  }

  // ── Test: emits 'changes' event when a .spec.ts file is added ──────
  it('emits a changes event when a .spec.ts file is added', () => {
    const fw = createWatcher({ perFileDebounceMs: 100, batchWindowMs: 50 });
    const batches = collectBatches(fw);

    mockWatcher.emit('add', '/fake/dir/login.spec.ts');

    // Advance past per-file debounce
    vi.advanceTimersByTime(100);
    // Advance past batch window
    vi.advanceTimersByTime(50);

    expect(batches).toHaveLength(1);
    expect(batches[0].type).toBe('file-changes');
    expect(batches[0].changes).toHaveLength(1);
    expect(batches[0].changes[0].type).toBe('add');
    expect(batches[0].changes[0].filePath).toBe('/fake/dir/login.spec.ts');

    fw.stop();
  });

  // ── Test: emits for .test.ts files too ─────────────────────────────
  it('emits a changes event for .test.ts files', () => {
    const fw = createWatcher({ perFileDebounceMs: 100, batchWindowMs: 50 });
    const batches = collectBatches(fw);

    mockWatcher.emit('change', '/fake/dir/utils.test.ts');

    vi.advanceTimersByTime(150);

    expect(batches).toHaveLength(1);
    expect(batches[0].changes[0].type).toBe('change');

    fw.stop();
  });

  // ── Test: debounces rapid changes to the same file ─────────────────
  it('debounces rapid changes to the same file into a single event', () => {
    const fw = createWatcher({ perFileDebounceMs: 200, batchWindowMs: 100 });
    const batches = collectBatches(fw);

    const file = '/fake/dir/login.spec.ts';

    // Rapid-fire 5 changes at 50ms intervals (all within 200ms debounce)
    mockWatcher.emit('change', file);
    vi.advanceTimersByTime(50);
    mockWatcher.emit('change', file);
    vi.advanceTimersByTime(50);
    mockWatcher.emit('change', file);
    vi.advanceTimersByTime(50);
    mockWatcher.emit('change', file);
    vi.advanceTimersByTime(50);
    mockWatcher.emit('change', file);

    // At this point 200ms have elapsed total. The per-file timer was
    // restarted on each emit, so only the last one's 200ms timer is running.
    // Advance past the debounce (200ms from last emit) + batch window (100ms).
    vi.advanceTimersByTime(300);

    expect(batches).toHaveLength(1);
    expect(batches[0].changes).toHaveLength(1); // Only one entry for the file
    expect(batches[0].changes[0].filePath).toBe(file);
    expect(batches[0].changes[0].type).toBe('change');

    fw.stop();
  });

  // ── Test: ignores non-test files ───────────────────────────────────
  it('ignores non-test files', () => {
    const fw = createWatcher({ perFileDebounceMs: 50, batchWindowMs: 50 });
    const batches = collectBatches(fw);

    mockWatcher.emit('change', '/fake/dir/utils.ts');
    mockWatcher.emit('change', '/fake/dir/readme.md');
    mockWatcher.emit('add', '/fake/dir/config.json');
    mockWatcher.emit('change', '/fake/dir/helpers.js');

    vi.advanceTimersByTime(500);

    expect(batches).toHaveLength(0);

    fw.stop();
  });

  // ── Test: stop() cleans up properly ────────────────────────────────
  it('stop() cleans up watcher and timers', () => {
    const fw = createWatcher({ perFileDebounceMs: 200, batchWindowMs: 100 });
    const batches = collectBatches(fw);

    mockWatcher.emit('change', '/fake/dir/login.spec.ts');

    // Stop before debounce fires — pending changes should be flushed
    fw.stop();

    expect(mockWatcher.close).toHaveBeenCalled();
    // Flushed on stop
    expect(batches).toHaveLength(1);

    // No more events after stop
    vi.advanceTimersByTime(1000);
    expect(batches).toHaveLength(1);
  });

  // ── Test: handles multiple files changed simultaneously ────────────
  it('batches multiple different files changed within the batch window', () => {
    const fw = createWatcher({ perFileDebounceMs: 50, batchWindowMs: 200 });
    const batches = collectBatches(fw);

    // Three different files changed in quick succession
    mockWatcher.emit('change', '/fake/dir/a.spec.ts');
    mockWatcher.emit('change', '/fake/dir/b.spec.ts');
    mockWatcher.emit('add', '/fake/dir/c.test.ts');

    // Advance past per-file debounce (50ms)
    vi.advanceTimersByTime(50);
    // Now all three are enqueued. Advance past batch window (200ms).
    vi.advanceTimersByTime(200);

    expect(batches).toHaveLength(1);
    expect(batches[0].changes).toHaveLength(3);

    const paths = batches[0].changes.map((c: FileChangeEvent) => c.filePath);
    expect(paths).toContain('/fake/dir/a.spec.ts');
    expect(paths).toContain('/fake/dir/b.spec.ts');
    expect(paths).toContain('/fake/dir/c.test.ts');

    fw.stop();
  });

  // ── Test: handles unlink events ────────────────────────────────────
  it('handles unlink (delete) events', () => {
    const fw = createWatcher({ perFileDebounceMs: 50, batchWindowMs: 50 });
    const batches = collectBatches(fw);

    mockWatcher.emit('unlink', '/fake/dir/old.spec.ts');

    vi.advanceTimersByTime(100);

    expect(batches).toHaveLength(1);
    expect(batches[0].changes[0].type).toBe('unlink');

    fw.stop();
  });

  // ── Test: configurable debounce windows ────────────────────────────
  it('respects custom debounce configuration', () => {
    const fw = createWatcher({ perFileDebounceMs: 1000, batchWindowMs: 500 });
    const batches = collectBatches(fw);

    mockWatcher.emit('change', '/fake/dir/login.spec.ts');

    // At 500ms, per-file debounce (1000ms) hasn't fired yet
    vi.advanceTimersByTime(500);
    expect(batches).toHaveLength(0);

    // At 1000ms, per-file debounce fires, batch window starts
    vi.advanceTimersByTime(500);
    expect(batches).toHaveLength(0); // batch window not yet elapsed

    // At 1500ms, batch window (500ms after enqueue) fires
    vi.advanceTimersByTime(500);
    expect(batches).toHaveLength(1);

    fw.stop();
  });

  // ── Test: cannot start twice without stopping ──────────────────────
  it('throws if started twice without stopping', () => {
    const fw = createWatcher();
    expect(() => fw.start('/another/dir')).toThrow('already started');
    fw.stop();
  });

  // ── Test: last event type wins for same file within debounce ───────
  it('last event type wins when same file has different event types rapidly', () => {
    const fw = createWatcher({ perFileDebounceMs: 100, batchWindowMs: 50 });
    const batches = collectBatches(fw);

    const file = '/fake/dir/login.spec.ts';
    // File added then immediately changed
    mockWatcher.emit('add', file);
    vi.advanceTimersByTime(10);
    mockWatcher.emit('change', file);

    vi.advanceTimersByTime(200);

    expect(batches).toHaveLength(1);
    expect(batches[0].changes).toHaveLength(1);
    // Last event wins
    expect(batches[0].changes[0].type).toBe('change');

    fw.stop();
  });
});
