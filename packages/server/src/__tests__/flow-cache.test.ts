import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { FlowCache, computeContentHash } from '../flow-cache.js';
import type { TestFlow } from '@playwright-server/core';

function makeFlow(id: string): TestFlow {
  return {
    id,
    filePath: `tests/${id}.spec.ts`,
    describe: `${id} Tests`,
    tests: [],
    imports: [],
    fixtures: [],
    metadata: {
      contentHash: 'abc123',
      lastParsedAt: Date.now(),
      parseWarnings: [],
    },
  };
}

describe('FlowCache', () => {
  let cache: FlowCache;

  beforeEach(() => {
    cache = new FlowCache({ maxSize: 3 });
  });

  it('returns null for a cache miss', () => {
    const result = cache.get('/path/to/file.ts', 'hash123');
    expect(result).toBeNull();
  });

  it('returns cached flow when content hash matches', () => {
    const flow = makeFlow('login');
    cache.set('/path/login.spec.ts', 'hash-a', flow);

    const result = cache.get('/path/login.spec.ts', 'hash-a');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('login');
  });

  it('returns null when content hash differs (file changed)', () => {
    const flow = makeFlow('login');
    cache.set('/path/login.spec.ts', 'hash-a', flow);

    const result = cache.get('/path/login.spec.ts', 'hash-b');
    expect(result).toBeNull();
  });

  it('removes stale entry when content hash differs', () => {
    const flow = makeFlow('login');
    cache.set('/path/login.spec.ts', 'hash-a', flow);

    // Miss due to different hash should remove entry
    cache.get('/path/login.spec.ts', 'hash-b');
    expect(cache.has('/path/login.spec.ts')).toBe(false);
  });

  it('invalidates a specific file', () => {
    const flow = makeFlow('login');
    cache.set('/path/login.spec.ts', 'hash-a', flow);
    expect(cache.has('/path/login.spec.ts')).toBe(true);

    cache.invalidate('/path/login.spec.ts');
    expect(cache.has('/path/login.spec.ts')).toBe(false);
  });

  it('clears all entries', () => {
    cache.set('/a.ts', 'h1', makeFlow('a'));
    cache.set('/b.ts', 'h2', makeFlow('b'));
    expect(cache.size).toBe(2);

    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('evicts LRU entry when cache is full', () => {
    cache.set('/a.ts', 'h1', makeFlow('a'));
    cache.set('/b.ts', 'h2', makeFlow('b'));
    cache.set('/c.ts', 'h3', makeFlow('c'));

    // Cache is at maxSize (3). Adding a 4th should evict /a.ts (LRU)
    cache.set('/d.ts', 'h4', makeFlow('d'));

    expect(cache.size).toBe(3);
    expect(cache.has('/a.ts')).toBe(false); // evicted
    expect(cache.has('/b.ts')).toBe(true);
    expect(cache.has('/c.ts')).toBe(true);
    expect(cache.has('/d.ts')).toBe(true);
  });

  it('accessing a cached entry promotes it (prevents LRU eviction)', () => {
    cache.set('/a.ts', 'h1', makeFlow('a'));
    cache.set('/b.ts', 'h2', makeFlow('b'));
    cache.set('/c.ts', 'h3', makeFlow('c'));

    // Access /a.ts to promote it
    cache.get('/a.ts', 'h1');

    // Now /b.ts is the LRU. Adding /d.ts should evict /b.ts
    cache.set('/d.ts', 'h4', makeFlow('d'));

    expect(cache.has('/a.ts')).toBe(true); // promoted, not evicted
    expect(cache.has('/b.ts')).toBe(false); // evicted
    expect(cache.has('/c.ts')).toBe(true);
    expect(cache.has('/d.ts')).toBe(true);
  });

  it('updates existing entry in place', () => {
    cache.set('/a.ts', 'h1', makeFlow('a-v1'));
    cache.set('/a.ts', 'h2', makeFlow('a-v2'));

    expect(cache.size).toBe(1);
    const result = cache.get('/a.ts', 'h2');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('a-v2');
  });
});

describe('computeContentHash', () => {
  let tmpDir: string;

  afterAll(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns a SHA-256 hex hash of the file contents', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-cache-test-'));
    const filePath = path.join(tmpDir, 'test.ts');
    const content = 'const x = 1;';
    fs.writeFileSync(filePath, content, 'utf-8');

    const hash = computeContentHash(filePath);
    const expectedHash = crypto.createHash('sha256').update(content).digest('hex');

    expect(hash).toBe(expectedHash);
    expect(hash).toHaveLength(64); // SHA-256 hex is 64 chars
  });

  it('returns different hashes for different content', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-cache-test-'));
    const fileA = path.join(tmpDir, 'a.ts');
    const fileB = path.join(tmpDir, 'b.ts');
    fs.writeFileSync(fileA, 'const a = 1;', 'utf-8');
    fs.writeFileSync(fileB, 'const b = 2;', 'utf-8');

    expect(computeContentHash(fileA)).not.toBe(computeContentHash(fileB));
  });

  it('returns the same hash for the same content', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-cache-test-'));
    const file = path.join(tmpDir, 'same.ts');
    fs.writeFileSync(file, 'const x = 42;', 'utf-8');

    const hash1 = computeContentHash(file);
    const hash2 = computeContentHash(file);

    expect(hash1).toBe(hash2);
  });
});
