import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseTestFile } from '../test-parser.js';
import { generateTestFile } from '../../generator/test-generator.js';
import type { LocatorRef } from '../../model/action-node.js';

let tmpDir: string;

function setup(): string {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dynamic-locators-'));
  return tmpDir;
}

function writeTestFile(name: string, content: string): string {
  const dir = setup();
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

afterEach(() => {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

/** Helper to build a minimal TestFlow for generator tests */
function makeFlow(nodes: any[]) {
  return {
    id: 'test-flow',
    filePath: '/tmp/test.spec.ts',
    describe: 'test suite',
    imports: [{ moduleSpecifier: '@playwright/test', namedImports: ['test', 'expect'] }],
    describes: [],
    tests: [
      {
        id: 'tc-1',
        name: 'test case',
        nodes,
        edges: [] as any[],
      },
    ],
    fixtures: ['page'],
    metadata: { contentHash: '', lastParsedAt: 0, parseWarnings: [] },
    hooks: { beforeAll: [], afterAll: [], beforeEach: [], afterEach: [] },
  } as any;
}

/** Helper to extract the locator from the first action node that has one */
function getLocator(filePath: string): LocatorRef {
  const flow = parseTestFile(filePath);
  const node = flow.tests[0].nodes.find(
    (n) => 'locator' in n.data && (n.data as any).locator,
  );
  if (!node) throw new Error('No node with a locator found');
  return (node.data as any).locator;
}

describe('dynamic locators', () => {
  it('parses template literal locator as dynamic', () => {
    const filePath = writeTestFile(
      'template.spec.ts',
      `
import { test } from '@playwright/test';

test('template literal locator', async ({ page }) => {
  const id = 'my-id';
  await page.locator(\`[data-id="\${id}"]\`).click();
});
`,
    );

    const locator = getLocator(filePath);
    expect(locator.kind).toBe('inline');
    if (locator.kind === 'inline') {
      expect(locator.dynamic).toBe(true);
      expect(locator.strategy).toBe('locator');
      expect(locator.value).toContain('`');
    }
  });

  it('parses variable identifier locator as dynamic', () => {
    const filePath = writeTestFile(
      'variable.spec.ts',
      `
import { test } from '@playwright/test';

test('variable locator', async ({ page }) => {
  const mySelector = '.some-class';
  await page.locator(mySelector).click();
});
`,
    );

    const locator = getLocator(filePath);
    expect(locator.kind).toBe('inline');
    if (locator.kind === 'inline') {
      expect(locator.dynamic).toBe(true);
      expect(locator.value).toBe('mySelector');
    }
  });

  it('parses member expression locator (e.g., testIds.submit) as dynamic', () => {
    const filePath = writeTestFile(
      'member.spec.ts',
      `
import { test } from '@playwright/test';

test('member expression locator', async ({ page }) => {
  const testIds = { submit: 'submit-btn' };
  await page.getByTestId(testIds.submit).click();
});
`,
    );

    const locator = getLocator(filePath);
    expect(locator.kind).toBe('inline');
    if (locator.kind === 'inline') {
      expect(locator.dynamic).toBe(true);
      expect(locator.value).toBe('testIds.submit');
    }
  });

  it('parses static string locator without dynamic flag', () => {
    const filePath = writeTestFile(
      'static.spec.ts',
      `
import { test } from '@playwright/test';

test('static locator', async ({ page }) => {
  await page.locator('.static').click();
});
`,
    );

    const locator = getLocator(filePath);
    expect(locator.kind).toBe('inline');
    if (locator.kind === 'inline') {
      expect(locator.dynamic).toBeUndefined();
      expect(locator.value).toBe('.static');
    }
  });

  it('generator outputs dynamic locator without quotes', () => {
    const flow = makeFlow([
      {
        id: '1',
        type: 'click',
        position: { x: 0, y: 0 },
        data: {
          type: 'click',
          locator: { kind: 'inline', strategy: 'locator', value: 'mySelector', dynamic: true },
        },
      },
    ]);

    const output = generateTestFile(flow);
    expect(output).toContain('page.locator(mySelector)');
    expect(output).not.toContain("page.locator('mySelector')");
  });

  it('generator outputs static locator with quotes', () => {
    const flow = makeFlow([
      {
        id: '1',
        type: 'click',
        position: { x: 0, y: 0 },
        data: {
          type: 'click',
          locator: { kind: 'inline', strategy: 'locator', value: '.static' },
        },
      },
    ]);

    const output = generateTestFile(flow);
    expect(output).toContain("page.locator('.static')");
  });

  it('round-trips dynamic locators (parse → generate preserves dynamic)', () => {
    const filePath = writeTestFile(
      'roundtrip.spec.ts',
      `
import { test } from '@playwright/test';

test('roundtrip dynamic', async ({ page }) => {
  const mySelector = '.dynamic';
  await page.locator(mySelector).click();
});
`,
    );

    const flow = parseTestFile(filePath);
    const output = generateTestFile(flow);
    // The generated code should emit the variable name without quotes
    expect(output).toContain('page.locator(mySelector)');
    expect(output).not.toContain("page.locator('mySelector')");
  });

  it('round-trips template literal locators', () => {
    const filePath = writeTestFile(
      'roundtrip-template.spec.ts',
      `
import { test } from '@playwright/test';

test('roundtrip template', async ({ page }) => {
  const id = 'test';
  await page.locator(\`[data-id="\${id}"]\`).click();
});
`,
    );

    const flow = parseTestFile(filePath);
    const output = generateTestFile(flow);
    // The generated code should contain the template literal as-is
    expect(output).toContain('page.locator(`[data-id=');
    expect(output).toContain('${id}');
  });

  it('generator emits dynamic getByTestId without quotes', () => {
    const flow = makeFlow([
      {
        id: '1',
        type: 'click',
        position: { x: 0, y: 0 },
        data: {
          type: 'click',
          locator: { kind: 'inline', strategy: 'getByTestId', value: 'testIds.submit', dynamic: true },
        },
      },
    ]);

    const output = generateTestFile(flow);
    expect(output).toContain('page.getByTestId(testIds.submit)');
    expect(output).not.toContain("page.getByTestId('testIds.submit')");
  });
});
