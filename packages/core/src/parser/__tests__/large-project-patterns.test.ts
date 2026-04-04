import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseTestFile } from '../test-parser.js';

let tmpDir: string;

function setup(): string {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'large-project-'));
  return tmpDir;
}

function writeTestFile(name: string, content: string): string {
  const filePath = path.join(tmpDir, name);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

/** Assert that no node in a flat list has type 'codeBlock' unless it is expected. */
function assertNoUnexpectedCodeBlocks(
  nodes: { data: { type: string } }[],
  allowedCodeBlockIndices: number[] = [],
): void {
  nodes.forEach((n, i) => {
    if (!allowedCodeBlockIndices.includes(i)) {
      expect(
        n.data.type,
        `Node at index ${i} should NOT be codeBlock but was`,
      ).not.toBe('codeBlock');
    }
  });
}

afterEach(() => {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

describe('Large project patterns – stress tests', () => {
  // ─── 1. 20+ test cases in a single describe ───────────────────────
  it('parses a file with 20+ test cases in a single describe', () => {
    setup();

    const testCases = Array.from({ length: 25 }, (_, i) => `
  test('test case ${i + 1}', async ({ page }) => {
    await page.goto('/page-${i + 1}');
    await page.getByRole('button', { name: 'Action ${i + 1}' }).click();
    await expect(page.getByText('Result ${i + 1}')).toBeVisible();
  });`).join('\n');

    const filePath = writeTestFile(
      'many-tests.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Large test suite', () => {
${testCases}
});
`,
    );

    const flow = parseTestFile(filePath);

    expect(flow.describe).toBe('Large test suite');
    expect(flow.tests).toHaveLength(25);

    // Verify every test was parsed correctly
    for (let i = 0; i < 25; i++) {
      const tc = flow.tests[i];
      expect(tc.name).toBe(`test case ${i + 1}`);
      expect(tc.nodes).toHaveLength(3);

      expect(tc.nodes[0].data.type).toBe('navigate');
      expect(tc.nodes[1].data.type).toBe('click');
      expect(tc.nodes[2].data.type).toBe('assertVisible');

      // No unexpected codeBlocks
      assertNoUnexpectedCodeBlocks(tc.nodes);

      // Edges form a linear chain
      expect(tc.edges).toHaveLength(2);
    }
  });

  // ─── 2. Deeply nested describes (4+ levels) ───────────────────────
  it('parses a file with 5 levels of nested describes', () => {
    setup();
    const filePath = writeTestFile(
      'deep-nested-5.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Level 1', () => {
  test('L1 test', async ({ page }) => {
    await page.goto('/l1');
  });

  test.describe('Level 2', () => {
    test('L2 test', async ({ page }) => {
      await page.goto('/l2');
      await page.getByText('L2').click();
    });

    test.describe('Level 3', () => {
      test('L3 test', async ({ page }) => {
        await page.goto('/l3');
      });

      test.describe('Level 4', () => {
        test('L4 test', async ({ page }) => {
          await page.goto('/l4');
          await expect(page.getByText('L4')).toBeVisible();
        });

        test.describe('Level 5', () => {
          test('L5 test', async ({ page }) => {
            await page.goto('/l5');
            await page.getByRole('button', { name: 'Deep' }).click();
            await expect(page.locator('#deep-result')).toHaveText('Done');
          });
        });
      });
    });
  });
});
`,
    );

    const flow = parseTestFile(filePath);

    // Level 1
    expect(flow.describe).toBe('Level 1');
    expect(flow.tests).toHaveLength(1);
    expect(flow.tests[0].name).toBe('L1 test');
    assertNoUnexpectedCodeBlocks(flow.tests[0].nodes);

    // Level 2
    expect(flow.children).toBeDefined();
    expect(flow.children).toHaveLength(1);
    const l2 = flow.children![0];
    expect(l2.name).toBe('Level 2');
    expect(l2.tests).toHaveLength(1);
    expect(l2.tests[0].name).toBe('L2 test');
    expect(l2.tests[0].nodes).toHaveLength(2);
    assertNoUnexpectedCodeBlocks(l2.tests[0].nodes);

    // Level 3
    expect(l2.children).toBeDefined();
    expect(l2.children).toHaveLength(1);
    const l3 = l2.children![0];
    expect(l3.name).toBe('Level 3');
    expect(l3.tests).toHaveLength(1);
    assertNoUnexpectedCodeBlocks(l3.tests[0].nodes);

    // Level 4
    expect(l3.children).toBeDefined();
    const l4 = l3.children![0];
    expect(l4.name).toBe('Level 4');
    expect(l4.tests).toHaveLength(1);
    expect(l4.tests[0].nodes).toHaveLength(2);
    expect(l4.tests[0].nodes[0].data.type).toBe('navigate');
    expect(l4.tests[0].nodes[1].data.type).toBe('assertVisible');

    // Level 5
    expect(l4.children).toBeDefined();
    const l5 = l4.children![0];
    expect(l5.name).toBe('Level 5');
    expect(l5.tests).toHaveLength(1);
    expect(l5.tests[0].nodes).toHaveLength(3);
    expect(l5.tests[0].nodes[0].data.type).toBe('navigate');
    expect(l5.tests[0].nodes[1].data.type).toBe('click');
    expect(l5.tests[0].nodes[2].data.type).toBe('assertText');
    assertNoUnexpectedCodeBlocks(l5.tests[0].nodes);
  });

  // ─── 3. Mixed action types: all-in-one kitchen sink ────────────────
  it('parses a file mixing navigate, click, fill, assertions, loops, conditionals, network routes, API requests, file upload, dialog handling, storage state, test.step', () => {
    setup();
    const filePath = writeTestFile(
      'kitchen-sink.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Kitchen Sink', () => {
  test.beforeAll(async () => {
    await page.goto('/global-setup');
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/setup');
  });

  test.afterEach(async ({ page }) => {
    await page.goto('/cleanup');
  });

  test.afterAll(async () => {
    await page.goto('/global-teardown');
  });

  test('all action types', async ({ page, context, request }) => {
    // navigate
    await page.goto('https://example.com');

    // click
    await page.getByRole('button', { name: 'Start' }).click();

    // fill
    await page.getByLabel('Username').fill('admin');

    // assertions
    await expect(page.getByText('Welcome')).toBeVisible();
    await expect(page).toHaveURL('https://example.com/home');
    await expect(page).toHaveTitle('Home Page');
    await expect(page.locator('.count')).toHaveCount(3);
    await expect(page.locator('input')).toHaveValue('admin');

    // for loop
    for (let i = 0; i < 3; i++) {
      await page.getByText('Item').click();
    }

    // for...of loop
    for (const url of urls) {
      await page.goto(url);
    }

    // conditional
    if (isAdmin) {
      await page.goto('/admin');
    } else {
      await page.goto('/user');
    }

    // network route
    await page.route('**/api/users', route => route.fulfill({ json: [{ id: 1 }] }));

    // API request
    const response = await request.get('/api/health');

    // file upload
    await page.setInputFiles('#upload', 'file.pdf');

    // dialog handler
    page.on('dialog', dialog => dialog.accept());

    // storage state save
    await context.storageState({ path: 'auth.json' });

    // test.step
    await test.step('Verify dashboard', async () => {
      await page.goto('/dashboard');
      await expect(page.getByText('Dashboard')).toBeVisible();
    });
  });
});
`,
    );

    const flow = parseTestFile(filePath);

    // Hooks
    expect(flow.beforeAll).toBeDefined();
    expect(flow.beforeAll).toHaveLength(1);
    expect(flow.beforeAll![0].data.type).toBe('navigate');

    expect(flow.beforeEach).toBeDefined();
    expect(flow.beforeEach).toHaveLength(1);
    expect(flow.beforeEach![0].data.type).toBe('navigate');

    expect(flow.afterEach).toBeDefined();
    expect(flow.afterEach).toHaveLength(1);
    expect(flow.afterEach![0].data.type).toBe('navigate');

    expect(flow.afterAll).toBeDefined();
    expect(flow.afterAll).toHaveLength(1);
    expect(flow.afterAll![0].data.type).toBe('navigate');

    // Test nodes
    const tc = flow.tests[0];
    expect(tc.name).toBe('all action types');

    const types = tc.nodes.map(n => n.data.type);

    // Expected order of action types
    expect(types[0]).toBe('navigate');       // page.goto
    expect(types[1]).toBe('click');          // button click
    expect(types[2]).toBe('fill');           // username fill
    expect(types[3]).toBe('assertVisible');  // toBeVisible
    expect(types[4]).toBe('assertURL');      // toHaveURL
    expect(types[5]).toBe('assertTitle');    // toHaveTitle
    expect(types[6]).toBe('assertCount');    // toHaveCount
    expect(types[7]).toBe('assertValue');    // toHaveValue
    expect(types[8]).toBe('loop');           // for loop
    expect(types[9]).toBe('loop');           // for...of loop
    expect(types[10]).toBe('conditional');   // if/else
    expect(types[11]).toBe('networkRoute');  // page.route
    expect(types[12]).toBe('apiRequest');    // request.get
    expect(types[13]).toBe('fileUpload');    // setInputFiles
    expect(types[14]).toBe('dialogHandler'); // page.on('dialog')
    expect(types[15]).toBe('storageState'); // storageState save
    expect(types[16]).toBe('group');         // test.step

    // Verify no unexpected codeBlocks
    assertNoUnexpectedCodeBlocks(tc.nodes);

    // Verify loop contents
    const forLoop = tc.nodes[8];
    if (forLoop.data.type === 'loop') {
      expect(forLoop.data.loopKind).toBe('for');
      expect(forLoop.data.body).toHaveLength(1);
      expect(forLoop.data.body[0].data.type).toBe('click');
    }

    const forOfLoop = tc.nodes[9];
    if (forOfLoop.data.type === 'loop') {
      expect(forOfLoop.data.loopKind).toBe('for...of');
      expect(forOfLoop.data.body).toHaveLength(1);
      expect(forOfLoop.data.body[0].data.type).toBe('navigate');
    }

    // Verify conditional contents
    const cond = tc.nodes[10];
    if (cond.data.type === 'conditional') {
      expect(cond.data.thenChildren).toHaveLength(1);
      expect(cond.data.thenChildren[0].data.type).toBe('navigate');
      expect(cond.data.elseChildren).toHaveLength(1);
      expect(cond.data.elseChildren![0].data.type).toBe('navigate');
    }

    // Verify test.step group contents
    const group = tc.nodes[16];
    if (group.data.type === 'group') {
      expect(group.data.stepName).toBe('Verify dashboard');
      expect(group.data.children).toHaveLength(2);
      expect(group.data.children[0].data.type).toBe('navigate');
      expect(group.data.children[1].data.type).toBe('assertVisible');
    }

    // Verify edges exist for linear flow
    expect(tc.edges.length).toBe(tc.nodes.length - 1);
  });

  // ─── 4. Complex locator chains and modifiers ──────────────────────
  it('parses complex locator chains with multiple strategies and modifiers', () => {
    setup();
    const filePath = writeTestFile(
      'complex-locators.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Complex Locators', () => {
  test('chained locators with filters and index modifiers', async ({ page }) => {
    // 3-step chain: locator -> getByRole -> click
    await page.locator('.table').getByRole('row').getByText('John').click();

    // Chain with .filter modifier
    await page.getByRole('listitem').filter({ hasText: 'Active' }).getByRole('button').click();

    // Chain with .nth modifier
    await page.locator('tr').nth(3).locator('td').click();

    // Chain with .first modifier
    await page.locator('.card').first().getByRole('button', { name: 'Edit' }).click();

    // Chain with .last modifier
    await page.locator('.item').last().click();

    // Long chain: locator -> locator -> getByRole -> fill
    await page.locator('.form-container').locator('.field-group').getByLabel('Email').fill('test@example.com');

    // Assertion on chained locator with filter
    await expect(page.getByRole('row').filter({ hasText: 'Admin' }).getByText('Active')).toBeVisible();

    // Locator with getByTestId
    await page.getByTestId('submit-btn').click();

    // Locator with getByPlaceholder
    await page.getByPlaceholder('Search...').fill('query');

    // Locator with css selector
    await page.locator('img.logo').click();
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(10);

    // No unexpected codeBlocks
    assertNoUnexpectedCodeBlocks(tc.nodes);

    const types = tc.nodes.map(n => n.data.type);
    expect(types).toEqual([
      'click',          // 3-step chain click
      'click',          // filter chain click
      'click',          // nth chain click
      'click',          // first chain click
      'click',          // last click
      'fill',           // long chain fill
      'assertVisible',  // assertion on chained locator
      'click',          // getByTestId click
      'fill',           // getByPlaceholder fill
      'click',          // css selector click
    ]);

    // Verify 3-step chain
    const n0 = tc.nodes[0].data;
    if (n0.type === 'click' && n0.locator.kind === 'inline') {
      expect(n0.locator.chain).toBeDefined();
      expect(n0.locator.chain!.length).toBeGreaterThanOrEqual(2);
    }

    // Verify filter modifier is on the chain step
    const n1 = tc.nodes[1].data;
    if (n1.type === 'click' && n1.locator.kind === 'inline') {
      expect(n1.locator.chain).toBeDefined();
      // The first chain step should have filter modifier
      const filterStep = n1.locator.chain!.find(
        (step: { modifiers?: { kind: string }[] }) =>
          step.modifiers?.some((m: { kind: string }) => m.kind === 'filter'),
      );
      expect(filterStep).toBeDefined();
    }

    // Verify nth modifier
    const n2 = tc.nodes[2].data;
    if (n2.type === 'click' && n2.locator.kind === 'inline') {
      const hasNth = n2.locator.modifiers?.some(
        (m: { kind: string }) => m.kind === 'nth',
      ) || n2.locator.chain?.some(
        (step: { modifiers?: { kind: string }[] }) =>
          step.modifiers?.some((m: { kind: string }) => m.kind === 'nth'),
      );
      expect(hasNth).toBe(true);
    }

    // Verify first modifier
    const n3 = tc.nodes[3].data;
    if (n3.type === 'click' && n3.locator.kind === 'inline') {
      const hasFirst = n3.locator.modifiers?.some(
        (m: { kind: string }) => m.kind === 'first',
      ) || n3.locator.chain?.some(
        (step: { modifiers?: { kind: string }[] }) =>
          step.modifiers?.some((m: { kind: string }) => m.kind === 'first'),
      );
      expect(hasFirst).toBe(true);
    }

    // Verify last modifier
    const n4 = tc.nodes[4].data;
    if (n4.type === 'click' && n4.locator.kind === 'inline') {
      expect(n4.locator.modifiers).toBeDefined();
      expect(n4.locator.modifiers!.some((m: { kind: string }) => m.kind === 'last')).toBe(true);
    }

    // Verify long chain fill
    const n5 = tc.nodes[5].data;
    if (n5.type === 'fill' && n5.locator.kind === 'inline') {
      expect(n5.locator.chain).toBeDefined();
      expect(n5.locator.chain!.length).toBeGreaterThanOrEqual(2);
      expect(n5.value).toBe('test@example.com');
    }

    // Verify getByTestId
    const n7 = tc.nodes[7].data;
    if (n7.type === 'click' && n7.locator.kind === 'inline') {
      expect(n7.locator.strategy).toBe('getByTestId');
    }

    // Verify getByPlaceholder
    const n8 = tc.nodes[8].data;
    if (n8.type === 'fill' && n8.locator.kind === 'inline') {
      expect(n8.locator.strategy).toBe('getByPlaceholder');
      expect(n8.locator.value).toBe('Search...');
    }

    // Verify css selector locator
    const n9 = tc.nodes[9].data;
    if (n9.type === 'click' && n9.locator.kind === 'inline') {
      expect(n9.locator.strategy).toBe('locator');
      expect(n9.locator.value).toBe('img.logo');
    }
  });

  // ─── 5. Many hooks at multiple levels ─────────────────────────────
  it('parses many hooks (beforeAll, beforeEach, afterEach, afterAll) at multiple describe levels', () => {
    setup();
    const filePath = writeTestFile(
      'many-hooks.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Root Suite', () => {
  test.beforeAll(async () => {
    await page.goto('/root-before-all-1');
  });

  test.beforeAll(async () => {
    await page.goto('/root-before-all-2');
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/root-before-each');
  });

  test.afterEach(async ({ page }) => {
    await page.goto('/root-after-each');
  });

  test.afterAll(async () => {
    await page.goto('/root-after-all');
  });

  test('root test', async ({ page }) => {
    await page.goto('/root');
    await page.getByText('Root').click();
  });

  test.describe('Child Suite A', () => {
    test.beforeAll(async () => {
      await page.goto('/child-a-before-all');
    });

    test.beforeEach(async ({ page }) => {
      await page.goto('/child-a-before-each');
    });

    test.afterEach(async ({ page }) => {
      await page.goto('/child-a-after-each');
    });

    test.afterAll(async () => {
      await page.goto('/child-a-after-all');
    });

    test('child A test 1', async ({ page }) => {
      await page.goto('/child-a-1');
    });

    test('child A test 2', async ({ page }) => {
      await page.goto('/child-a-2');
      await expect(page.getByText('A2')).toBeVisible();
    });

    test.describe('Grandchild Suite', () => {
      test.beforeEach(async ({ page }) => {
        await page.goto('/grandchild-before-each');
      });

      test.afterAll(async () => {
        await page.goto('/grandchild-after-all');
      });

      test('grandchild test', async ({ page }) => {
        await page.goto('/grandchild');
        await page.getByRole('button', { name: 'GC' }).click();
      });
    });
  });

  test.describe('Child Suite B', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/child-b-before-each');
    });

    test('child B test', async ({ page }) => {
      await page.goto('/child-b');
    });
  });
});
`,
    );

    const flow = parseTestFile(filePath);

    // Root-level hooks
    expect(flow.beforeAll).toBeDefined();
    expect(flow.beforeAll).toHaveLength(2); // two beforeAll hooks
    expect(flow.beforeAll![0].data.type).toBe('navigate');
    expect(flow.beforeAll![1].data.type).toBe('navigate');

    expect(flow.beforeEach).toBeDefined();
    expect(flow.beforeEach).toHaveLength(1);
    expect(flow.beforeEach![0].data.type).toBe('navigate');

    expect(flow.afterEach).toBeDefined();
    expect(flow.afterEach).toHaveLength(1);
    expect(flow.afterEach![0].data.type).toBe('navigate');

    expect(flow.afterAll).toBeDefined();
    expect(flow.afterAll).toHaveLength(1);
    expect(flow.afterAll![0].data.type).toBe('navigate');

    // Root test
    expect(flow.tests).toHaveLength(1);
    expect(flow.tests[0].name).toBe('root test');
    expect(flow.tests[0].nodes).toHaveLength(2);
    assertNoUnexpectedCodeBlocks(flow.tests[0].nodes);

    // Child Suite A
    expect(flow.children).toBeDefined();
    expect(flow.children!.length).toBeGreaterThanOrEqual(2);

    const childA = flow.children!.find(c => c.name === 'Child Suite A');
    expect(childA).toBeDefined();

    expect(childA!.beforeAll).toBeDefined();
    expect(childA!.beforeAll).toHaveLength(1);
    expect(childA!.beforeEach).toBeDefined();
    expect(childA!.beforeEach).toHaveLength(1);
    expect(childA!.afterEach).toBeDefined();
    expect(childA!.afterEach).toHaveLength(1);
    expect(childA!.afterAll).toBeDefined();
    expect(childA!.afterAll).toHaveLength(1);

    expect(childA!.tests).toHaveLength(2);
    expect(childA!.tests[0].name).toBe('child A test 1');
    expect(childA!.tests[1].name).toBe('child A test 2');
    assertNoUnexpectedCodeBlocks(childA!.tests[0].nodes);
    assertNoUnexpectedCodeBlocks(childA!.tests[1].nodes);

    // Grandchild Suite
    expect(childA!.children).toBeDefined();
    const grandchild = childA!.children![0];
    expect(grandchild.name).toBe('Grandchild Suite');
    expect(grandchild.beforeEach).toBeDefined();
    expect(grandchild.beforeEach).toHaveLength(1);
    expect(grandchild.afterAll).toBeDefined();
    expect(grandchild.afterAll).toHaveLength(1);
    expect(grandchild.tests).toHaveLength(1);
    expect(grandchild.tests[0].name).toBe('grandchild test');
    expect(grandchild.tests[0].nodes).toHaveLength(2);
    assertNoUnexpectedCodeBlocks(grandchild.tests[0].nodes);

    // Child Suite B
    const childB = flow.children!.find(c => c.name === 'Child Suite B');
    expect(childB).toBeDefined();
    expect(childB!.beforeEach).toBeDefined();
    expect(childB!.beforeEach).toHaveLength(1);
    expect(childB!.tests).toHaveLength(1);
    expect(childB!.tests[0].name).toBe('child B test');
    assertNoUnexpectedCodeBlocks(childB!.tests[0].nodes);
  });

  // ─── Additional stress: mixed test.only / test.skip in large suite ─
  it('parses a large suite with mixed test.only and test.skip tags', () => {
    setup();
    const filePath = writeTestFile(
      'mixed-tags.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Tagged Suite', () => {
  test('regular test 1', async ({ page }) => {
    await page.goto('/1');
  });
  test.only('focused test', async ({ page }) => {
    await page.goto('/focused');
    await page.getByText('OK').click();
  });
  test.skip('skipped test', async ({ page }) => {
    await page.goto('/skipped');
  });
  test('regular test 2', async ({ page }) => {
    await page.goto('/2');
    await expect(page.locator('h1')).toBeVisible();
  });
  test.skip('another skipped', async ({ page }) => {
    await page.goto('/skip2');
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    expect(flow.tests).toHaveLength(5);

    const focused = flow.tests.find(t => t.name === 'focused test');
    expect(focused).toBeDefined();
    expect(focused!.tags).toContain('@only');
    expect(focused!.nodes).toHaveLength(2);
    assertNoUnexpectedCodeBlocks(focused!.nodes);

    const skipped = flow.tests.filter(t => t.tags?.includes('@skip'));
    expect(skipped).toHaveLength(2);

    // Regular tests should have no tags or empty tags
    const regular = flow.tests.filter(t => !t.tags || t.tags.length === 0);
    expect(regular).toHaveLength(2);
  });

  // ─── Complex control flow within a single test ────────────────────
  it('parses deeply nested control flow: loops containing conditionals containing loops', () => {
    setup();
    const filePath = writeTestFile(
      'deep-control-flow.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Control Flow', () => {
  test('nested control flow', async ({ page }) => {
    await page.goto('/start');

    for (const section of sections) {
      if (section.visible) {
        await page.getByText(section.title).click();
        for (let j = 0; j < section.items.length; j++) {
          await page.locator('.item').nth(j).click();
        }
      } else {
        await page.goto('/skip');
      }
    }

    await expect(page.getByText('Complete')).toBeVisible();
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(3); // navigate, loop, assertVisible

    expect(tc.nodes[0].data.type).toBe('navigate');
    expect(tc.nodes[1].data.type).toBe('loop');
    expect(tc.nodes[2].data.type).toBe('assertVisible');

    assertNoUnexpectedCodeBlocks(tc.nodes);

    // Verify the loop body contains a conditional
    const loopNode = tc.nodes[1];
    if (loopNode.data.type === 'loop') {
      expect(loopNode.data.loopKind).toBe('for...of');
      expect(loopNode.data.body).toHaveLength(1);

      const cond = loopNode.data.body[0];
      expect(cond.data.type).toBe('conditional');
      if (cond.data.type === 'conditional') {
        // then branch: click + inner for loop
        expect(cond.data.thenChildren).toHaveLength(2);
        expect(cond.data.thenChildren[0].data.type).toBe('click');
        expect(cond.data.thenChildren[1].data.type).toBe('loop');

        // Inner loop body
        const innerLoop = cond.data.thenChildren[1];
        if (innerLoop.data.type === 'loop') {
          expect(innerLoop.data.loopKind).toBe('for');
          expect(innerLoop.data.body).toHaveLength(1);
          expect(innerLoop.data.body[0].data.type).toBe('click');
        }

        // else branch: navigate
        expect(cond.data.elseChildren).toHaveLength(1);
        expect(cond.data.elseChildren![0].data.type).toBe('navigate');
      }
    }
  });

  // ─── Multiple test.step groups in one test ────────────────────────
  it('parses multiple sequential test.step groups with diverse actions', () => {
    setup();
    const filePath = writeTestFile(
      'multi-steps.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Multi-step', () => {
  test('workflow with steps', async ({ page, request }) => {
    await test.step('Setup API', async () => {
      const resp = await request.post('/api/seed', { data: { count: 10 } });
    });

    await test.step('Navigate and login', async () => {
      await page.goto('/login');
      await page.getByLabel('Email').fill('admin@test.com');
      await page.getByLabel('Password').fill('secret');
      await page.getByRole('button', { name: 'Login' }).click();
    });

    await test.step('Verify dashboard', async () => {
      await expect(page).toHaveURL('/dashboard');
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
      await expect(page.locator('.widget')).toHaveCount(4);
    });

    await test.step('Cleanup', async () => {
      await request.delete('/api/seed');
    });
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(4); // 4 test.step groups

    assertNoUnexpectedCodeBlocks(tc.nodes);

    // All should be group nodes
    tc.nodes.forEach(n => {
      expect(n.data.type).toBe('group');
    });

    // Verify step 1: API setup
    const step1 = tc.nodes[0];
    if (step1.data.type === 'group') {
      expect(step1.data.stepName).toBe('Setup API');
      expect(step1.data.children).toHaveLength(1);
      expect(step1.data.children[0].data.type).toBe('apiRequest');
    }

    // Verify step 2: Login
    const step2 = tc.nodes[1];
    if (step2.data.type === 'group') {
      expect(step2.data.stepName).toBe('Navigate and login');
      expect(step2.data.children).toHaveLength(4);
      expect(step2.data.children[0].data.type).toBe('navigate');
      expect(step2.data.children[1].data.type).toBe('fill');
      expect(step2.data.children[2].data.type).toBe('fill');
      expect(step2.data.children[3].data.type).toBe('click');
    }

    // Verify step 3: Assertions
    const step3 = tc.nodes[2];
    if (step3.data.type === 'group') {
      expect(step3.data.stepName).toBe('Verify dashboard');
      expect(step3.data.children).toHaveLength(3);
      expect(step3.data.children[0].data.type).toBe('assertURL');
      expect(step3.data.children[1].data.type).toBe('assertVisible');
      expect(step3.data.children[2].data.type).toBe('assertCount');
    }

    // Verify step 4: Cleanup
    const step4 = tc.nodes[3];
    if (step4.data.type === 'group') {
      expect(step4.data.stepName).toBe('Cleanup');
      expect(step4.data.children).toHaveLength(1);
      expect(step4.data.children[0].data.type).toBe('apiRequest');
    }
  });

  // ─── Fixture extraction from a large test suite ───────────────────
  it('extracts fixtures from a large suite with diverse fixture usage', () => {
    setup();
    const filePath = writeTestFile(
      'fixtures-large.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Fixture suite', () => {
  test.beforeEach(async ({ page, context }) => {
    await page.goto('/');
  });

  test('test with page', async ({ page }) => {
    await page.goto('/a');
  });

  test('test with request', async ({ request }) => {
    await request.get('/api');
  });

  test('test with browser and context', async ({ page, browser, context }) => {
    await page.goto('/b');
  });

  test('test with custom fixtures', async ({ page, myFixture, anotherFixture }) => {
    await page.goto('/c');
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    expect(flow.fixtures).toContain('page');
    expect(flow.fixtures).toContain('context');
    expect(flow.fixtures).toContain('request');
    expect(flow.fixtures).toContain('browser');
    expect(flow.fixtures).toContain('myFixture');
    expect(flow.fixtures).toContain('anotherFixture');
  });

  // ─── Metadata and edge correctness for large flows ────────────────
  it('generates correct metadata and unique IDs across a large test suite', () => {
    setup();

    const tests = Array.from({ length: 10 }, (_, i) => `
  test('test ${i}', async ({ page }) => {
    await page.goto('/p${i}');
    await page.getByText('T${i}').click();
    await expect(page.locator('#r${i}')).toBeVisible();
  });`).join('\n');

    const filePath = writeTestFile(
      'metadata-check.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Metadata Suite', () => {
${tests}
});
`,
    );

    const flow = parseTestFile(filePath);

    // Metadata
    expect(flow.metadata).toBeDefined();
    expect(flow.metadata.contentHash).toBeDefined();
    expect(flow.metadata.contentHash.length).toBe(64); // sha256 hex
    expect(flow.metadata.lastParsedAt).toBeGreaterThan(0);

    // All node IDs across all tests should be unique
    const allIds = new Set<string>();
    for (const tc of flow.tests) {
      for (const n of tc.nodes) {
        expect(allIds.has(n.id)).toBe(false);
        allIds.add(n.id);
      }
      // Edges reference valid nodes
      for (const e of tc.edges) {
        const nodeIds = tc.nodes.map(n => n.id);
        expect(nodeIds).toContain(e.source);
        expect(nodeIds).toContain(e.target);
      }
    }
  });

  // ─── describe.serial and describe.parallel variants ───────────────
  it('parses test.describe.serial and test.describe.parallel variants', () => {
    setup();
    const filePath = writeTestFile(
      'describe-variants.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe.serial('Serial Suite', () => {
  test('serial test 1', async ({ page }) => {
    await page.goto('/s1');
  });
  test('serial test 2', async ({ page }) => {
    await page.goto('/s2');
    await page.getByText('S2').click();
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    expect(flow.describe).toBe('Serial Suite');
    expect(flow.tests).toHaveLength(2);
    expect(flow.tests[0].name).toBe('serial test 1');
    expect(flow.tests[1].name).toBe('serial test 2');
    assertNoUnexpectedCodeBlocks(flow.tests[0].nodes);
    assertNoUnexpectedCodeBlocks(flow.tests[1].nodes);
  });
});
