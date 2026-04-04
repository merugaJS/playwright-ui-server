import crypto from 'node:crypto';
import fs from 'node:fs';
import type { TestFlow } from '@playwright-server/core';

export interface FlowCacheEntry {
  contentHash: string;
  flow: TestFlow;
  lastAccessedAt: number;
}

export interface FlowCacheOptions {
  maxSize: number;
}

const DEFAULT_MAX_SIZE = 50;

/**
 * LRU cache for parsed TestFlow objects, keyed by file path.
 * Cache entries are invalidated when the file content hash changes.
 */
export class FlowCache {
  private cache = new Map<string, FlowCacheEntry>();
  private readonly maxSize: number;

  constructor(options?: FlowCacheOptions) {
    this.maxSize = options?.maxSize ?? DEFAULT_MAX_SIZE;
  }

  /**
   * Get a cached flow for the given file path.
   * Returns the cached TestFlow if the file's current content hash matches,
   * or null if the cache entry is missing or stale.
   */
  get(filePath: string, currentContentHash: string): TestFlow | null {
    const entry = this.cache.get(filePath);
    if (!entry) {
      return null;
    }

    if (entry.contentHash !== currentContentHash) {
      // File has changed — stale entry
      this.cache.delete(filePath);
      return null;
    }

    // Update access time for LRU tracking
    entry.lastAccessedAt = Date.now();

    // Move to end of Map iteration order (most recently used)
    this.cache.delete(filePath);
    this.cache.set(filePath, entry);

    return entry.flow;
  }

  /**
   * Store a parsed flow in the cache.
   * Evicts the least recently used entry if the cache is full.
   */
  set(filePath: string, contentHash: string, flow: TestFlow): void {
    // If already in cache, delete first to refresh insertion order
    if (this.cache.has(filePath)) {
      this.cache.delete(filePath);
    }

    // Evict LRU entry if at capacity
    if (this.cache.size >= this.maxSize) {
      const lruKey = this.cache.keys().next().value;
      if (lruKey !== undefined) {
        this.cache.delete(lruKey);
      }
    }

    this.cache.set(filePath, {
      contentHash,
      flow,
      lastAccessedAt: Date.now(),
    });
  }

  /**
   * Invalidate (remove) the cache entry for a specific file.
   */
  invalidate(filePath: string): void {
    this.cache.delete(filePath);
  }

  /**
   * Clear all cached entries.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Return the current number of cached entries.
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Check if a file path has a cached entry (regardless of staleness).
   */
  has(filePath: string): boolean {
    return this.cache.has(filePath);
  }
}

/**
 * Compute a SHA-256 content hash for the given file.
 */
export function computeContentHash(absolutePath: string): string {
  const content = fs.readFileSync(absolutePath, 'utf-8');
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Singleton cache instance shared across the server.
 */
export const flowCache = new FlowCache();
