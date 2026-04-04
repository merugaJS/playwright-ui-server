import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseTestFile } from '../test-parser.js';
import { generateTestFile } from '../../generator/test-generator.js';
import type { TestFlow, TestCase, DescribeBlock } from '../../model/test-flow.js';
import type { ActionNode } from '../../model/action-node.js';

let tmpDir: string;

function setup(): string {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roundtrip-fidelity-'));
  return tmpDir;
}

function writeFixture(name: string, content: string): string {
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

// ── Helpers for structural comparison ──────────────────────────────────────

function collectNodeTypes(nodes: ActionNode[]): string[] {
  const types: string[] = [];
  for (const n of nodes) {
    types.push(n.data.type);
    // Recurse into composite action types
    const d = n.data as Record<string, unknown>;
    if (d.body && Array.isArray(d.body)) {
      types.push(...collectNodeTypes(d.body as ActionNode[]));
    }
    if (d.thenChildren && Array.isArray(d.thenChildren)) {
      types.push(...collectNodeTypes(d.thenChildren as ActionNode[]));
    }
    if (d.elseChildren && Array.isArray(d.elseChildren)) {
      types.push(...collectNodeTypes(d.elseChildren as ActionNode[]));
    }
    if (d.children && Array.isArray(d.children)) {
      types.push(...collectNodeTypes(d.children as ActionNode[]));
    }
  }
  return types;
}

function collectTestNames(flow: TestFlow): string[] {
  const names: string[] = [];
  for (const tc of flow.tests) {
    names.push(tc.name);
  }
  if (flow.children) {
    for (const child of flow.children) {
      names.push(...collectDescribeTestNames(child));
    }
  }
  return names;
}

function collectDescribeTestNames(block: DescribeBlock): string[] {
  const names: string[] = [];
  for (const tc of block.tests) {
    names.push(tc.name);
  }
  if (block.children) {
    for (const child of block.children) {
      names.push(...collectDescribeTestNames(child));
    }
  }
  return names;
}

function totalNodeCount(flow: TestFlow): number {
  let count = 0;
  const countNodes = (nodes: ActionNode[]) => {
    for (const n of nodes) {
      count++;
      const d = n.data as Record<string, unknown>;
      if (d.body && Array.isArray(d.body)) countNodes(d.body as ActionNode[]);
      if (d.thenChildren && Array.isArray(d.thenChildren)) countNodes(d.thenChildren as ActionNode[]);
      if (d.elseChildren && Array.isArray(d.elseChildren)) countNodes(d.elseChildren as ActionNode[]);
      if (d.children && Array.isArray(d.children)) countNodes(d.children as ActionNode[]);
    }
  };

  for (const tc of flow.tests) countNodes(tc.nodes);
  if (flow.beforeEach) countNodes(flow.beforeEach);
  if (flow.afterEach) countNodes(flow.afterEach);
  if (flow.beforeAll) countNodes(flow.beforeAll);
  if (flow.afterAll) countNodes(flow.afterAll);
  if (flow.children) {
    for (const child of flow.children) countDescribeNodes(child, (n) => { count++; });
  }
  return count;
}

function countDescribeNodes(block: DescribeBlock, inc: (n: ActionNode) => void): void {
  const countNodes = (nodes: ActionNode[]) => {
    for (const n of nodes) {
      inc(n);
      const d = n.data as Record<string, unknown>;
      if (d.body && Array.isArray(d.body)) countNodes(d.body as ActionNode[]);
      if (d.thenChildren && Array.isArray(d.thenChildren)) countNodes(d.thenChildren as ActionNode[]);
      if (d.elseChildren && Array.isArray(d.elseChildren)) countNodes(d.elseChildren as ActionNode[]);
      if (d.children && Array.isArray(d.children)) countNodes(d.children as ActionNode[]);
    }
  };
  for (const tc of block.tests) countNodes(tc.nodes);
  if (block.beforeEach) countNodes(block.beforeEach);
  if (block.afterEach) countNodes(block.afterEach);
  if (block.beforeAll) countNodes(block.beforeAll);
  if (block.afterAll) countNodes(block.afterAll);
  if (block.children) {
    for (const child of block.children) countDescribeNodes(child, inc);
  }
}

function collectAllNodeTypes(flow: TestFlow): string[] {
  const types: string[] = [];
  const gather = (nodes: ActionNode[]) => types.push(...collectNodeTypes(nodes));

  for (const tc of flow.tests) gather(tc.nodes);
  if (flow.beforeEach) gather(flow.beforeEach);
  if (flow.afterEach) gather(flow.afterEach);
  if (flow.beforeAll) gather(flow.beforeAll);
  if (flow.afterAll) gather(flow.afterAll);
  if (flow.children) {
    for (const child of flow.children) gatherDescribeTypes(child, types);
  }
  return types;
}

function gatherDescribeTypes(block: DescribeBlock, types: string[]): void {
  const gather = (nodes: ActionNode[]) => types.push(...collectNodeTypes(nodes));
  for (const tc of block.tests) gather(tc.nodes);
  if (block.beforeEach) gather(block.beforeEach);
  if (block.afterEach) gather(block.afterEach);
  if (block.beforeAll) gather(block.beforeAll);
  if (block.afterAll) gather(block.afterAll);
  if (block.children) {
    for (const child of block.children) gatherDescribeTypes(child, types);
  }
}

/**
 * Roundtrip: parse -> generate -> write -> re-parse -> compare structures
 */
function roundtrip(filePath: string): { first: TestFlow; second: TestFlow; generated: string } {
  const first = parseTestFile(filePath);
  const generated = generateTestFile(first);

  // Write generated code to a new temp file
  const regenPath = filePath.replace(/\.spec\.ts$/, '.regen.spec.ts');
  fs.writeFileSync(regenPath, generated, 'utf-8');

  const second = parseTestFile(regenPath);
  return { first, second, generated };
}

function assertStructuralEquivalence(first: TestFlow, second: TestFlow): void {
  // Same test names
  const firstNames = collectTestNames(first);
  const secondNames = collectTestNames(second);
  expect(secondNames).toEqual(firstNames);

  // Same describe name
  expect(second.describe).toBe(first.describe);

  // Same total node count
  const firstCount = totalNodeCount(first);
  const secondCount = totalNodeCount(second);
  expect(secondCount).toBe(firstCount);

  // Same set of action types (sorted for order-independence of type collection within composites)
  const firstTypes = collectAllNodeTypes(first).sort();
  const secondTypes = collectAllNodeTypes(second).sort();
  expect(secondTypes).toEqual(firstTypes);

  // Same fixture list
  expect(second.fixtures.sort()).toEqual(first.fixtures.sort());
}

// ── Test fixtures ──────────────────────────────────────────────────────────

describe('Roundtrip Fidelity Tests', () => {

  it('navigate + click + fill', () => {
    const filePath = writeFixture('nav-click-fill.spec.ts', `
import { test, expect } from '@playwright/test';

test.describe('Login Flow', () => {
  test('should login successfully', async ({ page }) => {
    await page.goto('https://example.com/login');
    await page.getByLabel('Username').fill('admin');
    await page.getByLabel('Password').fill('secret123');
    await page.getByRole('button', { name: 'Sign In' }).click();
  });
});
`);
    const { first, second } = roundtrip(filePath);
    assertStructuralEquivalence(first, second);
  });

  it('assertions: text, visible, URL, title', () => {
    const filePath = writeFixture('assertions.spec.ts', `
import { test, expect } from '@playwright/test';

test.describe('Assertions', () => {
  test('various assertion types', async ({ page }) => {
    await page.goto('https://example.com');
    await expect(page.getByText('Welcome')).toBeVisible();
    await expect(page.getByText('Hello')).toContainText('Hello');
    await expect(page).toHaveURL('https://example.com');
    await expect(page).toHaveTitle('Example');
  });
});
`);
    const { first, second } = roundtrip(filePath);
    assertStructuralEquivalence(first, second);
  });

  it('assertions: attribute, value, class, enabled, disabled, checked, hidden', () => {
    const filePath = writeFixture('assertions-extended.spec.ts', `
import { test, expect } from '@playwright/test';

test.describe('Extended Assertions', () => {
  test('extended assertion types', async ({ page }) => {
    await page.goto('https://example.com/form');
    await expect(page.locator('#email')).toHaveAttribute('type', 'email');
    await expect(page.locator('#email')).toHaveValue('test@example.com');
    await expect(page.locator('.active')).toHaveClass('active');
    await expect(page.locator('#submit')).toBeEnabled();
    await expect(page.locator('#disabled-btn')).toBeDisabled();
    await expect(page.locator('#agree')).toBeChecked();
    await expect(page.locator('.hidden-el')).toBeHidden();
  });
});
`);
    const { first, second } = roundtrip(filePath);
    assertStructuralEquivalence(first, second);
  });

  it('negated assertions', () => {
    const filePath = writeFixture('negated-assertions.spec.ts', `
import { test, expect } from '@playwright/test';

test.describe('Negated Assertions', () => {
  test('negated checks', async ({ page }) => {
    await page.goto('https://example.com');
    await expect(page.getByText('Error')).not.toBeVisible();
    await expect(page).not.toHaveURL('https://wrong.com');
  });
});
`);
    const { first, second } = roundtrip(filePath);
    assertStructuralEquivalence(first, second);
  });

  it('assertCount', () => {
    const filePath = writeFixture('assert-count.spec.ts', `
import { test, expect } from '@playwright/test';

test.describe('Count Assert', () => {
  test('checks item count', async ({ page }) => {
    await page.goto('https://example.com/list');
    await expect(page.locator('.item')).toHaveCount(5);
  });
});
`);
    const { first, second } = roundtrip(filePath);
    assertStructuralEquivalence(first, second);
  });

  it('for loop with body actions', () => {
    const filePath = writeFixture('for-loop.spec.ts', `
import { test, expect } from '@playwright/test';

test.describe('Loop Test', () => {
  test('iterates with for loop', async ({ page }) => {
    await page.goto('https://example.com');
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: 'Add' }).click();
    }
  });
});
`);
    const { first, second } = roundtrip(filePath);
    assertStructuralEquivalence(first, second);
  });

  it('for...of loop', () => {
    const filePath = writeFixture('for-of-loop.spec.ts', `
import { test, expect } from '@playwright/test';

test.describe('ForOf Loop', () => {
  test('iterates over items', async ({ page }) => {
    await page.goto('https://example.com');
    for (const item of ['a', 'b', 'c']) {
      await page.getByLabel('Input').fill(item);
    }
  });
});
`);
    const { first, second } = roundtrip(filePath);
    assertStructuralEquivalence(first, second);
  });

  it('conditional: if/else', () => {
    const filePath = writeFixture('conditional.spec.ts', `
import { test, expect } from '@playwright/test';

test.describe('Conditional Test', () => {
  test('handles if/else', async ({ page }) => {
    await page.goto('https://example.com');
    if (await page.getByText('Welcome').isVisible()) {
      await page.getByRole('button', { name: 'Continue' }).click();
    } else {
      await page.getByRole('button', { name: 'Login' }).click();
    }
  });
});
`);
    const { first, second } = roundtrip(filePath);
    assertStructuralEquivalence(first, second);
  });

  it('nested describes', () => {
    const filePath = writeFixture('nested-describes.spec.ts', `
import { test, expect } from '@playwright/test';

test.describe('Outer Suite', () => {
  test('outer test', async ({ page }) => {
    await page.goto('https://example.com');
  });

  test.describe('Inner Suite', () => {
    test('inner test', async ({ page }) => {
      await page.goto('https://example.com/inner');
      await expect(page).toHaveURL('https://example.com/inner');
    });
  });
});
`);
    const { first, second } = roundtrip(filePath);
    assertStructuralEquivalence(first, second);
    expect(collectTestNames(second)).toContain('outer test');
    expect(collectTestNames(second)).toContain('inner test');
  });

  it('hooks: beforeEach and afterEach', () => {
    const filePath = writeFixture('hooks.spec.ts', `
import { test, expect } from '@playwright/test';

test.describe('Hooks Suite', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('https://example.com/setup');
  });

  test.afterEach(async ({ page }) => {
    await page.goto('https://example.com/teardown');
  });

  test('test with hooks', async ({ page }) => {
    await page.getByRole('button', { name: 'Action' }).click();
  });
});
`);
    const { first, second } = roundtrip(filePath);
    assertStructuralEquivalence(first, second);
    expect(second.beforeEach).toBeDefined();
    expect(second.beforeEach!.length).toBe(first.beforeEach!.length);
    expect(second.afterEach).toBeDefined();
    expect(second.afterEach!.length).toBe(first.afterEach!.length);
  });

  it('hooks: beforeAll and afterAll', () => {
    const filePath = writeFixture('hooks-all.spec.ts', `
import { test, expect } from '@playwright/test';

test.describe('All Hooks Suite', () => {
  test.beforeAll(async () => {
    await page.goto('https://example.com/global-setup');
  });

  test.afterAll(async () => {
    await page.goto('https://example.com/global-teardown');
  });

  test('test with all hooks', async ({ page }) => {
    await page.getByRole('button', { name: 'Go' }).click();
  });
});
`);
    const { first, second } = roundtrip(filePath);
    assertStructuralEquivalence(first, second);
  });

  it('network route: fulfill', () => {
    const filePath = writeFixture('network-route.spec.ts', `
import { test, expect } from '@playwright/test';

test.describe('Network Routes', () => {
  test('mocks API response', async ({ page }) => {
    await page.route('**/api/users', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    await page.goto('https://example.com');
  });
});
`);
    const { first, second } = roundtrip(filePath);
    assertStructuralEquivalence(first, second);
  });

  it('network route: abort', () => {
    const filePath = writeFixture('network-route-abort.spec.ts', `
import { test, expect } from '@playwright/test';

test.describe('Network Route Abort', () => {
  test('aborts images', async ({ page }) => {
    await page.route('**/*.png', async route => {
      await route.abort();
    });
    await page.goto('https://example.com');
  });
});
`);
    const { first, second } = roundtrip(filePath);
    assertStructuralEquivalence(first, second);
  });

  it('API requests', () => {
    const filePath = writeFixture('api-request.spec.ts', `
import { test, expect } from '@playwright/test';

test.describe('API Tests', () => {
  test('makes GET request', async ({ request }) => {
    const response = await request.get('https://api.example.com/users');
  });
});
`);
    const { first, second } = roundtrip(filePath);
    assertStructuralEquivalence(first, second);
  });

  it('file upload', () => {
    const filePath = writeFixture('file-upload.spec.ts', `
import { test, expect } from '@playwright/test';

test.describe('File Upload', () => {
  test('uploads a file', async ({ page }) => {
    await page.goto('https://example.com/upload');
    await page.locator('#file-input').setInputFiles('test.pdf');
  });
});
`);
    const { first, second } = roundtrip(filePath);
    assertStructuralEquivalence(first, second);
  });

  it('dialog handling', () => {
    const filePath = writeFixture('dialog-handler.spec.ts', `
import { test, expect } from '@playwright/test';

test.describe('Dialog Handling', () => {
  test('accepts alert', async ({ page }) => {
    await page.goto('https://example.com');
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Trigger Alert' }).click();
  });
});
`);
    const { first, second } = roundtrip(filePath);
    assertStructuralEquivalence(first, second);
  });

  it('storage state: save', () => {
    const filePath = writeFixture('storage-state.spec.ts', `
import { test, expect } from '@playwright/test';

test.describe('Storage State', () => {
  test('saves storage state', async ({ page, context }) => {
    await page.goto('https://example.com/login');
    await page.getByLabel('Username').fill('admin');
    await page.getByRole('button', { name: 'Login' }).click();
    await context.storageState({ path: 'state.json' });
  });
});
`);
    const { first, second } = roundtrip(filePath);
    assertStructuralEquivalence(first, second);
  });

  it('test.step groups', () => {
    const filePath = writeFixture('test-step.spec.ts', `
import { test, expect } from '@playwright/test';

test.describe('Step Groups', () => {
  test('uses test.step', async ({ page }) => {
    await test.step('Navigate to page', async () => {
      await page.goto('https://example.com');
    });
    await test.step('Fill form', async () => {
      await page.getByLabel('Name').fill('Alice');
    });
  });
});
`);
    const { first, second } = roundtrip(filePath);
    assertStructuralEquivalence(first, second);
  });

  it('locator chains with modifiers: filter, nth, first, last', () => {
    const filePath = writeFixture('locator-chains.spec.ts', `
import { test, expect } from '@playwright/test';

test.describe('Locator Chains', () => {
  test('uses chained locators', async ({ page }) => {
    await page.goto('https://example.com');
    await page.locator('.list').locator('.item').first().click();
    await page.locator('.card').filter({ hasText: 'Special' }).click();
    await page.locator('.row').nth(2).click();
    await page.locator('.item').last().click();
  });
});
`);
    const { first, second } = roundtrip(filePath);
    assertStructuralEquivalence(first, second);
  });

  it('hover and selectOption', () => {
    const filePath = writeFixture('hover-select.spec.ts', `
import { test, expect } from '@playwright/test';

test.describe('Hover and Select', () => {
  test('hovers and selects', async ({ page }) => {
    await page.goto('https://example.com');
    await page.getByRole('menuitem', { name: 'Products' }).hover();
    await page.locator('#country').selectOption('US');
  });
});
`);
    const { first, second } = roundtrip(filePath);
    assertStructuralEquivalence(first, second);
  });

  it('wait and screenshot', () => {
    const filePath = writeFixture('wait-screenshot.spec.ts', `
import { test, expect } from '@playwright/test';

test.describe('Wait and Screenshot', () => {
  test('waits and takes screenshot', async ({ page }) => {
    await page.goto('https://example.com');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'result.png', fullPage: true });
  });
});
`);
    const { first, second } = roundtrip(filePath);
    assertStructuralEquivalence(first, second);
  });

  it('utility imports (namespace and named)', () => {
    const filePath = writeFixture('utility-imports.spec.ts', `
import { test, expect } from '@playwright/test';
import * as utils from './helpers';

test.describe('Utility Imports', () => {
  test('uses utilities', async ({ page }) => {
    await page.goto('https://example.com');
    await page.getByRole('button', { name: 'Submit' }).click();
  });
});
`);
    const { first, second } = roundtrip(filePath);
    assertStructuralEquivalence(first, second);
    // Verify both parses captured the namespace import
    const nsImportFirst = first.imports.find(i => i.namespaceImport === 'utils');
    const nsImportSecond = second.imports.find(i => i.namespaceImport === 'utils');
    expect(nsImportFirst).toBeDefined();
    expect(nsImportSecond).toBeDefined();
  });

  it('multiple test cases in one describe', () => {
    const filePath = writeFixture('multi-test.spec.ts', `
import { test, expect } from '@playwright/test';

test.describe('Multi Test Suite', () => {
  test('first test', async ({ page }) => {
    await page.goto('https://example.com/a');
    await expect(page).toHaveTitle('Page A');
  });

  test('second test', async ({ page }) => {
    await page.goto('https://example.com/b');
    await expect(page).toHaveTitle('Page B');
  });

  test('third test', async ({ page }) => {
    await page.goto('https://example.com/c');
    await page.getByRole('link', { name: 'Home' }).click();
  });
});
`);
    const { first, second } = roundtrip(filePath);
    assertStructuralEquivalence(first, second);
    expect(collectTestNames(second)).toEqual(['first test', 'second test', 'third test']);
  });

  it('codeBlock preserves arbitrary code', () => {
    const filePath = writeFixture('code-block.spec.ts', `
import { test, expect } from '@playwright/test';

test.describe('Code Block', () => {
  test('runs inline code', async ({ page }) => {
    await page.goto('https://example.com');
    const title = await page.evaluate(() => document.title);
    await expect(page.getByText('Welcome')).toBeVisible();
  });
});
`);
    const { first, second } = roundtrip(filePath);
    assertStructuralEquivalence(first, second);
  });

  it('comprehensive: navigate + fill + click + assert + hooks + nested', () => {
    const filePath = writeFixture('comprehensive.spec.ts', `
import { test, expect } from '@playwright/test';

test.describe('Comprehensive Suite', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('https://example.com');
  });

  test('login flow', async ({ page }) => {
    await page.getByLabel('Email').fill('user@test.com');
    await page.getByLabel('Password').fill('pass123');
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page).toHaveURL('https://example.com/dashboard');
    await expect(page.getByText('Welcome')).toBeVisible();
  });

  test.describe('Dashboard', () => {
    test('shows user info', async ({ page }) => {
      await page.goto('https://example.com/dashboard');
      await expect(page.getByText('Profile')).toBeVisible();
    });
  });

  test.afterEach(async ({ page }) => {
    await page.goto('https://example.com/logout');
  });
});
`);
    const { first, second } = roundtrip(filePath);
    assertStructuralEquivalence(first, second);
  });

  it('getByTestId and getByPlaceholder locators', () => {
    const filePath = writeFixture('locator-strategies.spec.ts', `
import { test, expect } from '@playwright/test';

test.describe('Locator Strategies', () => {
  test('uses various locator strategies', async ({ page }) => {
    await page.goto('https://example.com');
    await page.getByTestId('search-input').fill('query');
    await page.getByPlaceholder('Search...').fill('query');
    await page.getByLabel('Email').fill('test@test.com');
  });
});
`);
    const { first, second } = roundtrip(filePath);
    assertStructuralEquivalence(first, second);
  });

  it('generated code is parseable and self-consistent after two roundtrips', () => {
    const filePath = writeFixture('double-roundtrip.spec.ts', `
import { test, expect } from '@playwright/test';

test.describe('Double Roundtrip', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('https://example.com');
  });

  test('complex test', async ({ page }) => {
    await page.getByLabel('Search').fill('playwright');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.getByText('Results')).toBeVisible();
    await expect(page).toHaveURL('https://example.com/search?q=playwright');
  });
});
`);
    // First roundtrip
    const { second, generated } = roundtrip(filePath);

    // Second roundtrip: parse the generated output, generate again, re-parse
    const secondGenPath = filePath.replace(/\.spec\.ts$/, '.gen2.spec.ts');
    const generated2 = generateTestFile(second);
    fs.writeFileSync(secondGenPath, generated2, 'utf-8');
    const third = parseTestFile(secondGenPath);

    // The second and third parses should be structurally equivalent
    assertStructuralEquivalence(second, third);
  });

  it('roundtrips getByAltText and getByTitle locator strategies', () => {
    const filePath = writeFixture(
      'alt-title-roundtrip.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('alt and title locators', () => {
  test('interacts via alt text and title', async ({ page }) => {
    await page.getByAltText('Company logo').click();
    await page.getByTitle('Close dialog').click();
    await expect(page.getByAltText('Hero image')).toBeVisible();
    await expect(page.getByTitle('Settings menu')).toBeVisible();
  });
});
`,
    );

    const { first, second, generated } = roundtrip(filePath);

    // Verify the generated output contains the locator methods
    expect(generated).toContain("getByAltText('Company logo')");
    expect(generated).toContain("getByTitle('Close dialog')");
    expect(generated).toContain("getByAltText('Hero image')");
    expect(generated).toContain("getByTitle('Settings menu')");

    // Structural equivalence between first parse and roundtripped parse
    assertStructuralEquivalence(first, second);
  });

});
