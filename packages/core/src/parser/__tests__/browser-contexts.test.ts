import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseTestFile } from '../test-parser.js';
import { generateTestFile } from '../../generator/test-generator.js';

let tmpDir: string;

function setup(): string {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-contexts-'));
  return tmpDir;
}

function writeTestFile(name: string, content: string): string {
  const filePath = path.join(tmpDir, name);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

afterEach(() => {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

describe('Multiple Browser Contexts', () => {
  it('parses browser.newContext() without options', () => {
    setup();
    const filePath = writeTestFile(
      'basic-context.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Multi context', () => {
  test('create context', async ({ browser }) => {
    const context1 = await browser.newContext();
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    const contextNode = tc.nodes.find(n => n.data.type === 'newContext');
    expect(contextNode).toBeDefined();
    if (contextNode && contextNode.data.type === 'newContext') {
      expect(contextNode.data.contextVariable).toBe('context1');
      expect(contextNode.data.options).toBeUndefined();
    }
  });

  it('parses browser.newContext() with options', () => {
    setup();
    const filePath = writeTestFile(
      'context-options.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Context with options', () => {
  test('create context with storage state', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: 'auth.json' });
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    // storageState-specific context creation is handled by storageState matcher first,
    // so this should be a storageState node (the specific matcher takes priority)
    const storageNode = tc.nodes.find(n => n.data.type === 'storageState');
    expect(storageNode).toBeDefined();
  });

  it('parses browser.newContext() with non-storageState options as newContext', () => {
    setup();
    const filePath = writeTestFile(
      'context-other-options.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Context with options', () => {
  test('create context with viewport', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    const contextNode = tc.nodes.find(n => n.data.type === 'newContext');
    expect(contextNode).toBeDefined();
    if (contextNode && contextNode.data.type === 'newContext') {
      expect(contextNode.data.contextVariable).toBe('ctx');
      expect(contextNode.data.options).toContain('viewport');
    }
  });

  it('parses context.newPage() as newTab with context variable', () => {
    setup();
    const filePath = writeTestFile(
      'context-newpage.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Multi context', () => {
  test('create page from context', async ({ browser }) => {
    const context1 = await browser.newContext();
    const page1 = await context1.newPage();
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    const newTabNode = tc.nodes.find(n => n.data.type === 'newTab');
    expect(newTabNode).toBeDefined();
    if (newTabNode && newTabNode.data.type === 'newTab') {
      expect(newTabNode.data.pageVariable).toBe('page1');
      expect(newTabNode.data.contextVariable).toBe('context1');
      expect(newTabNode.data.triggerAction).toBe('context1.newPage()');
    }
  });

  it('generator round-trip for newContext', () => {
    setup();
    const filePath = writeTestFile(
      'roundtrip.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Multi context roundtrip', () => {
  test('two contexts', async ({ browser }) => {
    const context1 = await browser.newContext();
    const page1 = await context1.newPage();
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const generated = generateTestFile(flow);

    expect(generated).toContain('const context1 = await browser.newContext();');
    expect(generated).toContain('const page1 = await context1.newPage();');
    expect(generated).toContain('const context2 = await browser.newContext();');
    expect(generated).toContain('const page2 = await context2.newPage();');
  });

  it('parses a full multi-context scenario', () => {
    setup();
    const filePath = writeTestFile(
      'multi-context-full.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Multi-user chat', () => {
  test('two users can chat', async ({ browser }) => {
    const context1 = await browser.newContext();
    const page1 = await context1.newPage();
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    await page1.goto('https://example.com/chat');
    await page2.goto('https://example.com/chat');
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];

    // Should have 2 newContext nodes
    const contextNodes = tc.nodes.filter(n => n.data.type === 'newContext');
    expect(contextNodes).toHaveLength(2);

    // Should have 2 newTab nodes (from context.newPage())
    const newTabNodes = tc.nodes.filter(n => n.data.type === 'newTab');
    expect(newTabNodes).toHaveLength(2);

    // page1.goto and page2.goto are parsed as navigate nodes (goto is recognized regardless of page var)
    const navNodes = tc.nodes.filter(n => n.data.type === 'navigate');
    expect(navNodes).toHaveLength(2);

    // Generator round-trip
    const generated = generateTestFile(flow);
    expect(generated).toContain('const context1 = await browser.newContext();');
    expect(generated).toContain('const context2 = await browser.newContext();');
    expect(generated).toContain('const page1 = await context1.newPage();');
    expect(generated).toContain('const page2 = await context2.newPage();');
  });
});
