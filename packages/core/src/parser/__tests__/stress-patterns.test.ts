/**
 * TICKET-069: Complex Pattern Stress Test
 *
 * Edge-case stress tests that exercise the parser and generator against:
 *  1. Large test bodies (50+ action nodes)
 *  2. Deeply nested conditionals (if / else if / else, 3+ levels)
 *  3. Loops containing conditionals containing assertions
 *  4. Every locator strategy mixed in one test
 *  5. Chained locator + filter + nth + first/last
 *  6. Multiple network routes (fulfill, abort, continue) interleaved with actions
 *  7. Edge cases that must not crash (empty test body, empty describe, etc.)
 *  8. Performance: parsing a 100-line test completes in under 5 seconds
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Project } from 'ts-morph';
import { parseTestFile } from '../test-parser.js';
import { generateTestFile } from '../../generator/test-generator.js';
import type { ActionNode } from '../../model/action-node.js';

let tmpDir: string;

function setup(): string {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stress-patterns-'));
  return tmpDir;
}

function writeTestFile(name: string, content: string): string {
  const filePath = path.join(tmpDir, name);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

/** Recursively count all nodes (including children of loops/conditionals/groups) */
function countNodesDeep(nodes: { data: { type: string; body?: unknown[]; thenChildren?: unknown[]; elseChildren?: unknown[]; elseIfBranches?: { children: unknown[] }[]; children?: unknown[] } }[]): number {
  let count = 0;
  for (const n of nodes) {
    count += 1;
    const d = n.data as Record<string, unknown>;
    if (Array.isArray(d.body)) count += countNodesDeep(d.body as typeof nodes);
    if (Array.isArray(d.thenChildren)) count += countNodesDeep(d.thenChildren as typeof nodes);
    if (Array.isArray(d.elseChildren)) count += countNodesDeep(d.elseChildren as typeof nodes);
    if (Array.isArray(d.elseIfBranches)) {
      for (const branch of d.elseIfBranches as { children: typeof nodes }[]) {
        count += countNodesDeep(branch.children);
      }
    }
    if (d.type === 'group' && Array.isArray(d.children)) {
      count += countNodesDeep(d.children as typeof nodes);
    }
  }
  return count;
}

/** Collect all node types recursively */
function collectTypesDeep(nodes: ActionNode[]): string[] {
  const types: string[] = [];
  for (const n of nodes) {
    types.push(n.data.type);
    const d = n.data as Record<string, unknown>;
    if (Array.isArray(d.body)) types.push(...collectTypesDeep(d.body as ActionNode[]));
    if (Array.isArray(d.thenChildren)) types.push(...collectTypesDeep(d.thenChildren as ActionNode[]));
    if (Array.isArray(d.elseChildren)) types.push(...collectTypesDeep(d.elseChildren as ActionNode[]));
    if (Array.isArray(d.elseIfBranches)) {
      for (const branch of d.elseIfBranches as { children: ActionNode[] }[]) {
        types.push(...collectTypesDeep(branch.children));
      }
    }
    if (d.type === 'group' && Array.isArray(d.children)) {
      types.push(...collectTypesDeep(d.children as ActionNode[]));
    }
  }
  return types;
}

afterEach(() => {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

describe('Stress pattern tests', () => {
  // ---------------------------------------------------------------
  // 1. Test with 50+ action nodes
  // ---------------------------------------------------------------
  describe('large test body (50+ action nodes)', () => {
    it('parses a test with 50+ actions without crashing', () => {
      setup();
      // Build a test body with 55 action lines
      const actions: string[] = [];
      actions.push(`  await page.goto('https://example.com');`);
      for (let i = 1; i <= 18; i++) {
        actions.push(`  await page.getByLabel('Field ${i}').fill('value${i}');`);
      }
      for (let i = 1; i <= 18; i++) {
        actions.push(`  await page.getByRole('button', { name: 'Button ${i}' }).click();`);
      }
      for (let i = 1; i <= 18; i++) {
        actions.push(`  await expect(page.getByText('Result ${i}')).toBeVisible();`);
      }

      const filePath = writeTestFile(
        'large-body.spec.ts',
        `
import { test, expect } from '@playwright/test';

test.describe('large body', () => {
  test('fifty-five actions', async ({ page }) => {
${actions.join('\n')}
  });
});
`,
      );

      const flow = parseTestFile(filePath);

      expect(flow.tests).toHaveLength(1);
      const tc = flow.tests[0];
      // Should have at least 50 nodes (some may be codeBlock fallbacks but none dropped)
      expect(tc.nodes.length).toBeGreaterThanOrEqual(50);

      // Generator should not crash
      const generated = generateTestFile(flow);
      expect(generated).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------
  // 2. Deeply nested conditionals (if / else if / else, 3+ levels)
  // ---------------------------------------------------------------
  describe('deeply nested conditionals', () => {
    it('parses 3+ levels of nested if/else if/else', () => {
      setup();
      const filePath = writeTestFile(
        'nested-conditionals.spec.ts',
        `
import { test, expect } from '@playwright/test';

test.describe('nested conditionals', () => {
  test('three levels deep', async ({ page }) => {
    await page.goto('https://example.com');
    if (await page.getByText('Welcome').isVisible()) {
      await page.getByRole('button', { name: 'Continue' }).click();
      if (await page.getByText('Step 2').isVisible()) {
        await page.getByLabel('Name').fill('Alice');
        if (await page.getByText('Confirm').isVisible()) {
          await page.getByRole('button', { name: 'Confirm' }).click();
        } else {
          await page.getByRole('button', { name: 'Skip' }).click();
        }
      } else if (await page.getByText('Error').isVisible()) {
        await page.getByRole('button', { name: 'Retry' }).click();
      } else {
        await page.getByRole('button', { name: 'Cancel' }).click();
      }
    } else if (await page.getByText('Maintenance').isVisible()) {
      await page.waitForTimeout(5000);
    } else {
      await page.goto('https://example.com/fallback');
    }
  });
});
`,
      );

      const flow = parseTestFile(filePath);

      expect(flow.tests).toHaveLength(1);
      const tc = flow.tests[0];

      // Should find at least one conditional node
      const allTypes = collectTypesDeep(tc.nodes);
      expect(allTypes).toContain('conditional');

      // No nodes silently dropped: the navigate at the top must be present
      expect(allTypes).toContain('navigate');

      // Generator should not crash
      const generated = generateTestFile(flow);
      expect(generated).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------
  // 3. Loops containing conditionals containing assertions
  // ---------------------------------------------------------------
  describe('loops with conditionals and assertions', () => {
    it('parses a for-of loop with inner conditional and assertion', () => {
      setup();
      const filePath = writeTestFile(
        'loop-cond-assert.spec.ts',
        `
import { test, expect } from '@playwright/test';

test.describe('loop conditional assertion', () => {
  test('iterate and check', async ({ page }) => {
    await page.goto('https://example.com/items');
    const items = ['Apple', 'Banana', 'Cherry'];
    for (const item of items) {
      if (await page.getByText(item).isVisible()) {
        await page.getByText(item).click();
        await expect(page.getByTestId('selected')).toHaveText(item);
      } else {
        await page.getByRole('button', { name: 'Load more' }).click();
      }
    }
  });
});
`,
      );

      const flow = parseTestFile(filePath);

      expect(flow.tests).toHaveLength(1);
      const tc = flow.tests[0];
      const allTypes = collectTypesDeep(tc.nodes);

      // Should detect loop and conditional (or codeBlock fallback for unsupported patterns)
      expect(tc.nodes.length).toBeGreaterThanOrEqual(2); // navigate + loop/codeBlock

      // Generator should not crash
      const generated = generateTestFile(flow);
      expect(generated).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------
  // 4. Every locator strategy mixed in one test
  // ---------------------------------------------------------------
  describe('every locator strategy', () => {
    it('parses getByRole, getByText, getByLabel, getByPlaceholder, getByTestId, css, xpath', () => {
      setup();
      const filePath = writeTestFile(
        'all-locators.spec.ts',
        `
import { test, expect } from '@playwright/test';

test.describe('all locator strategies', () => {
  test('uses every locator type', async ({ page }) => {
    await page.goto('https://example.com');
    await page.getByRole('button', { name: 'Submit' }).click();
    await page.getByText('Welcome').click();
    await page.getByLabel('Email').fill('a@b.com');
    await page.getByPlaceholder('Search...').fill('query');
    await page.getByTestId('main-nav').click();
    await page.locator('.css-selector').click();
    await page.locator('xpath=//div[@class="container"]').click();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByText('Logged in')).toBeVisible();
    await expect(page.getByTestId('status')).toHaveText('Active');
  });
});
`,
      );

      const flow = parseTestFile(filePath);

      expect(flow.tests).toHaveLength(1);
      const tc = flow.tests[0];
      expect(tc.nodes.length).toBeGreaterThanOrEqual(10);

      const types = tc.nodes.map((n) => n.data.type);
      expect(types).toContain('navigate');
      expect(types).toContain('click');
      expect(types).toContain('fill');
      expect(types).toContain('assertVisible');
      expect(types).toContain('assertText');

      // Verify various locator strategies were recognized
      const locatorStrategies = tc.nodes
        .filter((n) => 'locator' in n.data && n.data.locator && n.data.locator.kind === 'inline')
        .map((n) => (n.data as { locator: { strategy: string } }).locator.strategy);

      expect(locatorStrategies).toContain('getByRole');
      expect(locatorStrategies).toContain('getByText');
      expect(locatorStrategies).toContain('getByLabel');
      expect(locatorStrategies).toContain('getByPlaceholder');
      expect(locatorStrategies).toContain('getByTestId');

      // css / xpath go through page.locator()
      const cssOrLocator = locatorStrategies.filter((s) => s === 'css' || s === 'locator' || s === 'xpath');
      expect(cssOrLocator.length).toBeGreaterThanOrEqual(2);

      // Generator should not crash
      const generated = generateTestFile(flow);
      expect(generated).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------
  // 5. Chained locator + filter + nth + first/last
  // ---------------------------------------------------------------
  describe('chained locator with filter, nth, first, last', () => {
    it('parses chained locators with modifiers', () => {
      setup();
      const filePath = writeTestFile(
        'chained-locators.spec.ts',
        `
import { test, expect } from '@playwright/test';

test.describe('chained locators', () => {
  test('uses chained locators with modifiers', async ({ page }) => {
    await page.goto('https://example.com');
    await page.locator('.list').locator('.item').first().click();
    await page.getByRole('list').getByRole('listitem').nth(2).click();
    await page.locator('.container').filter({ hasText: 'Active' }).last().click();
    await expect(page.locator('.results').locator('.row').nth(0)).toBeVisible();
    await page.getByRole('table').getByRole('row').filter({ hasText: 'Admin' }).first().click();
  });
});
`,
      );

      const flow = parseTestFile(filePath);

      expect(flow.tests).toHaveLength(1);
      const tc = flow.tests[0];
      // At least navigate + 5 actions
      expect(tc.nodes.length).toBeGreaterThanOrEqual(5);

      // Generator should not crash
      const generated = generateTestFile(flow);
      expect(generated).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------
  // 6. Multiple network routes interleaved with actions
  // ---------------------------------------------------------------
  describe('multiple network routes interleaved with actions', () => {
    it('parses fulfill, abort, continue routes mixed with page actions', () => {
      setup();
      const filePath = writeTestFile(
        'network-routes.spec.ts',
        `
import { test, expect } from '@playwright/test';

test.describe('network routes', () => {
  test('intercepts multiple routes', async ({ page }) => {
    await page.route('**/api/users', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ name: 'Alice' }]),
      });
    });
    await page.goto('https://example.com');
    await page.route('**/api/analytics', async route => {
      await route.abort('blockedbyclient');
    });
    await page.getByRole('button', { name: 'Load' }).click();
    await page.route('**/api/config', async route => {
      await route.continue({ url: 'https://example.com/api/v2/config' });
    });
    await expect(page.getByText('Alice')).toBeVisible();
  });
});
`,
      );

      const flow = parseTestFile(filePath);

      expect(flow.tests).toHaveLength(1);
      const tc = flow.tests[0];
      const types = tc.nodes.map((n) => n.data.type);

      // Should parse navigate, click, assertVisible, and at least some networkRoute nodes
      expect(types).toContain('navigate');
      expect(types).toContain('click');
      expect(types).toContain('assertVisible');

      // Network routes may be parsed as networkRoute or codeBlock - either is fine
      const routeOrCode = types.filter((t) => t === 'networkRoute' || t === 'codeBlock');
      expect(routeOrCode.length).toBeGreaterThanOrEqual(1);

      // Generator should not crash
      const generated = generateTestFile(flow);
      expect(generated).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------
  // 7. Edge cases that must not crash
  // ---------------------------------------------------------------
  describe('edge cases - no crashes', () => {
    it('handles an empty test body', () => {
      setup();
      const filePath = writeTestFile(
        'empty-body.spec.ts',
        `
import { test, expect } from '@playwright/test';

test.describe('empty body', () => {
  test('does nothing', async ({ page }) => {
  });
});
`,
      );

      const flow = parseTestFile(filePath);
      expect(flow.tests).toHaveLength(1);
      expect(flow.tests[0].nodes).toHaveLength(0);

      const generated = generateTestFile(flow);
      expect(generated).toBeTruthy();
    });

    it('handles an empty describe block', () => {
      setup();
      const filePath = writeTestFile(
        'empty-describe.spec.ts',
        `
import { test, expect } from '@playwright/test';

test.describe('empty describe', () => {
});
`,
      );

      const flow = parseTestFile(filePath);
      expect(flow.tests).toHaveLength(0);

      const generated = generateTestFile(flow);
      expect(generated).toBeTruthy();
    });

    it('handles a test with only comments', () => {
      setup();
      const filePath = writeTestFile(
        'only-comments.spec.ts',
        `
import { test, expect } from '@playwright/test';

test.describe('comments only', () => {
  test('commented test', async ({ page }) => {
    // This is a comment
    // Another comment
  });
});
`,
      );

      const flow = parseTestFile(filePath);
      expect(flow.tests).toHaveLength(1);
      // Comments should not produce nodes (or may produce 0 nodes)
      // Main point: no crash
      const generated = generateTestFile(flow);
      expect(generated).toBeTruthy();
    });

    it('handles a test with unsupported patterns (falls back to codeBlock)', () => {
      setup();
      const filePath = writeTestFile(
        'unsupported-patterns.spec.ts',
        `
import { test, expect } from '@playwright/test';

test.describe('unsupported patterns', () => {
  test('complex code', async ({ page }) => {
    const data = await fetch('https://api.example.com/data');
    const json = await data.json();
    console.log(json);
    const result = json.items.map((item: any) => item.name).join(', ');
  });
});
`,
      );

      const flow = parseTestFile(filePath);
      expect(flow.tests).toHaveLength(1);
      // All statements should be captured (as codeBlock fallbacks)
      expect(flow.tests[0].nodes.length).toBeGreaterThanOrEqual(1);

      const generated = generateTestFile(flow);
      expect(generated).toBeTruthy();
    });

    it('handles a describe with only hooks and no tests', () => {
      setup();
      const filePath = writeTestFile(
        'hooks-only.spec.ts',
        `
import { test, expect } from '@playwright/test';

test.describe('hooks only', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('https://example.com');
  });
  test.afterEach(async ({ page }) => {
    await page.goto('https://example.com/logout');
  });
});
`,
      );

      const flow = parseTestFile(filePath);
      expect(flow.tests).toHaveLength(0);
      expect(flow.beforeEach).toBeDefined();
      expect(flow.afterEach).toBeDefined();

      const generated = generateTestFile(flow);
      expect(generated).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------
  // 8. Performance: parsing a 100-line test completes in under 5 seconds
  // ---------------------------------------------------------------
  describe('performance', () => {
    it('parses a 100-line test in under 5 seconds', () => {
      setup();

      // Build a realistic 100+ line test
      const lines: string[] = [];
      lines.push(`import { test, expect } from '@playwright/test';`);
      lines.push('');
      lines.push(`test.describe('performance test', () => {`);
      lines.push(`  test.beforeEach(async ({ page }) => {`);
      lines.push(`    await page.goto('https://example.com');`);
      lines.push('  });');
      lines.push('');
      lines.push(`  test('large test', async ({ page }) => {`);

      // Generate 90+ action lines for a realistic large test
      for (let i = 1; i <= 30; i++) {
        lines.push(`    await page.getByLabel('Field ${i}').fill('value${i}');`);
      }
      for (let i = 1; i <= 30; i++) {
        lines.push(`    await page.getByRole('button', { name: 'Btn ${i}' }).click();`);
      }
      for (let i = 1; i <= 30; i++) {
        lines.push(`    await expect(page.getByText('Result ${i}')).toBeVisible();`);
      }

      lines.push('  });');
      lines.push('});');
      lines.push('');

      const content = lines.join('\n');
      // Verify we actually have 100+ lines
      expect(content.split('\n').length).toBeGreaterThanOrEqual(100);

      const filePath = writeTestFile('performance.spec.ts', content);

      const start = performance.now();
      const flow = parseTestFile(filePath);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(5000); // under 5 seconds

      // Verify it actually parsed the nodes
      expect(flow.tests).toHaveLength(1);
      expect(flow.tests[0].nodes.length).toBeGreaterThanOrEqual(80);

      // Generator should also complete quickly
      const genStart = performance.now();
      const generated = generateTestFile(flow);
      const genElapsed = performance.now() - genStart;

      expect(genElapsed).toBeLessThan(5000);
      expect(generated).toBeTruthy();
    });
  });
});
