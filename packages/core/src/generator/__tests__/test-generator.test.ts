import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateTestFile } from '../test-generator.js';
import { parseTestFile } from '../../parser/test-parser.js';
import type { TestFlow } from '../../model/test-flow.js';
import type { ActionNode } from '../../model/action-node.js';

let tmpDir: string;

function setup(): string {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-generator-'));
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

function makeNode(id: string, data: ActionNode['data'], yPos = 0): ActionNode {
  return {
    id,
    type: data.type,
    position: { x: 250, y: yPos },
    data,
  };
}

function makeEdge(source: string, target: string) {
  return { id: `edge_${source}_${target}`, source, target };
}

function makeMinimalFlow(overrides: Partial<TestFlow> = {}): TestFlow {
  return {
    id: 'test-flow-1',
    filePath: 'test.spec.ts',
    describe: 'Test Suite',
    tests: [],
    imports: [{ moduleSpecifier: '@playwright/test', namedImports: ['test', 'expect'] }],
    fixtures: ['page'],
    metadata: {
      contentHash: 'abc123',
      lastParsedAt: Date.now(),
      parseWarnings: [],
    },
    ...overrides,
  };
}

describe('generateTestFile', () => {
  it('generates valid .spec.ts from a TestFlow with navigate, click, assertText nodes', () => {
    const navNode = makeNode('n1', { type: 'navigate', url: 'https://example.com' }, 0);
    const clickNode = makeNode('n2', {
      type: 'click',
      locator: { kind: 'inline', strategy: 'getByRole', value: "'button', { name: 'Submit' }" },
    }, 150);
    const assertNode = makeNode('n3', {
      type: 'assertText',
      locator: { kind: 'inline', strategy: 'getByText', value: 'Success' },
      expected: 'Success',
      exact: true,
    }, 300);

    const flow = makeMinimalFlow({
      tests: [
        {
          id: 'tc1',
          name: 'basic test',
          nodes: [navNode, clickNode, assertNode],
          edges: [makeEdge('n1', 'n2'), makeEdge('n2', 'n3')],
        },
      ],
    });

    const output = generateTestFile(flow);

    expect(output).toContain("import { test, expect } from '@playwright/test';");
    expect(output).toContain("test.describe('Test Suite', () => {");
    expect(output).toContain("test('basic test', async ({ page }) => {");
    expect(output).toContain("await page.goto('https://example.com');");
    expect(output).toContain("await page.getByRole('button', { name: 'Submit' }).click();");
    expect(output).toContain("await expect(page.getByText('Success')).toHaveText('Success');");
    expect(output).toContain('});');
  });

  it('generates beforeEach and afterEach', () => {
    const beforeNode = makeNode('b1', { type: 'navigate', url: '/setup' });
    const afterNode = makeNode('a1', { type: 'navigate', url: '/teardown' });

    const flow = makeMinimalFlow({
      beforeEach: [beforeNode],
      afterEach: [afterNode],
      tests: [
        {
          id: 'tc1',
          name: 'a test',
          nodes: [makeNode('n1', { type: 'navigate', url: '/' })],
          edges: [],
        },
      ],
    });

    const output = generateTestFile(flow);

    expect(output).toContain('test.beforeEach(async ({ page }) => {');
    expect(output).toContain("await page.goto('/setup');");
    expect(output).toContain('test.afterEach(async ({ page }) => {');
    expect(output).toContain("await page.goto('/teardown');");
  });

  it('generates test.skip and test.only tags', () => {
    const flow = makeMinimalFlow({
      tests: [
        {
          id: 'tc_skip',
          name: 'skipped test',
          nodes: [makeNode('n1', { type: 'navigate', url: '/' })],
          edges: [],
          tags: ['@skip'],
        },
        {
          id: 'tc_only',
          name: 'focused test',
          nodes: [makeNode('n2', { type: 'navigate', url: '/' })],
          edges: [],
          tags: ['@only'],
        },
      ],
    });

    const output = generateTestFile(flow);

    expect(output).toContain("test.skip('skipped test'");
    expect(output).toContain("test.only('focused test'");
  });

  it('generates pageObjectRef calls', () => {
    const poRefNode = makeNode('n1', {
      type: 'pageObjectRef',
      pageObjectId: 'loginPage',
      method: 'login',
      args: ['admin', 'secret'],
    });

    const flow = makeMinimalFlow({
      tests: [
        {
          id: 'tc1',
          name: 'page object test',
          nodes: [poRefNode],
          edges: [],
        },
      ],
    });

    const output = generateTestFile(flow);

    expect(output).toContain("await loginPage.login('admin', 'secret');");
  });

  it('generates codeBlock actions verbatim', () => {
    const codeNode = makeNode('n1', {
      type: 'codeBlock',
      code: "const data = await page.evaluate(() => document.title);",
    });

    const flow = makeMinimalFlow({
      tests: [
        {
          id: 'tc1',
          name: 'code block test',
          nodes: [codeNode],
          edges: [],
        },
      ],
    });

    const output = generateTestFile(flow);
    expect(output).toContain('const data = await page.evaluate(() => document.title);');
  });

  it('generates different locator strategies correctly', () => {
    const nodes = [
      makeNode('n1', {
        type: 'click',
        locator: { kind: 'inline', strategy: 'getByLabel', value: 'Username' },
      }),
      makeNode('n2', {
        type: 'fill',
        locator: { kind: 'inline', strategy: 'getByPlaceholder', value: 'Search...' },
        value: 'query',
      }),
      makeNode('n3', {
        type: 'click',
        locator: { kind: 'inline', strategy: 'getByTestId', value: 'submit-btn' },
      }),
      makeNode('n4', {
        type: 'click',
        locator: { kind: 'inline', strategy: 'locator', value: '#my-element' },
      }),
    ];

    const flow = makeMinimalFlow({
      tests: [
        {
          id: 'tc1',
          name: 'locator strategies',
          nodes,
          edges: [makeEdge('n1', 'n2'), makeEdge('n2', 'n3'), makeEdge('n3', 'n4')],
        },
      ],
    });

    const output = generateTestFile(flow);

    expect(output).toContain("await page.getByLabel('Username').click();");
    expect(output).toContain("await page.getByPlaceholder('Search...').fill('query');");
    expect(output).toContain("await page.getByTestId('submit-btn').click();");
    expect(output).toContain("await page.locator('#my-element').click();");
  });

  it('generates imports with default import', () => {
    const flow = makeMinimalFlow({
      imports: [
        { moduleSpecifier: '@playwright/test', namedImports: ['test', 'expect'] },
        { moduleSpecifier: './helpers', namedImports: ['setup'], defaultImport: 'Helpers' },
      ],
      tests: [
        {
          id: 'tc1',
          name: 'imports test',
          nodes: [makeNode('n1', { type: 'navigate', url: '/' })],
          edges: [],
        },
      ],
    });

    const output = generateTestFile(flow);

    expect(output).toContain("import { test, expect } from '@playwright/test';");
    expect(output).toContain("import Helpers, { setup } from './helpers';");
  });

  it('generates side-effect imports', () => {
    const flow = makeMinimalFlow({
      imports: [
        { moduleSpecifier: '@playwright/test', namedImports: ['test', 'expect'] },
        { moduleSpecifier: './setup', namedImports: [], isSideEffect: true },
      ],
      tests: [
        {
          id: 'tc1',
          name: 'side effect test',
          nodes: [makeNode('n1', { type: 'navigate', url: '/' })],
          edges: [],
        },
      ],
    });

    const output = generateTestFile(flow);

    expect(output).toContain("import './setup';");
    // Should NOT produce `import  from './setup'`
    expect(output).not.toContain("import  from");
  });

  it('generates namespace imports', () => {
    const flow = makeMinimalFlow({
      imports: [
        { moduleSpecifier: '@playwright/test', namedImports: ['test', 'expect'] },
        { moduleSpecifier: '../utils/helpers', namedImports: [], namespaceImport: 'utils' },
      ],
      tests: [
        {
          id: 'tc1',
          name: 'namespace test',
          nodes: [makeNode('n1', { type: 'navigate', url: '/' })],
          edges: [],
        },
      ],
    });

    const output = generateTestFile(flow);

    expect(output).toContain("import * as utils from '../utils/helpers';");
  });

  it('generates all utility import types together', () => {
    const flow = makeMinimalFlow({
      imports: [
        { moduleSpecifier: '@playwright/test', namedImports: ['test', 'expect'] },
        { moduleSpecifier: '../utils/helpers', namedImports: ['generateUser', 'waitForApi'] },
        { moduleSpecifier: '../lib/default-helper', namedImports: [], defaultImport: 'defaultHelper' },
        { moduleSpecifier: '../support/config', namedImports: [], namespaceImport: 'config' },
        { moduleSpecifier: '../setup/global-setup', namedImports: [], isSideEffect: true },
      ],
      tests: [
        {
          id: 'tc1',
          name: 'all imports',
          nodes: [makeNode('n1', { type: 'navigate', url: '/' })],
          edges: [],
        },
      ],
    });

    const output = generateTestFile(flow);

    expect(output).toContain("import { test, expect } from '@playwright/test';");
    expect(output).toContain("import { generateUser, waitForApi } from '../utils/helpers';");
    expect(output).toContain("import defaultHelper from '../lib/default-helper';");
    expect(output).toContain("import * as config from '../support/config';");
    expect(output).toContain("import '../setup/global-setup';");
  });

  it('round-trip: parse and regenerate utility imports', () => {
    setup();
    const original = `import { test, expect } from '@playwright/test';
import { generateUser } from '../utils/helpers';
import * as config from '../support/config';
import '../setup/global-setup';

test.describe('Utility Imports', () => {
  test('uses utilities', async ({ page }) => {
    await page.goto('/');
  });
});
`;

    const filePath = writeTestFile('utility-round-trip.spec.ts', original);
    const flow = parseTestFile(filePath);
    const output = generateTestFile(flow);

    expect(output).toContain("import { test, expect } from '@playwright/test';");
    expect(output).toContain("import { generateUser } from '../utils/helpers';");
    expect(output).toContain("import * as config from '../support/config';");
    expect(output).toContain("import '../setup/global-setup';");
  });

  it('round-trip: parse a file then generate produces functionally equivalent output', () => {
    setup();
    const original = `import { test, expect } from '@playwright/test';

test.describe('Round Trip', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('https://example.com');
  });

  test('check heading', async ({ page }) => {
    await page.getByRole('heading', { name: 'Welcome' }).click();
    await expect(page.getByText('Hello')).toBeVisible();
  });
});
`;

    const filePath = path.join(tmpDir, 'roundtrip.spec.ts');
    fs.writeFileSync(filePath, original, 'utf-8');

    // Parse
    const flow = parseTestFile(filePath);

    // Generate
    const output = generateTestFile(flow);

    // The generated output should contain the same semantic elements
    expect(output).toContain("import { test, expect } from '@playwright/test';");
    expect(output).toContain("test.describe('Round Trip', () => {");
    expect(output).toContain('test.beforeEach');
    expect(output).toContain("await page.goto('https://example.com');");
    expect(output).toContain("test('check heading'");
    expect(output).toContain('.click()');
    expect(output).toContain('toBeVisible()');

    // Parse the generated output to verify it produces a valid TestFlow
    const generatedPath = path.join(tmpDir, 'generated.spec.ts');
    fs.writeFileSync(generatedPath, output, 'utf-8');
    const reparsed = parseTestFile(generatedPath);

    expect(reparsed.describe).toBe(flow.describe);
    expect(reparsed.tests).toHaveLength(flow.tests.length);
    expect(reparsed.tests[0].name).toBe(flow.tests[0].name);
    expect(reparsed.tests[0].nodes.length).toBe(flow.tests[0].nodes.length);

    // beforeEach should survive the round trip
    expect(reparsed.beforeEach).toBeDefined();
    expect(reparsed.beforeEach!.length).toBe(flow.beforeEach!.length);

    // Node types should match
    const originalTypes = flow.tests[0].nodes.map((n) => n.data.type);
    const reparsedTypes = reparsed.tests[0].nodes.map((n) => n.data.type);
    expect(reparsedTypes).toEqual(originalTypes);
  });

  it('generates wait and screenshot actions', () => {
    const waitNode = makeNode('n1', { type: 'wait', duration: 2000 });
    const screenshotNode = makeNode('n2', { type: 'screenshot', name: 'capture.png', fullPage: true });

    const flow = makeMinimalFlow({
      tests: [
        {
          id: 'tc1',
          name: 'wait and screenshot',
          nodes: [waitNode, screenshotNode],
          edges: [makeEdge('n1', 'n2')],
        },
      ],
    });

    const output = generateTestFile(flow);

    expect(output).toContain('await page.waitForTimeout(2000);');
    expect(output).toContain("await page.screenshot({ path: 'capture.png', fullPage: true });");
  });

  it('generates multiple fixtures in callback params', () => {
    const flow = makeMinimalFlow({
      fixtures: ['page', 'loginPage', 'context'],
      tests: [
        {
          id: 'tc1',
          name: 'multi fixture',
          nodes: [makeNode('n1', { type: 'navigate', url: '/' })],
          edges: [],
        },
      ],
    });

    const output = generateTestFile(flow);

    expect(output).toContain('async ({ page, loginPage, context }) => {');
  });

  it('generates a standard for loop from a loop node', () => {
    const loopNode = makeNode('n1', {
      type: 'loop',
      loopKind: 'for',
      initializer: 'let i = 0',
      condition: 'i < 5',
      incrementer: 'i++',
      body: [
        makeNode('c1', { type: 'click', locator: { kind: 'inline', strategy: 'getByText', value: 'Item' } }),
      ],
    } as ActionNode['data']);

    const flow = makeMinimalFlow({
      tests: [{ id: 'tc1', name: 'for loop test', nodes: [loopNode], edges: [] }],
    });

    const output = generateTestFile(flow);

    expect(output).toContain('for (let i = 0; i < 5; i++) {');
    expect(output).toContain("await page.getByText('Item').click();");
    expect(output).toContain('}');
  });

  it('generates a for...of loop from a loop node', () => {
    const loopNode = makeNode('n1', {
      type: 'loop',
      loopKind: 'for...of',
      variableName: 'item',
      iterable: 'items',
      body: [
        makeNode('c1', { type: 'navigate', url: '/test' }),
      ],
    } as ActionNode['data']);

    const flow = makeMinimalFlow({
      tests: [{ id: 'tc1', name: 'for of test', nodes: [loopNode], edges: [] }],
    });

    const output = generateTestFile(flow);

    expect(output).toContain('for (const item of items) {');
    expect(output).toContain("await page.goto('/test');");
  });

  it('generates a for...in loop from a loop node', () => {
    const loopNode = makeNode('n1', {
      type: 'loop',
      loopKind: 'for...in',
      variableName: 'key',
      iterable: 'obj',
      body: [
        makeNode('c1', { type: 'navigate', url: '/test' }),
      ],
    } as ActionNode['data']);

    const flow = makeMinimalFlow({
      tests: [{ id: 'tc1', name: 'for in test', nodes: [loopNode], edges: [] }],
    });

    const output = generateTestFile(flow);

    expect(output).toContain('for (const key in obj) {');
    expect(output).toContain("await page.goto('/test');");
  });

  it('round-trip: parse for loops then generate produces equivalent code', () => {
    setup();
    const original = `import { test, expect } from '@playwright/test';

test.describe('Loop Tests', () => {
  test('loop test', async ({ page }) => {
    for (let i = 0; i < 3; i++) {
      await page.getByText('Item').click();
    }
  });
});
`;

    const filePath = path.join(tmpDir, 'loop-roundtrip.spec.ts');
    fs.writeFileSync(filePath, original, 'utf-8');

    const flow = parseTestFile(filePath);
    const output = generateTestFile(flow);

    // Should contain the loop structure
    expect(output).toContain('for (let i = 0; i < 3; i++) {');
    expect(output).toContain('.click()');
    expect(output).toContain('}');

    // Re-parse the generated output
    const generatedPath = path.join(tmpDir, 'loop-generated.spec.ts');
    fs.writeFileSync(generatedPath, output, 'utf-8');
    const reparsed = parseTestFile(generatedPath);

    expect(reparsed.tests).toHaveLength(1);
    expect(reparsed.tests[0].nodes).toHaveLength(1);
    expect(reparsed.tests[0].nodes[0].data.type).toBe('loop');
    if (reparsed.tests[0].nodes[0].data.type === 'loop') {
      expect(reparsed.tests[0].nodes[0].data.loopKind).toBe('for');
      expect(reparsed.tests[0].nodes[0].data.body).toHaveLength(1);
    }
  });

  it('generates a while loop from a loop node', () => {
    const loopNode = makeNode('n1', {
      type: 'loop',
      loopKind: 'while',
      condition: 'isRunning',
      body: [
        makeNode('c1', { type: 'click', locator: { kind: 'inline', strategy: 'getByText', value: 'Next' } }),
      ],
    } as ActionNode['data']);

    const flow = makeMinimalFlow({
      tests: [{ id: 'tc1', name: 'while loop test', nodes: [loopNode], edges: [] }],
    });

    const output = generateTestFile(flow);

    expect(output).toContain('while (isRunning) {');
    expect(output).toContain("await page.getByText('Next').click();");
    expect(output).toContain('}');
  });

  it('generates a do...while loop from a loop node', () => {
    const loopNode = makeNode('n1', {
      type: 'loop',
      loopKind: 'do...while',
      condition: 'hasMore',
      body: [
        makeNode('c1', { type: 'click', locator: { kind: 'inline', strategy: 'getByText', value: 'Load More' } }),
      ],
    } as ActionNode['data']);

    const flow = makeMinimalFlow({
      tests: [{ id: 'tc1', name: 'do while test', nodes: [loopNode], edges: [] }],
    });

    const output = generateTestFile(flow);

    expect(output).toContain('do {');
    expect(output).toContain("await page.getByText('Load More').click();");
    expect(output).toContain('} while (hasMore);');
  });

  it('round-trip: parse while loop then generate produces equivalent code', () => {
    setup();
    const original = `import { test, expect } from '@playwright/test';

test.describe('While Loop Tests', () => {
  test('while test', async ({ page }) => {
    while (condition) {
      await page.getByText('Item').click();
    }
  });
});
`;

    const filePath = path.join(tmpDir, 'while-roundtrip.spec.ts');
    fs.writeFileSync(filePath, original, 'utf-8');

    const flow = parseTestFile(filePath);
    const output = generateTestFile(flow);

    expect(output).toContain('while (condition) {');
    expect(output).toContain('.click()');
    expect(output).toContain('}');

    // Re-parse the generated output
    const generatedPath = path.join(tmpDir, 'while-generated.spec.ts');
    fs.writeFileSync(generatedPath, output, 'utf-8');
    const reparsed = parseTestFile(generatedPath);

    expect(reparsed.tests).toHaveLength(1);
    expect(reparsed.tests[0].nodes).toHaveLength(1);
    expect(reparsed.tests[0].nodes[0].data.type).toBe('loop');
    if (reparsed.tests[0].nodes[0].data.type === 'loop') {
      expect(reparsed.tests[0].nodes[0].data.loopKind).toBe('while');
      expect(reparsed.tests[0].nodes[0].data.body).toHaveLength(1);
    }
  });

  it('round-trip: parse do...while loop then generate produces equivalent code', () => {
    setup();
    const original = `import { test, expect } from '@playwright/test';

test.describe('Do While Tests', () => {
  test('do while test', async ({ page }) => {
    do {
      await page.getByText('Item').click();
    } while (hasMore);
  });
});
`;

    const filePath = path.join(tmpDir, 'dowhile-roundtrip.spec.ts');
    fs.writeFileSync(filePath, original, 'utf-8');

    const flow = parseTestFile(filePath);
    const output = generateTestFile(flow);

    expect(output).toContain('do {');
    expect(output).toContain('.click()');
    expect(output).toContain('} while (hasMore);');

    // Re-parse the generated output
    const generatedPath = path.join(tmpDir, 'dowhile-generated.spec.ts');
    fs.writeFileSync(generatedPath, output, 'utf-8');
    const reparsed = parseTestFile(generatedPath);

    expect(reparsed.tests).toHaveLength(1);
    expect(reparsed.tests[0].nodes).toHaveLength(1);
    expect(reparsed.tests[0].nodes[0].data.type).toBe('loop');
    if (reparsed.tests[0].nodes[0].data.type === 'loop') {
      expect(reparsed.tests[0].nodes[0].data.loopKind).toBe('do...while');
      expect(reparsed.tests[0].nodes[0].data.body).toHaveLength(1);
    }
  });

  it('generates a simple if conditional', () => {
    const condNode = makeNode('n1', {
      type: 'conditional',
      condition: 'isReady',
      thenChildren: [
        makeNode('c1', { type: 'click', locator: { kind: 'inline', strategy: 'getByText', value: 'Go' } }),
      ],
    } as ActionNode['data']);

    const flow = makeMinimalFlow({
      tests: [{ id: 'tc1', name: 'if test', nodes: [condNode], edges: [] }],
    });

    const output = generateTestFile(flow);

    expect(output).toContain('if (isReady) {');
    expect(output).toContain("await page.getByText('Go').click();");
    expect(output).toContain('}');
    expect(output).not.toContain('else');
  });

  it('generates if/else conditional', () => {
    const condNode = makeNode('n1', {
      type: 'conditional',
      condition: 'isLoggedIn',
      thenChildren: [
        makeNode('c1', { type: 'navigate', url: '/dashboard' }),
      ],
      elseChildren: [
        makeNode('c2', { type: 'navigate', url: '/login' }),
      ],
    } as ActionNode['data']);

    const flow = makeMinimalFlow({
      tests: [{ id: 'tc1', name: 'if else test', nodes: [condNode], edges: [] }],
    });

    const output = generateTestFile(flow);

    expect(output).toContain('if (isLoggedIn) {');
    expect(output).toContain("await page.goto('/dashboard');");
    expect(output).toContain('} else {');
    expect(output).toContain("await page.goto('/login');");
  });

  it('generates if/else-if/else chain', () => {
    const condNode = makeNode('n1', {
      type: 'conditional',
      condition: "role === 'admin'",
      thenChildren: [
        makeNode('c1', { type: 'navigate', url: '/admin' }),
      ],
      elseIfBranches: [
        {
          condition: "role === 'user'",
          children: [
            makeNode('c2', { type: 'navigate', url: '/user' }),
          ],
        },
      ],
      elseChildren: [
        makeNode('c3', { type: 'navigate', url: '/guest' }),
      ],
    } as ActionNode['data']);

    const flow = makeMinimalFlow({
      tests: [{ id: 'tc1', name: 'if else-if else test', nodes: [condNode], edges: [] }],
    });

    const output = generateTestFile(flow);

    expect(output).toContain("if (role === 'admin') {");
    expect(output).toContain("await page.goto('/admin');");
    expect(output).toContain("} else if (role === 'user') {");
    expect(output).toContain("await page.goto('/user');");
    expect(output).toContain('} else {');
    expect(output).toContain("await page.goto('/guest');");
  });

  it('generates negated assertVisible with .not prefix', () => {
    const assertNode = makeNode('n1', {
      type: 'assertVisible',
      locator: { kind: 'inline', strategy: 'locator', value: 'h1' },
      negated: true,
    });

    const flow = makeMinimalFlow({
      tests: [{ id: 'tc1', name: 'negated visible', nodes: [assertNode], edges: [] }],
    });

    const output = generateTestFile(flow);
    expect(output).toContain("await expect(page.locator('h1')).not.toBeVisible();");
  });

  it('generates negated assertText with .not prefix', () => {
    const assertNode = makeNode('n1', {
      type: 'assertText',
      locator: { kind: 'inline', strategy: 'getByText', value: 'heading' },
      expected: 'foo',
      exact: true,
      negated: true,
    });

    const flow = makeMinimalFlow({
      tests: [{ id: 'tc1', name: 'negated text', nodes: [assertNode], edges: [] }],
    });

    const output = generateTestFile(flow);
    expect(output).toContain("await expect(page.getByText('heading')).not.toHaveText('foo');");
  });

  it('generates non-negated assertions without .not prefix', () => {
    const assertNode = makeNode('n1', {
      type: 'assertVisible',
      locator: { kind: 'inline', strategy: 'locator', value: 'h1' },
    });

    const flow = makeMinimalFlow({
      tests: [{ id: 'tc1', name: 'non-negated', nodes: [assertNode], edges: [] }],
    });

    const output = generateTestFile(flow);
    expect(output).toContain("await expect(page.locator('h1')).toBeVisible();");
    expect(output).not.toContain('.not.');
  });

  it('round-trip: negated assertion survives parse -> generate -> parse cycle', () => {
    setup();
    const original = `import { test, expect } from '@playwright/test';

test.describe('Negated Tests', () => {
  test('negated assertions', async ({ page }) => {
    await expect(page.locator('h1')).not.toBeVisible();
    await expect(page.locator('.msg')).not.toHaveText('error');
  });
});
`;

    const filePath = path.join(tmpDir, 'negated-roundtrip.spec.ts');
    fs.writeFileSync(filePath, original, 'utf-8');

    // Parse
    const flow = parseTestFile(filePath);
    expect(flow.tests[0].nodes).toHaveLength(2);
    expect(flow.tests[0].nodes[0].data.type).toBe('assertVisible');
    if (flow.tests[0].nodes[0].data.type === 'assertVisible') {
      expect(flow.tests[0].nodes[0].data.negated).toBe(true);
    }
    expect(flow.tests[0].nodes[1].data.type).toBe('assertText');
    if (flow.tests[0].nodes[1].data.type === 'assertText') {
      expect(flow.tests[0].nodes[1].data.negated).toBe(true);
    }

    // Generate
    const output = generateTestFile(flow);
    expect(output).toContain('.not.toBeVisible()');
    expect(output).toContain('.not.toHaveText(');

    // Re-parse
    const generatedPath = path.join(tmpDir, 'negated-generated.spec.ts');
    fs.writeFileSync(generatedPath, output, 'utf-8');
    const reparsed = parseTestFile(generatedPath);

    expect(reparsed.tests[0].nodes).toHaveLength(2);
    const reparsedTypes = reparsed.tests[0].nodes.map((n) => n.data.type);
    expect(reparsedTypes).toEqual(['assertVisible', 'assertText']);

    if (reparsed.tests[0].nodes[0].data.type === 'assertVisible') {
      expect(reparsed.tests[0].nodes[0].data.negated).toBe(true);
    }
    if (reparsed.tests[0].nodes[1].data.type === 'assertText') {
      expect(reparsed.tests[0].nodes[1].data.negated).toBe(true);
    }
  });

  // ─── Extended Assertion Types (TICKET-008) ────────────────────────────

  it('generates assertCount with toHaveCount', () => {
    const assertNode = makeNode('n1', {
      type: 'assertCount',
      locator: { kind: 'inline', strategy: 'locator', value: '.item' },
      expected: 5,
    });

    const flow = makeMinimalFlow({
      tests: [{ id: 'tc1', name: 'count test', nodes: [assertNode], edges: [] }],
    });

    const output = generateTestFile(flow);
    expect(output).toContain("await expect(page.locator('.item')).toHaveCount(5);");
  });

  it('generates assertURL with toHaveURL', () => {
    const assertNode = makeNode('n1', {
      type: 'assertURL',
      expected: 'https://example.com/dashboard',
    });

    const flow = makeMinimalFlow({
      tests: [{ id: 'tc1', name: 'url test', nodes: [assertNode], edges: [] }],
    });

    const output = generateTestFile(flow);
    expect(output).toContain("await expect(page).toHaveURL('https://example.com/dashboard');");
  });

  it('generates assertTitle with toHaveTitle', () => {
    const assertNode = makeNode('n1', {
      type: 'assertTitle',
      expected: 'My App',
    });

    const flow = makeMinimalFlow({
      tests: [{ id: 'tc1', name: 'title test', nodes: [assertNode], edges: [] }],
    });

    const output = generateTestFile(flow);
    expect(output).toContain("await expect(page).toHaveTitle('My App');");
  });

  it('generates assertURL with regex pattern', () => {
    const assertNode = makeNode('n1', {
      type: 'assertURL',
      expected: '/\\/dashboard/',
      isRegex: true,
    });

    const flow = makeMinimalFlow({
      tests: [{ id: 'tc1', name: 'url regex test', nodes: [assertNode], edges: [] }],
    });

    const output = generateTestFile(flow);
    expect(output).toContain('await expect(page).toHaveURL(/\\/dashboard/);');
  });

  it('generates assertTitle with regex pattern', () => {
    const assertNode = makeNode('n1', {
      type: 'assertTitle',
      expected: '/My App.*/i',
      isRegex: true,
    });

    const flow = makeMinimalFlow({
      tests: [{ id: 'tc1', name: 'title regex test', nodes: [assertNode], edges: [] }],
    });

    const output = generateTestFile(flow);
    expect(output).toContain('await expect(page).toHaveTitle(/My App.*/i);');
  });

  it('generates assertScreenshot without name', () => {
    const assertNode = makeNode('n1', {
      type: 'assertScreenshot',
    });

    const flow = makeMinimalFlow({
      tests: [{ id: 'tc1', name: 'screenshot test', nodes: [assertNode], edges: [] }],
    });

    const output = generateTestFile(flow);
    expect(output).toContain('await expect(page).toHaveScreenshot();');
  });

  it('generates assertScreenshot with name', () => {
    const assertNode = makeNode('n1', {
      type: 'assertScreenshot',
      name: 'landing.png',
    });

    const flow = makeMinimalFlow({
      tests: [{ id: 'tc1', name: 'screenshot named test', nodes: [assertNode], edges: [] }],
    });

    const output = generateTestFile(flow);
    expect(output).toContain("await expect(page).toHaveScreenshot('landing.png');");
  });

  it('generates assertScreenshot with name and fullPage', () => {
    const assertNode = makeNode('n1', {
      type: 'assertScreenshot',
      name: 'full.png',
      fullPage: true,
    });

    const flow = makeMinimalFlow({
      tests: [{ id: 'tc1', name: 'screenshot full test', nodes: [assertNode], edges: [] }],
    });

    const output = generateTestFile(flow);
    expect(output).toContain("await expect(page).toHaveScreenshot('full.png', { fullPage: true });");
  });

  it('generates negated assertScreenshot', () => {
    const assertNode = makeNode('n1', {
      type: 'assertScreenshot',
      negated: true,
    });

    const flow = makeMinimalFlow({
      tests: [{ id: 'tc1', name: 'screenshot negated test', nodes: [assertNode], edges: [] }],
    });

    const output = generateTestFile(flow);
    expect(output).toContain('await expect(page).not.toHaveScreenshot();');
  });

  it('generates assertAttribute with toHaveAttribute', () => {
    const assertNode = makeNode('n1', {
      type: 'assertAttribute',
      locator: { kind: 'inline', strategy: 'locator', value: 'a' },
      attributeName: 'href',
      expected: '/about',
    });

    const flow = makeMinimalFlow({
      tests: [{ id: 'tc1', name: 'attr test', nodes: [assertNode], edges: [] }],
    });

    const output = generateTestFile(flow);
    expect(output).toContain("await expect(page.locator('a')).toHaveAttribute('href', '/about');");
  });

  it('generates assertValue with toHaveValue', () => {
    const assertNode = makeNode('n1', {
      type: 'assertValue',
      locator: { kind: 'inline', strategy: 'locator', value: 'input' },
      expected: 'hello',
    });

    const flow = makeMinimalFlow({
      tests: [{ id: 'tc1', name: 'value test', nodes: [assertNode], edges: [] }],
    });

    const output = generateTestFile(flow);
    expect(output).toContain("await expect(page.locator('input')).toHaveValue('hello');");
  });

  it('generates assertClass with toHaveClass', () => {
    const assertNode = makeNode('n1', {
      type: 'assertClass',
      locator: { kind: 'inline', strategy: 'locator', value: '.btn' },
      expected: 'primary active',
    });

    const flow = makeMinimalFlow({
      tests: [{ id: 'tc1', name: 'class test', nodes: [assertNode], edges: [] }],
    });

    const output = generateTestFile(flow);
    expect(output).toContain("await expect(page.locator('.btn')).toHaveClass('primary active');");
  });

  it('generates state assertions (toBeEnabled, toBeDisabled, toBeChecked, toBeHidden)', () => {
    const nodes = [
      makeNode('n1', {
        type: 'assertEnabled',
        locator: { kind: 'inline', strategy: 'getByRole', value: "'button', { name: 'Submit' }" },
      }),
      makeNode('n2', {
        type: 'assertDisabled',
        locator: { kind: 'inline', strategy: 'locator', value: '#submit' },
      }),
      makeNode('n3', {
        type: 'assertChecked',
        locator: { kind: 'inline', strategy: 'getByLabel', value: 'Agree' },
      }),
      makeNode('n4', {
        type: 'assertHidden',
        locator: { kind: 'inline', strategy: 'locator', value: '.modal' },
      }),
    ];

    const flow = makeMinimalFlow({
      tests: [{ id: 'tc1', name: 'state test', nodes, edges: [] }],
    });

    const output = generateTestFile(flow);
    expect(output).toContain("await expect(page.getByRole('button', { name: 'Submit' })).toBeEnabled();");
    expect(output).toContain("await expect(page.locator('#submit')).toBeDisabled();");
    expect(output).toContain("await expect(page.getByLabel('Agree')).toBeChecked();");
    expect(output).toContain("await expect(page.locator('.modal')).toBeHidden();");
  });

  it('generates negated new assertion types with .not prefix', () => {
    const nodes = [
      makeNode('n1', {
        type: 'assertCount',
        locator: { kind: 'inline', strategy: 'locator', value: '.item' },
        expected: 0,
        negated: true,
      }),
      makeNode('n2', {
        type: 'assertURL',
        expected: '/login',
        negated: true,
      }),
      makeNode('n3', {
        type: 'assertTitle',
        expected: 'Error',
        negated: true,
      }),
      makeNode('n4', {
        type: 'assertEnabled',
        locator: { kind: 'inline', strategy: 'locator', value: 'button' },
        negated: true,
      }),
    ];

    const flow = makeMinimalFlow({
      tests: [{ id: 'tc1', name: 'negated new', nodes, edges: [] }],
    });

    const output = generateTestFile(flow);
    expect(output).toContain("await expect(page.locator('.item')).not.toHaveCount(0);");
    expect(output).toContain("await expect(page).not.toHaveURL('/login');");
    expect(output).toContain("await expect(page).not.toHaveTitle('Error');");
    expect(output).toContain("await expect(page.locator('button')).not.toBeEnabled();");
  });

  it('round-trip: new assertion types survive parse -> generate -> parse', () => {
    setup();
    const original = `import { test, expect } from '@playwright/test';

test.describe('Assertion Coverage', () => {
  test('all assertions', async ({ page }) => {
    await expect(page.locator('.item')).toHaveCount(3);
    await expect(page).toHaveURL('https://example.com');
    await expect(page).toHaveTitle('Home');
    await expect(page).toHaveScreenshot();
    await expect(page.locator('a')).toHaveAttribute('href', '/about');
    await expect(page.locator('input')).toHaveValue('test');
    await expect(page.locator('.btn')).toHaveClass('primary');
    await expect(page.locator('button')).toBeEnabled();
    await expect(page.locator('button')).toBeDisabled();
    await expect(page.locator('input')).toBeChecked();
    await expect(page.locator('.modal')).toBeHidden();
  });
});
`;

    const filePath = path.join(tmpDir, 'assertions-roundtrip.spec.ts');
    fs.writeFileSync(filePath, original, 'utf-8');

    const flow = parseTestFile(filePath);
    const output = generateTestFile(flow);

    // Re-parse generated output
    const generatedPath = path.join(tmpDir, 'assertions-generated.spec.ts');
    fs.writeFileSync(generatedPath, output, 'utf-8');
    const reparsed = parseTestFile(generatedPath);

    const originalTypes = flow.tests[0].nodes.map((n) => n.data.type);
    const reparsedTypes = reparsed.tests[0].nodes.map((n) => n.data.type);
    expect(reparsedTypes).toEqual(originalTypes);
    expect(reparsedTypes).toEqual([
      'assertCount', 'assertURL', 'assertTitle', 'assertScreenshot', 'assertAttribute',
      'assertValue', 'assertClass', 'assertEnabled', 'assertDisabled',
      'assertChecked', 'assertHidden',
    ]);
  });

  it('round-trip: regex URL assertion survives parse -> generate -> parse', () => {
    setup();
    const original = `import { test, expect } from '@playwright/test';

test.describe('Regex Assertions', () => {
  test('regex url', async ({ page }) => {
    await expect(page).toHaveURL(/\\/dashboard/);
    await expect(page).toHaveTitle(/Home.*/i);
  });
});
`;

    const filePath = path.join(tmpDir, 'regex-roundtrip.spec.ts');
    fs.writeFileSync(filePath, original, 'utf-8');

    const flow = parseTestFile(filePath);
    const output = generateTestFile(flow);

    // Re-parse generated output
    const generatedPath = path.join(tmpDir, 'regex-generated.spec.ts');
    fs.writeFileSync(generatedPath, output, 'utf-8');
    const reparsed = parseTestFile(generatedPath);

    const originalTypes = flow.tests[0].nodes.map((n) => n.data.type);
    const reparsedTypes = reparsed.tests[0].nodes.map((n) => n.data.type);
    expect(reparsedTypes).toEqual(originalTypes);
    expect(reparsedTypes).toEqual(['assertURL', 'assertTitle']);

    // Verify regex flag is preserved
    const urlNode = reparsed.tests[0].nodes[0].data;
    if (urlNode.type === 'assertURL') {
      expect(urlNode.isRegex).toBe(true);
      expect(urlNode.expected).toBe('/\\/dashboard/');
    }
    const titleNode = reparsed.tests[0].nodes[1].data;
    if (titleNode.type === 'assertTitle') {
      expect(titleNode.isRegex).toBe(true);
      expect(titleNode.expected).toBe('/Home.*/i');
    }
  });

  it('round-trip: parse conditionals then generate produces equivalent code', () => {
    setup();
    const original = `import { test, expect } from '@playwright/test';

test.describe('Conditional Tests', () => {
  test('conditional test', async ({ page }) => {
    if (isLoggedIn) {
      await page.goto('/dashboard');
    } else {
      await page.goto('/login');
    }
  });
});
`;

    const filePath = path.join(tmpDir, 'cond-roundtrip.spec.ts');
    fs.writeFileSync(filePath, original, 'utf-8');

    const flow = parseTestFile(filePath);
    const output = generateTestFile(flow);

    // Should contain the conditional structure
    expect(output).toContain('if (isLoggedIn) {');
    expect(output).toContain("await page.goto('/dashboard');");
    expect(output).toContain('} else {');
    expect(output).toContain("await page.goto('/login');");

    // Re-parse the generated output
    const generatedPath = path.join(tmpDir, 'cond-generated.spec.ts');
    fs.writeFileSync(generatedPath, output, 'utf-8');
    const reparsed = parseTestFile(generatedPath);

    expect(reparsed.tests).toHaveLength(1);
    expect(reparsed.tests[0].nodes).toHaveLength(1);
    expect(reparsed.tests[0].nodes[0].data.type).toBe('conditional');
    if (reparsed.tests[0].nodes[0].data.type === 'conditional') {
      expect(reparsed.tests[0].nodes[0].data.condition).toBe('isLoggedIn');
      expect(reparsed.tests[0].nodes[0].data.thenChildren).toHaveLength(1);
      expect(reparsed.tests[0].nodes[0].data.elseChildren).toHaveLength(1);
    }
  });

  // ─── Locator Chaining (TICKET-012) ─────────────────────────────────

  it('generates a two-step chained locator', () => {
    const clickNode = makeNode('n1', {
      type: 'click',
      locator: {
        kind: 'inline',
        strategy: 'locator',
        value: '.parent',
        chain: [
          { strategy: 'locator', value: '.parent' },
          { strategy: 'locator', value: '.child' },
        ],
      },
    });

    const flow = makeMinimalFlow({
      tests: [{ id: 'tc1', name: 'chained locator', nodes: [clickNode], edges: [] }],
    });

    const output = generateTestFile(flow);
    expect(output).toContain("await page.locator('.parent').locator('.child').click();");
  });

  it('generates a chained locator with mixed strategies', () => {
    const clickNode = makeNode('n1', {
      type: 'click',
      locator: {
        kind: 'inline',
        strategy: 'locator',
        value: '.container',
        chain: [
          { strategy: 'locator', value: '.container' },
          { strategy: 'getByRole', value: "'button', { name: 'Submit' }" },
        ],
      },
    });

    const flow = makeMinimalFlow({
      tests: [{ id: 'tc1', name: 'mixed chain', nodes: [clickNode], edges: [] }],
    });

    const output = generateTestFile(flow);
    expect(output).toContain("await page.locator('.container').getByRole('button', { name: 'Submit' }).click();");
  });

  it('generates a three-step chained locator', () => {
    const clickNode = makeNode('n1', {
      type: 'click',
      locator: {
        kind: 'inline',
        strategy: 'locator',
        value: 'a',
        chain: [
          { strategy: 'locator', value: 'a' },
          { strategy: 'locator', value: 'b' },
          { strategy: 'locator', value: 'c' },
        ],
      },
    });

    const flow = makeMinimalFlow({
      tests: [{ id: 'tc1', name: 'three step chain', nodes: [clickNode], edges: [] }],
    });

    const output = generateTestFile(flow);
    expect(output).toContain("await page.locator('a').locator('b').locator('c').click();");
  });

  it('backward compat: generates single-step locator without chain field', () => {
    const clickNode = makeNode('n1', {
      type: 'click',
      locator: { kind: 'inline', strategy: 'locator', value: '.btn' },
    });

    const flow = makeMinimalFlow({
      tests: [{ id: 'tc1', name: 'no chain', nodes: [clickNode], edges: [] }],
    });

    const output = generateTestFile(flow);
    expect(output).toContain("await page.locator('.btn').click();");
  });

  it('round-trip: chained locator survives parse -> generate -> parse cycle', () => {
    setup();
    const original = `import { test, expect } from '@playwright/test';

test.describe('Chain Tests', () => {
  test('chained locator test', async ({ page }) => {
    await page.locator('.parent').locator('.child').click();
    await page.locator('.form').getByLabel('Email').fill('test@example.com');
  });
});
`;

    const filePath = path.join(tmpDir, 'chain-roundtrip.spec.ts');
    fs.writeFileSync(filePath, original, 'utf-8');

    const flow = parseTestFile(filePath);
    const output = generateTestFile(flow);

    // Verify the generated output contains the chained locators
    expect(output).toContain("page.locator('.parent').locator('.child').click()");
    expect(output).toContain("page.locator('.form').getByLabel('Email').fill('test@example.com')");

    // Re-parse the generated output
    const generatedPath = path.join(tmpDir, 'chain-generated.spec.ts');
    fs.writeFileSync(generatedPath, output, 'utf-8');
    const reparsed = parseTestFile(generatedPath);

    expect(reparsed.tests).toHaveLength(1);
    expect(reparsed.tests[0].nodes).toHaveLength(2);

    // First node: chained click
    const clickData = reparsed.tests[0].nodes[0].data;
    expect(clickData.type).toBe('click');
    if (clickData.type === 'click' && clickData.locator.kind === 'inline') {
      expect(clickData.locator.chain).toHaveLength(2);
      expect(clickData.locator.chain![0]).toEqual({ strategy: 'locator', value: '.parent' });
      expect(clickData.locator.chain![1]).toEqual({ strategy: 'locator', value: '.child' });
    }

    // Second node: chained fill
    const fillData = reparsed.tests[0].nodes[1].data;
    expect(fillData.type).toBe('fill');
    if (fillData.type === 'fill' && fillData.locator.kind === 'inline') {
      expect(fillData.locator.chain).toHaveLength(2);
      expect(fillData.locator.chain![0]).toEqual({ strategy: 'locator', value: '.form' });
      expect(fillData.locator.chain![1]).toEqual({ strategy: 'getByLabel', value: 'Email' });
    }
  });

  // ─── Frame Locators (TICKET-014) ─────────────────────────────────────

  it('generates page.frameLocator().locator() chain', () => {
    const clickNode = makeNode('n1', {
      type: 'click',
      locator: {
        kind: 'inline',
        strategy: 'frameLocator',
        value: '#iframe',
        chain: [
          { strategy: 'frameLocator', value: '#iframe' },
          { strategy: 'locator', value: '.btn' },
        ],
      },
    });

    const flow = makeMinimalFlow({
      tests: [{ id: 'tc1', name: 'frame locator', nodes: [clickNode], edges: [] }],
    });

    const output = generateTestFile(flow);
    expect(output).toContain("await page.frameLocator('#iframe').locator('.btn').click();");
  });

  it('generates nested frame locators', () => {
    const clickNode = makeNode('n1', {
      type: 'click',
      locator: {
        kind: 'inline',
        strategy: 'frameLocator',
        value: '#outer',
        chain: [
          { strategy: 'frameLocator', value: '#outer' },
          { strategy: 'frameLocator', value: '#inner' },
          { strategy: 'locator', value: '.btn' },
        ],
      },
    });

    const flow = makeMinimalFlow({
      tests: [{ id: 'tc1', name: 'nested frame locator', nodes: [clickNode], edges: [] }],
    });

    const output = generateTestFile(flow);
    expect(output).toContain("await page.frameLocator('#outer').frameLocator('#inner').locator('.btn').click();");
  });

  it('generates frame locator with getByRole inner locator', () => {
    const clickNode = makeNode('n1', {
      type: 'click',
      locator: {
        kind: 'inline',
        strategy: 'frameLocator',
        value: '#iframe',
        chain: [
          { strategy: 'frameLocator', value: '#iframe' },
          { strategy: 'getByRole', value: "'button', { name: 'Submit' }" },
        ],
      },
    });

    const flow = makeMinimalFlow({
      tests: [{ id: 'tc1', name: 'frame getByRole', nodes: [clickNode], edges: [] }],
    });

    const output = generateTestFile(flow);
    expect(output).toContain("await page.frameLocator('#iframe').getByRole('button', { name: 'Submit' }).click();");
  });

  it('round-trip: frame locator survives parse -> generate -> parse cycle', () => {
    setup();
    const original = `import { test, expect } from '@playwright/test';

test.describe('Frame Tests', () => {
  test('frame locator test', async ({ page }) => {
    await page.frameLocator('#iframe').locator('.btn').click();
    await page.frameLocator('#outer').frameLocator('#inner').locator('.msg').fill('hello');
  });
});
`;

    const filePath = path.join(tmpDir, 'frame-roundtrip.spec.ts');
    fs.writeFileSync(filePath, original, 'utf-8');

    const flow = parseTestFile(filePath);
    const output = generateTestFile(flow);

    // Verify the generated output contains the frame locators
    expect(output).toContain("page.frameLocator('#iframe').locator('.btn').click()");
    expect(output).toContain("page.frameLocator('#outer').frameLocator('#inner').locator('.msg').fill('hello')");

    // Re-parse the generated output
    const generatedPath = path.join(tmpDir, 'frame-generated.spec.ts');
    fs.writeFileSync(generatedPath, output, 'utf-8');
    const reparsed = parseTestFile(generatedPath);

    expect(reparsed.tests).toHaveLength(1);
    expect(reparsed.tests[0].nodes).toHaveLength(2);

    // First node: frame locator click — frameLocators separated to node level
    const clickNode = reparsed.tests[0].nodes[0];
    expect(clickNode.data.type).toBe('click');
    expect(clickNode.frameLocators).toEqual(['#iframe']);
    if (clickNode.data.type === 'click' && clickNode.data.locator.kind === 'inline') {
      expect(clickNode.data.locator.strategy).toBe('locator');
      expect(clickNode.data.locator.value).toBe('.btn');
    }

    // Second node: nested frame locator fill
    const fillNode = reparsed.tests[0].nodes[1];
    expect(fillNode.data.type).toBe('fill');
    expect(fillNode.frameLocators).toEqual(['#outer', '#inner']);
    if (fillNode.data.type === 'fill' && fillNode.data.locator.kind === 'inline') {
      expect(fillNode.data.locator.strategy).toBe('locator');
      expect(fillNode.data.locator.value).toBe('.msg');
    }
  });

  // TICKET-018: beforeAll / afterAll generation
  it('generates test.beforeAll hook', () => {
    const flow: TestFlow = {
      id: 'test-beforeall',
      filePath: 'beforeall.spec.ts',
      describe: 'Suite',
      tests: [{
        id: 'tc1',
        name: 'example',
        nodes: [makeNode('n1', { type: 'click', locator: { kind: 'inline', strategy: 'locator', value: 'button' } })],
        edges: [],
      }],
      beforeAll: [makeNode('ba1', { type: 'navigate', url: '/setup' })],
      imports: [{ moduleSpecifier: '@playwright/test', namedImports: ['test', 'expect'], defaultImport: undefined }],
      fixtures: ['page'],
      metadata: { contentHash: '', lastParsedAt: 0, parseWarnings: [] },
    };

    const output = generateTestFile(flow);
    expect(output).toContain('test.beforeAll(async () => {');
    expect(output).toContain("await page.goto('/setup');");
  });

  it('generates test.afterAll hook', () => {
    const flow: TestFlow = {
      id: 'test-afterall',
      filePath: 'afterall.spec.ts',
      describe: 'Suite',
      tests: [{
        id: 'tc1',
        name: 'example',
        nodes: [makeNode('n1', { type: 'click', locator: { kind: 'inline', strategy: 'locator', value: 'button' } })],
        edges: [],
      }],
      afterAll: [makeNode('aa1', { type: 'navigate', url: '/teardown' })],
      imports: [{ moduleSpecifier: '@playwright/test', namedImports: ['test', 'expect'], defaultImport: undefined }],
      fixtures: ['page'],
      metadata: { contentHash: '', lastParsedAt: 0, parseWarnings: [] },
    };

    const output = generateTestFile(flow);
    expect(output).toContain('test.afterAll(async () => {');
    expect(output).toContain("await page.goto('/teardown');");
  });

  it('generates hooks in canonical order: beforeAll, beforeEach, tests, afterEach, afterAll', () => {
    const flow: TestFlow = {
      id: 'test-order',
      filePath: 'hook-order.spec.ts',
      describe: 'Suite',
      tests: [{
        id: 'tc1',
        name: 'example',
        nodes: [makeNode('n1', { type: 'click', locator: { kind: 'inline', strategy: 'locator', value: 'button' } })],
        edges: [],
      }],
      beforeAll: [makeNode('ba1', { type: 'navigate', url: '/before-all' })],
      beforeEach: [makeNode('be1', { type: 'navigate', url: '/before-each' })],
      afterEach: [makeNode('ae1', { type: 'navigate', url: '/after-each' })],
      afterAll: [makeNode('aa1', { type: 'navigate', url: '/after-all' })],
      imports: [{ moduleSpecifier: '@playwright/test', namedImports: ['test', 'expect'], defaultImport: undefined }],
      fixtures: ['page'],
      metadata: { contentHash: '', lastParsedAt: 0, parseWarnings: [] },
    };

    const output = generateTestFile(flow);
    const baIdx = output.indexOf('test.beforeAll');
    const beIdx = output.indexOf('test.beforeEach');
    const testIdx = output.indexOf("test('example'");
    const aeIdx = output.indexOf('test.afterEach');
    const aaIdx = output.indexOf('test.afterAll');

    expect(baIdx).toBeLessThan(beIdx);
    expect(beIdx).toBeLessThan(testIdx);
    expect(testIdx).toBeLessThan(aeIdx);
    expect(aeIdx).toBeLessThan(aaIdx);
  });

  it('round-trip: beforeAll/afterAll survive parse -> generate -> parse', () => {
    setup();
    const filePath = path.join(tmpDir, 'roundtrip-hooks.spec.ts');
    fs.writeFileSync(filePath, `import { test, expect } from '@playwright/test';
test.describe('Suite', () => {
  test.beforeAll(async () => {
    await page.goto('/setup');
  });
  test.afterAll(async () => {
    await page.goto('/teardown');
  });
  test('example', async ({ page }) => {
    await page.goto('/home');
  });
});
`);

    const flow1 = parseTestFile(filePath);
    const generated = generateTestFile(flow1);

    const filePath2 = path.join(tmpDir, 'roundtrip-hooks-2.spec.ts');
    fs.writeFileSync(filePath2, generated);
    const flow2 = parseTestFile(filePath2);

    expect(flow2.beforeAll).toBeDefined();
    expect(flow2.beforeAll).toHaveLength(1);
    expect(flow2.afterAll).toBeDefined();
    expect(flow2.afterAll).toHaveLength(1);
  });

  // TICKET-013: Locator modifier generation
  it('generates .filter({ hasText }) modifier', () => {
    const flow: TestFlow = {
      id: 'test-filter',
      filePath: 'filter.spec.ts',
      describe: 'Suite',
      tests: [{
        id: 'tc1',
        name: 'filter test',
        nodes: [makeNode('n1', {
          type: 'click',
          locator: {
            kind: 'inline',
            strategy: 'locator',
            value: 'tr',
            modifiers: [{ kind: 'filter', hasText: 'John' }],
          },
        })],
        edges: [],
      }],
      imports: [{ moduleSpecifier: '@playwright/test', namedImports: ['test', 'expect'], defaultImport: undefined }],
      fixtures: ['page'],
      metadata: { contentHash: '', lastParsedAt: 0, parseWarnings: [] },
    };

    const output = generateTestFile(flow);
    expect(output).toContain(".filter({ hasText: 'John' })");
  });

  it('generates .nth(), .first(), .last() modifiers', () => {
    const flow: TestFlow = {
      id: 'test-nth',
      filePath: 'nth.spec.ts',
      describe: 'Suite',
      tests: [{
        id: 'tc1',
        name: 'nth test',
        nodes: [
          makeNode('n1', {
            type: 'click',
            locator: { kind: 'inline', strategy: 'locator', value: 'li', modifiers: [{ kind: 'nth', index: 2 }] },
          }, 0),
          makeNode('n2', {
            type: 'click',
            locator: { kind: 'inline', strategy: 'locator', value: 'li', modifiers: [{ kind: 'first' }] },
          }, 100),
          makeNode('n3', {
            type: 'click',
            locator: { kind: 'inline', strategy: 'locator', value: 'li', modifiers: [{ kind: 'last' }] },
          }, 200),
        ],
        edges: [
          { id: 'e1', source: 'n1', target: 'n2' },
          { id: 'e2', source: 'n2', target: 'n3' },
        ],
      }],
      imports: [{ moduleSpecifier: '@playwright/test', namedImports: ['test', 'expect'], defaultImport: undefined }],
      fixtures: ['page'],
      metadata: { contentHash: '', lastParsedAt: 0, parseWarnings: [] },
    };

    const output = generateTestFile(flow);
    expect(output).toContain('.nth(2)');
    expect(output).toContain('.first()');
    expect(output).toContain('.last()');
  });

  it('round-trip: locator with filter survives parse -> generate -> parse', () => {
    setup();
    const filePath = path.join(tmpDir, 'roundtrip-filter.spec.ts');
    fs.writeFileSync(filePath, `import { test, expect } from '@playwright/test';
test.describe('Suite', () => {
  test('filter roundtrip', async ({ page }) => {
    await page.locator('tr').filter({ hasText: 'John' }).click();
    await page.locator('li').nth(2).click();
    await page.locator('li').first().click();
  });
});
`);

    const flow1 = parseTestFile(filePath);
    const generated = generateTestFile(flow1);

    const filePath2 = path.join(tmpDir, 'roundtrip-filter-2.spec.ts');
    fs.writeFileSync(filePath2, generated);
    const flow2 = parseTestFile(filePath2);

    const n0 = flow2.tests[0].nodes[0];
    expect(n0.data.type).toBe('click');
    if (n0.data.type === 'click' && n0.data.locator.kind === 'inline') {
      expect(n0.data.locator.modifiers).toHaveLength(1);
      expect(n0.data.locator.modifiers![0].kind).toBe('filter');
    }

    const n1 = flow2.tests[0].nodes[1];
    if (n1.data.type === 'click' && n1.data.locator.kind === 'inline') {
      expect(n1.data.locator.modifiers).toHaveLength(1);
      expect(n1.data.locator.modifiers![0].kind).toBe('nth');
    }

    const n2 = flow2.tests[0].nodes[2];
    if (n2.data.type === 'click' && n2.data.locator.kind === 'inline') {
      expect(n2.data.locator.modifiers).toHaveLength(1);
      expect(n2.data.locator.modifiers![0].kind).toBe('first');
    }
  });

  // TICKET-017: Nested describe generation
  it('generates nested test.describe blocks', () => {
    const flow: TestFlow = {
      id: 'test-nested',
      filePath: 'nested.spec.ts',
      describe: 'Outer',
      tests: [{
        id: 'tc1',
        name: 'outer test',
        nodes: [makeNode('n1', { type: 'navigate', url: '/outer' })],
        edges: [],
      }],
      children: [{
        name: 'Inner',
        tests: [{
          id: 'tc2',
          name: 'inner test',
          nodes: [makeNode('n2', { type: 'navigate', url: '/inner' })],
          edges: [],
        }],
      }],
      imports: [{ moduleSpecifier: '@playwright/test', namedImports: ['test', 'expect'], defaultImport: undefined }],
      fixtures: ['page'],
      metadata: { contentHash: '', lastParsedAt: 0, parseWarnings: [] },
    };

    const output = generateTestFile(flow);
    expect(output).toContain("test.describe('Outer'");
    expect(output).toContain("test.describe('Inner'");
    expect(output).toContain("await page.goto('/outer')");
    expect(output).toContain("await page.goto('/inner')");
  });

  it('generates 3 levels of nested describes with proper indentation', () => {
    const flow: TestFlow = {
      id: 'test-deep',
      filePath: 'deep.spec.ts',
      describe: 'L1',
      tests: [],
      children: [{
        name: 'L2',
        tests: [],
        children: [{
          name: 'L3',
          tests: [{
            id: 'tc1',
            name: 'deep test',
            nodes: [makeNode('n1', { type: 'navigate', url: '/deep' })],
            edges: [],
          }],
        }],
      }],
      imports: [{ moduleSpecifier: '@playwright/test', namedImports: ['test', 'expect'], defaultImport: undefined }],
      fixtures: ['page'],
      metadata: { contentHash: '', lastParsedAt: 0, parseWarnings: [] },
    };

    const output = generateTestFile(flow);
    expect(output).toContain("test.describe('L1'");
    expect(output).toContain("test.describe('L2'");
    expect(output).toContain("test.describe('L3'");
    // Verify nesting by checking indentation
    const l3Line = output.split('\n').find(l => l.includes("test.describe('L3'"));
    expect(l3Line).toBeDefined();
    // L3 should be indented more than L2
    const l2Line = output.split('\n').find(l => l.includes("test.describe('L2'"));
    expect(l2Line).toBeDefined();
    expect(l3Line!.search(/\S/)).toBeGreaterThan(l2Line!.search(/\S/));
  });

  it('round-trip: nested describes survive parse -> generate -> parse', () => {
    setup();
    const filePath = path.join(tmpDir, 'roundtrip-nested.spec.ts');
    fs.writeFileSync(filePath, `import { test, expect } from '@playwright/test';
test.describe('Outer', () => {
  test('outer test', async ({ page }) => {
    await page.goto('/outer');
  });
  test.describe('Inner', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/inner-setup');
    });
    test('inner test', async ({ page }) => {
      await page.goto('/inner');
    });
  });
});
`);

    const flow1 = parseTestFile(filePath);
    const generated = generateTestFile(flow1);

    const filePath2 = path.join(tmpDir, 'roundtrip-nested-2.spec.ts');
    fs.writeFileSync(filePath2, generated);
    const flow2 = parseTestFile(filePath2);

    expect(flow2.describe).toBe('Outer');
    expect(flow2.tests).toHaveLength(1);
    expect(flow2.children).toBeDefined();
    expect(flow2.children).toHaveLength(1);
    expect(flow2.children![0].name).toBe('Inner');
    expect(flow2.children![0].tests).toHaveLength(1);
    expect(flow2.children![0].beforeEach).toBeDefined();
  });

  // ─── Network Route Generation ──────────────────────────────────────

  it('generates page.route with fulfill handler', () => {
    const routeNode = makeNode('n1', {
      type: 'networkRoute',
      urlPattern: '**/api/users',
      handlerAction: 'fulfill',
      fulfillOptions: { status: 200, json: '[{ id: 1, name: "Alice" }]' },
    } as any);

    const flow = makeMinimalFlow({
      tests: [{
        id: 'tc1',
        name: 'mock test',
        nodes: [routeNode],
        edges: [],
      }],
    });

    const output = generateTestFile(flow);
    expect(output).toContain("await page.route('**/api/users', async route => {");
    expect(output).toContain('await route.fulfill({ status: 200, json: [{ id: 1, name: "Alice" }] });');
    expect(output).toContain('});');
  });

  it('generates page.route with abort handler', () => {
    const routeNode = makeNode('n1', {
      type: 'networkRoute',
      urlPattern: '**/api/data',
      handlerAction: 'abort',
      abortReason: 'blockedbyclient',
    } as any);

    const flow = makeMinimalFlow({
      tests: [{
        id: 'tc1',
        name: 'abort test',
        nodes: [routeNode],
        edges: [],
      }],
    });

    const output = generateTestFile(flow);
    expect(output).toContain("await page.route('**/api/data', async route => {");
    expect(output).toContain("await route.abort('blockedbyclient');");
  });

  it('generates page.route with continue handler and overrides', () => {
    const routeNode = makeNode('n1', {
      type: 'networkRoute',
      urlPattern: '**/api/data',
      handlerAction: 'continue',
      continueOverrides: { headers: { 'X-Custom': 'value' } },
    } as any);

    const flow = makeMinimalFlow({
      tests: [{
        id: 'tc1',
        name: 'continue test',
        nodes: [routeNode],
        edges: [],
      }],
    });

    const output = generateTestFile(flow);
    expect(output).toContain("await page.route('**/api/data', async route => {");
    expect(output).toContain("await route.continue({ headers: { 'X-Custom': 'value' } });");
  });

  it('generates page.route with regex pattern', () => {
    const routeNode = makeNode('n1', {
      type: 'networkRoute',
      urlPattern: '/\\/api\\/users/',
      handlerAction: 'abort',
    } as any);

    const flow = makeMinimalFlow({
      tests: [{
        id: 'tc1',
        name: 'regex route test',
        nodes: [routeNode],
        edges: [],
      }],
    });

    const output = generateTestFile(flow);
    expect(output).toContain('await page.route(/\\/api\\/users/, async route => {');
  });

  it('round-trips page.route through parse and generate', () => {
    setup();
    const content = `
import { test, expect } from '@playwright/test';

test.describe('Route roundtrip', () => {
  test('route test', async ({ page }) => {
    await page.route('**/api/users', route => route.fulfill({ status: 200, json: [{ id: 1 }] }));
    await page.route('**/api/blocked', route => route.abort());
    await page.route('**/api/proxy', route => route.continue());
  });
});
`;
    const filePath = path.join(tmpDir, 'roundtrip-route.spec.ts');
    fs.writeFileSync(filePath, content);

    const flow1 = parseTestFile(filePath);
    const generated = generateTestFile(flow1);

    // Re-parse the generated output
    const filePath2 = path.join(tmpDir, 'roundtrip-route-2.spec.ts');
    fs.writeFileSync(filePath2, generated);
    const flow2 = parseTestFile(filePath2);

    const tc = flow2.tests[0];
    expect(tc.nodes).toHaveLength(3);

    const types = tc.nodes.map(n => n.data.type);
    expect(types).toEqual(['networkRoute', 'networkRoute', 'networkRoute']);

    // Verify round-trip data
    const fulfillNode = tc.nodes[0].data;
    if (fulfillNode.type === 'networkRoute') {
      expect(fulfillNode.urlPattern).toBe('**/api/users');
      expect(fulfillNode.handlerAction).toBe('fulfill');
      expect(fulfillNode.fulfillOptions!.status).toBe(200);
    }

    const abortNode = tc.nodes[1].data;
    if (abortNode.type === 'networkRoute') {
      expect(abortNode.urlPattern).toBe('**/api/blocked');
      expect(abortNode.handlerAction).toBe('abort');
    }

    const continueNode = tc.nodes[2].data;
    if (continueNode.type === 'networkRoute') {
      expect(continueNode.urlPattern).toBe('**/api/proxy');
      expect(continueNode.handlerAction).toBe('continue');
    }
  });

  // ─── API Request Generation ───────────────────────────────────────────

  it('generates a simple GET request with result variable', () => {
    const flow = makeMinimalFlow({
      fixtures: ['request'],
      tests: [
        {
          id: 'test_1',
          name: 'api get',
          nodes: [
            makeNode('n1', {
              type: 'apiRequest',
              method: 'GET',
              url: '/api/users',
              resultVariable: 'response',
            }),
          ],
          edges: [],
        },
      ],
    });

    const output = generateTestFile(flow);
    expect(output).toContain("const response = await request.get('/api/users');");
  });

  it('generates a POST request with data body', () => {
    const flow = makeMinimalFlow({
      fixtures: ['request'],
      tests: [
        {
          id: 'test_1',
          name: 'api post',
          nodes: [
            makeNode('n1', {
              type: 'apiRequest',
              method: 'POST',
              url: '/api/users',
              body: "{ name: 'John' }",
            }),
          ],
          edges: [],
        },
      ],
    });

    const output = generateTestFile(flow);
    expect(output).toContain("await request.post('/api/users', { data: { name: 'John' } });");
  });

  it('generates a PUT request with headers and body', () => {
    const flow = makeMinimalFlow({
      fixtures: ['request'],
      tests: [
        {
          id: 'test_1',
          name: 'api put',
          nodes: [
            makeNode('n1', {
              type: 'apiRequest',
              method: 'PUT',
              url: '/api/users/1',
              headers: { 'X-Token': 'abc' },
              body: "{ name: 'Jane' }",
            }),
          ],
          edges: [],
        },
      ],
    });

    const output = generateTestFile(flow);
    expect(output).toContain("await request.put('/api/users/1', { headers: { 'X-Token': 'abc' }, data: { name: 'Jane' } });");
  });

  it('generates a DELETE request', () => {
    const flow = makeMinimalFlow({
      fixtures: ['request'],
      tests: [
        {
          id: 'test_1',
          name: 'api delete',
          nodes: [
            makeNode('n1', {
              type: 'apiRequest',
              method: 'DELETE',
              url: '/api/users/1',
            }),
          ],
          edges: [],
        },
      ],
    });

    const output = generateTestFile(flow);
    expect(output).toContain("await request.delete('/api/users/1');");
  });

  it('generates a PATCH request with data', () => {
    const flow = makeMinimalFlow({
      fixtures: ['request'],
      tests: [
        {
          id: 'test_1',
          name: 'api patch',
          nodes: [
            makeNode('n1', {
              type: 'apiRequest',
              method: 'PATCH',
              url: '/api/users/1',
              body: "{ status: 'active' }",
            }),
          ],
          edges: [],
        },
      ],
    });

    const output = generateTestFile(flow);
    expect(output).toContain("await request.patch('/api/users/1', { data: { status: 'active' } });");
  });

  it('round-trips API request calls through parse and generate', () => {
    setup();
    const filePath = writeTestFile(
      'api-roundtrip.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('API Tests', () => {
  test('all methods', async ({ request }) => {
    const getRes = await request.get('/api/users');
    await request.post('/api/users', { data: { name: 'John' } });
    await request.put('/api/users/1', { data: { name: 'Jane' } });
    await request.delete('/api/users/1');
    await request.patch('/api/users/1', { data: { status: 'active' } });
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(5);
    expect(tc.nodes.map((n) => n.data.type)).toEqual([
      'apiRequest',
      'apiRequest',
      'apiRequest',
      'apiRequest',
      'apiRequest',
    ]);

    const output = generateTestFile(flow);
    expect(output).toContain("const getRes = await request.get('/api/users');");
    expect(output).toContain("await request.post('/api/users', { data: { name: 'John' } });");
    expect(output).toContain("await request.put('/api/users/1', { data: { name: 'Jane' } });");
    expect(output).toContain("await request.delete('/api/users/1');");
    expect(output).toContain("await request.patch('/api/users/1', { data: { status: 'active' } });");
  });

  // ─── File Upload Generation Tests ─────────────────────────────────

  it('generates page.setInputFiles with single file', () => {
    const flow = makeMinimalFlow({
      tests: [
        {
          id: 'test_1',
          name: 'upload test',
          nodes: [
            makeNode('n1', {
              type: 'fileUpload',
              selector: '#upload',
              files: ['path/to/file.pdf'],
            }),
          ],
          edges: [],
        },
      ],
    });

    const output = generateTestFile(flow);
    expect(output).toContain("await page.setInputFiles('#upload', 'path/to/file.pdf');");
  });

  it('generates page.setInputFiles with multiple files', () => {
    const flow = makeMinimalFlow({
      tests: [
        {
          id: 'test_1',
          name: 'upload test',
          nodes: [
            makeNode('n1', {
              type: 'fileUpload',
              selector: '#upload',
              files: ['file1.pdf', 'file2.pdf'],
            }),
          ],
          edges: [],
        },
      ],
    });

    const output = generateTestFile(flow);
    expect(output).toContain("await page.setInputFiles('#upload', ['file1.pdf', 'file2.pdf']);");
  });

  it('generates page.setInputFiles with empty array (clear)', () => {
    const flow = makeMinimalFlow({
      tests: [
        {
          id: 'test_1',
          name: 'clear test',
          nodes: [
            makeNode('n1', {
              type: 'fileUpload',
              selector: '#upload',
              files: [],
            }),
          ],
          edges: [],
        },
      ],
    });

    const output = generateTestFile(flow);
    expect(output).toContain("await page.setInputFiles('#upload', []);");
  });

  it('generates locator-based setInputFiles with single file', () => {
    const flow = makeMinimalFlow({
      tests: [
        {
          id: 'test_1',
          name: 'upload test',
          nodes: [
            makeNode('n1', {
              type: 'fileUpload',
              selector: '#upload',
              files: ['file.pdf'],
              locatorMethod: 'locator',
            }),
          ],
          edges: [],
        },
      ],
    });

    const output = generateTestFile(flow);
    expect(output).toContain("await page.locator('#upload').setInputFiles('file.pdf');");
  });

  it('generates locator-based setInputFiles with multiple files', () => {
    const flow = makeMinimalFlow({
      tests: [
        {
          id: 'test_1',
          name: 'upload test',
          nodes: [
            makeNode('n1', {
              type: 'fileUpload',
              selector: 'input[type="file"]',
              files: ['doc1.pdf', 'doc2.pdf'],
              locatorMethod: 'locator',
            }),
          ],
          edges: [],
        },
      ],
    });

    const output = generateTestFile(flow);
    expect(output).toContain("await page.locator('input[type=\"file\"]').setInputFiles(['doc1.pdf', 'doc2.pdf']);");
  });

  it('generates getByLabel-based setInputFiles', () => {
    const flow = makeMinimalFlow({
      tests: [
        {
          id: 'test_1',
          name: 'upload test',
          nodes: [
            makeNode('n1', {
              type: 'fileUpload',
              selector: 'Upload file',
              files: ['report.pdf'],
              locatorMethod: 'getByLabel',
            }),
          ],
          edges: [],
        },
      ],
    });

    const output = generateTestFile(flow);
    expect(output).toContain("await page.getByLabel('Upload file').setInputFiles('report.pdf');");
  });

  it('round-trips page.setInputFiles with single file', () => {
    setup();
    const filePath = writeTestFile(
      'upload-rt-single.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Upload Tests', () => {
  test('single upload', async ({ page }) => {
    await page.setInputFiles('#upload', 'path/to/file.pdf');
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const output = generateTestFile(flow);
    expect(output).toContain("await page.setInputFiles('#upload', 'path/to/file.pdf');");
  });

  it('round-trips page.setInputFiles with multiple files', () => {
    setup();
    const filePath = writeTestFile(
      'upload-rt-multi.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Upload Tests', () => {
  test('multi upload', async ({ page }) => {
    await page.setInputFiles('#upload', ['file1.pdf', 'file2.pdf']);
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const output = generateTestFile(flow);
    expect(output).toContain("await page.setInputFiles('#upload', ['file1.pdf', 'file2.pdf']);");
  });

  it('round-trips page.setInputFiles with empty array', () => {
    setup();
    const filePath = writeTestFile(
      'upload-rt-clear.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Upload Tests', () => {
  test('clear upload', async ({ page }) => {
    await page.setInputFiles('#upload', []);
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const output = generateTestFile(flow);
    expect(output).toContain("await page.setInputFiles('#upload', []);");
  });

  it('round-trips locator-based setInputFiles', () => {
    setup();
    const filePath = writeTestFile(
      'upload-rt-locator.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Upload Tests', () => {
  test('locator upload', async ({ page }) => {
    await page.locator('#upload').setInputFiles('file.pdf');
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const output = generateTestFile(flow);
    expect(output).toContain("await page.locator('#upload').setInputFiles('file.pdf');");
  });

  // ─── Dialog Handler Generation Tests ─────────────────────────────────

  it('generates page.on dialog accept', () => {
    const flow = makeMinimalFlow({
      tests: [
        {
          id: 'test_1',
          name: 'dialog accept',
          nodes: [
            makeNode('n1', { type: 'dialogHandler', action: 'accept', once: false }),
          ],
          edges: [],
        },
      ],
    });

    const output = generateTestFile(flow);
    expect(output).toContain("page.on('dialog', dialog => dialog.accept());");
  });

  it('generates page.once dialog dismiss', () => {
    const flow = makeMinimalFlow({
      tests: [
        {
          id: 'test_1',
          name: 'dialog dismiss once',
          nodes: [
            makeNode('n1', { type: 'dialogHandler', action: 'dismiss', once: true }),
          ],
          edges: [],
        },
      ],
    });

    const output = generateTestFile(flow);
    expect(output).toContain("page.once('dialog', dialog => dialog.dismiss());");
  });

  it('generates dialog accept with input text', () => {
    const flow = makeMinimalFlow({
      tests: [
        {
          id: 'test_1',
          name: 'dialog accept text',
          nodes: [
            makeNode('n1', { type: 'dialogHandler', action: 'accept', once: false, inputText: 'my input' }),
          ],
          edges: [],
        },
      ],
    });

    const output = generateTestFile(flow);
    expect(output).toContain("page.on('dialog', dialog => dialog.accept('my input'));");
  });

  it('round-trips dialog handler code', () => {
    setup();
    const filePath = writeTestFile(
      'dialog-roundtrip.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Dialog tests', () => {
  test('dialog roundtrip', async ({ page }) => {
    page.on('dialog', dialog => dialog.accept('hello'));
    page.once('dialog', dialog => dialog.dismiss());
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const output = generateTestFile(flow);
    expect(output).toContain("page.on('dialog', dialog => dialog.accept('hello'));");
    expect(output).toContain("page.once('dialog', dialog => dialog.dismiss());");
  });

  // ─── New Tab / Multi-Page Tests ───────────────────────────────────

  it('generates newTab with Promise.all pattern', () => {
    const flow = makeMinimalFlow({
      fixtures: ['page', 'context'],
      tests: [
        {
          id: 'test_newtab',
          name: 'opens new tab',
          nodes: [
            makeNode('n1', {
              type: 'newTab',
              pageVariable: 'newPage',
              triggerAction: "page.click('a[target=_blank]')",
              triggerSelector: 'a[target=_blank]',
            }),
          ],
          edges: [],
        },
      ],
    });

    const output = generateTestFile(flow);
    expect(output).toContain('const [newPage] = await Promise.all([');
    expect(output).toContain("context.waitForEvent('page')");
    expect(output).toContain("page.click('a[target=_blank]')");
  });

  it('generates newTab with custom context variable', () => {
    const flow = makeMinimalFlow({
      fixtures: ['page'],
      tests: [
        {
          id: 'test_newtab_ctx',
          name: 'opens new tab with custom ctx',
          nodes: [
            makeNode('n1', {
              type: 'newTab',
              pageVariable: 'newPage',
              triggerAction: "page.click('#link')",
              contextVariable: 'browserContext',
            }),
          ],
          edges: [],
        },
      ],
    });

    const output = generateTestFile(flow);
    expect(output).toContain('const [newPage] = await Promise.all([');
    expect(output).toContain("browserContext.waitForEvent('page')");
    expect(output).toContain("page.click('#link')");
  });

  it('generates newTab with popup pattern', () => {
    const flow = makeMinimalFlow({
      fixtures: ['page'],
      tests: [
        {
          id: 'test_popup',
          name: 'opens popup',
          nodes: [
            makeNode('n1', {
              type: 'newTab',
              pageVariable: 'popup',
              triggerAction: "page.waitForEvent('popup')",
            }),
          ],
          edges: [],
        },
      ],
    });

    const output = generateTestFile(flow);
    expect(output).toContain("const popup = await page.waitForEvent('popup');");
  });

  it('round-trips a multi-tab test through parse and generate', () => {
    setup();
    const filePath = writeTestFile(
      'roundtrip-newtab.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Multi-tab round-trip', () => {
  test('opens new tab and interacts', async ({ page, context }) => {
    await page.goto('https://example.com');
    const [newPage] = await Promise.all([
      context.waitForEvent('page'),
      page.click('a[target=_blank]')
    ]);
    await page.getByRole('button', { name: 'Submit' }).click();
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const output = generateTestFile(flow);

    // Verify the output contains the key elements
    expect(output).toContain("await page.goto('https://example.com');");
    expect(output).toContain('const [newPage] = await Promise.all([');
    expect(output).toContain("context.waitForEvent('page')");
    expect(output).toContain("page.click('a[target=_blank]')");
    expect(output).toContain(".click()");
  });

  // ─── Storage State Tests ───────────────────────────────────────────

  it('generates context.storageState({ path }) for save operation', () => {
    const flow = makeMinimalFlow({ tests: [{ id: 'tc1', name: 'test', nodes: [
      makeNode('storageState', {
        type: 'storageState',
        operation: 'save',
        filePath: 'auth.json',
      }),
    ], edges: [] }] });

    const output = generateTestFile(flow);
    expect(output).toContain("await context.storageState({ path: 'auth.json' });");
  });

  it('generates context.storageState with custom contextVariable', () => {
    const flow = makeMinimalFlow({ tests: [{ id: 'tc1', name: 'test', nodes: [
      makeNode('storageState', {
        type: 'storageState',
        operation: 'save',
        filePath: 'state.json',
        contextVariable: 'browserContext',
      }),
    ], edges: [] }] });

    const output = generateTestFile(flow);
    expect(output).toContain("await browserContext.storageState({ path: 'state.json' });");
  });

  it('generates test.use({ storageState }) for load operation', () => {
    const flow = makeMinimalFlow({ tests: [{ id: 'tc1', name: 'test', nodes: [
      makeNode('storageState', {
        type: 'storageState',
        operation: 'load',
        filePath: 'auth.json',
      }),
    ], edges: [] }] });

    const output = generateTestFile(flow);
    expect(output).toContain("test.use({ storageState: 'auth.json' });");
  });

  // ─── test.step() / Group Tests ─────────────────────────────────────

  it('generates test.step() for group node', () => {
    const flow = makeMinimalFlow({ tests: [{ id: 'tc1', name: 'test', nodes: [
      makeNode('group', {
        type: 'group',
        stepName: 'Login',
        children: [
          makeNode('navigate', { type: 'navigate', url: '/login' }),
          makeNode('fill', { type: 'fill', locator: { kind: 'inline', strategy: 'locator', value: '#user' }, value: 'admin' }),
        ],
      }),
    ], edges: [] }] });

    const output = generateTestFile(flow);
    expect(output).toContain("await test.step('Login', async () => {");
    expect(output).toContain("await page.goto('/login');");
    expect(output).toContain("await page.locator('#user').fill('admin');");
  });

  it('round-trips storage state save', () => {
    setup();
    const filePath = path.join(tmpDir, 'roundtrip-storage.spec.ts');
    fs.writeFileSync(
      filePath,
      `import { test, expect } from '@playwright/test';

test.describe('Storage', () => {
  test('save state', async ({ context }) => {
    await context.storageState({ path: 'auth.json' });
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const output = generateTestFile(flow);
    expect(output).toContain("await context.storageState({ path: 'auth.json' });");
  });

  it('round-trips test.step()', () => {
    setup();
    const filePath = path.join(tmpDir, 'roundtrip-step.spec.ts');
    fs.writeFileSync(
      filePath,
      `import { test, expect } from '@playwright/test';

test.describe('Steps', () => {
  test('grouped', async ({ page }) => {
    await test.step('Login', async () => {
      await page.goto('/login');
      await page.locator('#submit').click();
    });
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const output = generateTestFile(flow);
    expect(output).toContain("await test.step('Login', async () => {");
    expect(output).toContain("await page.goto('/login');");
    expect(output).toContain("await page.locator('#submit').click();");
  });

  // ─── Try/Catch/Finally Generation ────────────────────────────────────

  it('generates try/catch with variable', () => {
    const flow = makeMinimalFlow({
      tests: [
        {
          id: 'tc1',
          name: 'try catch test',
          nodes: [
            makeNode('n1', {
              type: 'tryCatch',
              tryChildren: [
                makeNode('n2', { type: 'navigate', url: 'https://example.com' }),
              ],
              catchVariable: 'e',
              catchChildren: [
                makeNode('n3', { type: 'screenshot' }),
              ],
            }),
          ],
          edges: [],
        },
      ],
    });

    const output = generateTestFile(flow);
    expect(output).toContain('try {');
    expect(output).toContain("await page.goto('https://example.com');");
    expect(output).toContain('} catch (e) {');
    expect(output).toContain('await page.screenshot();');
  });

  it('generates try/finally (no catch)', () => {
    const flow = makeMinimalFlow({
      tests: [
        {
          id: 'tc1',
          name: 'try finally test',
          nodes: [
            makeNode('n1', {
              type: 'tryCatch',
              tryChildren: [
                makeNode('n2', { type: 'navigate', url: 'https://example.com' }),
              ],
              finallyChildren: [
                makeNode('n3', { type: 'screenshot' }),
              ],
            }),
          ],
          edges: [],
        },
      ],
    });

    const output = generateTestFile(flow);
    expect(output).toContain('try {');
    expect(output).toContain('} finally {');
    expect(output).not.toContain('catch');
  });

  it('generates try/catch/finally with all sections', () => {
    const flow = makeMinimalFlow({
      tests: [
        {
          id: 'tc1',
          name: 'try catch finally test',
          nodes: [
            makeNode('n1', {
              type: 'tryCatch',
              tryChildren: [
                makeNode('n2', { type: 'navigate', url: 'https://example.com' }),
              ],
              catchVariable: 'error',
              catchChildren: [
                makeNode('n3', { type: 'screenshot' }),
              ],
              finallyChildren: [
                makeNode('n4', { type: 'wait', duration: 1000 }),
              ],
            }),
          ],
          edges: [],
        },
      ],
    });

    const output = generateTestFile(flow);
    expect(output).toContain('try {');
    expect(output).toContain('} catch (error) {');
    expect(output).toContain('} finally {');
    expect(output).toContain('await page.waitForTimeout(1000);');
  });

  it('generates try/catch without variable', () => {
    const flow = makeMinimalFlow({
      tests: [
        {
          id: 'tc1',
          name: 'try catch no var',
          nodes: [
            makeNode('n1', {
              type: 'tryCatch',
              tryChildren: [
                makeNode('n2', { type: 'navigate', url: 'https://example.com' }),
              ],
              catchChildren: [
                makeNode('n3', { type: 'screenshot' }),
              ],
            }),
          ],
          edges: [],
        },
      ],
    });

    const output = generateTestFile(flow);
    expect(output).toContain('} catch {');
    expect(output).not.toContain('catch (');
  });

  it('round-trips try/catch/finally through parse and generate', () => {
    setup();
    const filePath = writeTestFile(
      'try-catch-roundtrip.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Test Suite', () => {
  test('try catch finally', async ({ page }) => {
    try {
      await page.goto('https://example.com');
    } catch (e) {
      await page.screenshot();
    } finally {
      await page.waitForTimeout(1000);
    }
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const output = generateTestFile(flow);
    expect(output).toContain('try {');
    expect(output).toContain("await page.goto('https://example.com');");
    expect(output).toContain('} catch (e) {');
    expect(output).toContain('await page.screenshot();');
    expect(output).toContain('} finally {');
    expect(output).toContain('await page.waitForTimeout(1000);');
  });

  // ── Soft assertions ──────────────────────────────────────────────────

  it('generates expect.soft(locator).toBeVisible() when soft is true', () => {
    const flow = makeMinimalFlow({
      tests: [{
        id: 'tc1',
        name: 'soft test',
        nodes: [
          makeNode('n1', {
            type: 'assertVisible',
            locator: { kind: 'inline', strategy: 'getByText', value: 'Hello' },
            soft: true,
          }),
        ],
        edges: [],
      }],
    });

    const output = generateTestFile(flow);
    expect(output).toContain("await expect.soft(page.getByText('Hello')).toBeVisible();");
  });

  it('generates expect.soft(locator).not.toBeVisible() when both soft and negated', () => {
    const flow = makeMinimalFlow({
      tests: [{
        id: 'tc1',
        name: 'soft negated test',
        nodes: [
          makeNode('n1', {
            type: 'assertVisible',
            locator: { kind: 'inline', strategy: 'locator', value: '.banner' },
            soft: true,
            negated: true,
          }),
        ],
        edges: [],
      }],
    });

    const output = generateTestFile(flow);
    expect(output).toContain("await expect.soft(page.locator('.banner')).not.toBeVisible();");
  });

  it('generates expect.soft for assertText with soft: true', () => {
    const flow = makeMinimalFlow({
      tests: [{
        id: 'tc1',
        name: 'soft text test',
        nodes: [
          makeNode('n1', {
            type: 'assertText',
            locator: { kind: 'inline', strategy: 'getByText', value: 'heading' },
            expected: 'Hello',
            exact: true,
            soft: true,
          }),
        ],
        edges: [],
      }],
    });

    const output = generateTestFile(flow);
    expect(output).toContain("await expect.soft(page.getByText('heading')).toHaveText('Hello');");
  });

  it('generates expect.soft(locator).not.toHaveText() when soft and negated', () => {
    const flow = makeMinimalFlow({
      tests: [{
        id: 'tc1',
        name: 'soft negated text test',
        nodes: [
          makeNode('n1', {
            type: 'assertText',
            locator: { kind: 'inline', strategy: 'locator', value: 'h1' },
            expected: 'x',
            exact: true,
            soft: true,
            negated: true,
          }),
        ],
        edges: [],
      }],
    });

    const output = generateTestFile(flow);
    expect(output).toContain("await expect.soft(page.locator('h1')).not.toHaveText('x');");
  });

  it('generates normal expect() when soft is not set', () => {
    const flow = makeMinimalFlow({
      tests: [{
        id: 'tc1',
        name: 'normal test',
        nodes: [
          makeNode('n1', {
            type: 'assertVisible',
            locator: { kind: 'inline', strategy: 'getByText', value: 'Hello' },
          }),
        ],
        edges: [],
      }],
    });

    const output = generateTestFile(flow);
    expect(output).toContain("await expect(page.getByText('Hello')).toBeVisible();");
    expect(output).not.toContain('expect.soft');
  });

  it('round-trip: soft assertion survives parse -> generate -> parse cycle', () => {
    setup();
    const filePath = writeTestFile(
      'soft-roundtrip.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Soft roundtrip', () => {
  test('soft assertions', async ({ page }) => {
    await expect.soft(page.locator('h1')).toBeVisible();
    await expect.soft(page.locator('.msg')).not.toHaveText('error');
  });
});
`,
    );

    // Parse
    const flow1 = parseTestFile(filePath);
    const nodes1 = flow1.tests[0].nodes;
    expect(nodes1[0].data.type).toBe('assertVisible');
    if (nodes1[0].data.type === 'assertVisible') {
      expect(nodes1[0].data.soft).toBe(true);
    }

    // Generate
    const output = generateTestFile(flow1);
    expect(output).toContain('expect.soft(page.locator(');
    expect(output).toContain('.toBeVisible()');
    expect(output).toContain('.not.toHaveText(');

    // Parse again
    const filePath2 = writeTestFile('soft-roundtrip-2.spec.ts', output);
    const flow2 = parseTestFile(filePath2);
    const nodes2 = flow2.tests[0].nodes;

    expect(nodes2[0].data.type).toBe('assertVisible');
    if (nodes2[0].data.type === 'assertVisible') {
      expect(nodes2[0].data.soft).toBe(true);
      expect(nodes2[0].data.negated).toBeUndefined();
    }

    expect(nodes2[1].data.type).toBe('assertText');
    if (nodes2[1].data.type === 'assertText') {
      expect(nodes2[1].data.soft).toBe(true);
      expect(nodes2[1].data.negated).toBe(true);
    }
  });
});

describe('generateTestFile - annotations and tags', () => {
  it('generates test.slow() at the top of the test body', () => {
    const navNode = makeNode('n1', { type: 'navigate', url: 'https://example.com' }, 0);

    const flow = makeMinimalFlow({
      tests: [
        {
          id: 'tc1',
          name: 'slow test',
          nodes: [navNode],
          edges: [],
          annotations: ['slow'],
        },
      ],
    });

    const output = generateTestFile(flow);
    expect(output).toContain("test('slow test', async ({ page }) => {");
    expect(output).toContain('    test.slow();');
    // test.slow() should come before the navigate action
    const slowIdx = output.indexOf('test.slow()');
    const gotoIdx = output.indexOf("page.goto('https://example.com')");
    expect(slowIdx).toBeLessThan(gotoIdx);
  });

  it('generates multiple annotations', () => {
    const navNode = makeNode('n1', { type: 'navigate', url: 'https://example.com' }, 0);

    const flow = makeMinimalFlow({
      tests: [
        {
          id: 'tc1',
          name: 'broken test',
          nodes: [navNode],
          edges: [],
          annotations: ['fixme', 'fail'],
        },
      ],
    });

    const output = generateTestFile(flow);
    expect(output).toContain('    test.fixme();');
    expect(output).toContain('    test.fail();');
  });

  it('generates tags in the options object', () => {
    const navNode = makeNode('n1', { type: 'navigate', url: 'https://example.com' }, 0);

    const flow = makeMinimalFlow({
      tests: [
        {
          id: 'tc1',
          name: 'tagged test',
          nodes: [navNode],
          edges: [],
          tags: ['@smoke', '@regression'],
        },
      ],
    });

    const output = generateTestFile(flow);
    expect(output).toContain("test('tagged test', { tag: ['@smoke', '@regression'] }, async ({ page }) => {");
  });

  it('generates tags with test.skip prefix', () => {
    const navNode = makeNode('n1', { type: 'navigate', url: 'https://example.com' }, 0);

    const flow = makeMinimalFlow({
      tests: [
        {
          id: 'tc1',
          name: 'skipped tagged test',
          nodes: [navNode],
          edges: [],
          tags: ['@skip', '@smoke'],
        },
      ],
    });

    const output = generateTestFile(flow);
    expect(output).toContain("test.skip('skipped tagged test', { tag: ['@smoke'] }, async ({ page }) => {");
  });

  it('generates both annotations and tags', () => {
    const navNode = makeNode('n1', { type: 'navigate', url: 'https://example.com' }, 0);

    const flow = makeMinimalFlow({
      tests: [
        {
          id: 'tc1',
          name: 'complex test',
          nodes: [navNode],
          edges: [],
          tags: ['@smoke'],
          annotations: ['slow'],
        },
      ],
    });

    const output = generateTestFile(flow);
    expect(output).toContain("test('complex test', { tag: ['@smoke'] }, async ({ page }) => {");
    expect(output).toContain('    test.slow();');
  });

  it('round-trips annotations and tags through parse and generate', () => {
    setup();
    const filePath = writeTestFile(
      'roundtrip-annotations.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Suite', () => {
  test('annotated and tagged', { tag: ['@smoke', '@regression'] }, async ({ page }) => {
    test.slow();
    await page.goto('https://example.com');
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const output = generateTestFile(flow);

    expect(output).toContain("{ tag: ['@smoke', '@regression'] }");
    expect(output).toContain('test.slow();');
    expect(output).toContain("await page.goto('https://example.com');");
  });

  // ── test.use() Fixture Overrides Generation ─────────────────────────

  it('generates test.use({ ... }) with correct formatting for nested objects', () => {
    const flow = makeMinimalFlow({
      fixtureOverrides: {
        viewport: { value: { width: 1280, height: 720 } },
        locale: { value: 'fr-FR' },
      },
      tests: [
        {
          id: 'tc1',
          name: 'test with overrides',
          nodes: [makeNode('n1', { type: 'navigate', url: 'https://example.com' })],
          edges: [],
        },
      ],
    });

    const output = generateTestFile(flow);
    expect(output).toContain("test.use({ viewport: { width: 1280, height: 720 }, locale: 'fr-FR' });");
  });

  it('generates test.use() with raw source for non-literal expressions', () => {
    const flow = makeMinimalFlow({
      fixtureOverrides: {
        storageState: { value: "path.join(__dirname, 'auth.json')", rawSource: "path.join(__dirname, 'auth.json')" },
      },
      tests: [
        {
          id: 'tc1',
          name: 'auth test',
          nodes: [makeNode('n1', { type: 'navigate', url: '/dashboard' })],
          edges: [],
        },
      ],
    });

    const output = generateTestFile(flow);
    expect(output).toContain("test.use({ storageState: path.join(__dirname, 'auth.json') });");
  });

  it('generates test.use() in nested describe blocks', () => {
    const flow = makeMinimalFlow({
      children: [
        {
          name: 'Mobile',
          tests: [
            {
              id: 'tc1',
              name: 'mobile layout',
              nodes: [makeNode('n1', { type: 'navigate', url: '/' })],
              edges: [],
            },
          ],
          fixtureOverrides: {
            viewport: { value: { width: 375, height: 667 } },
          },
        },
      ],
    });

    const output = generateTestFile(flow);
    expect(output).toContain("test.use({ viewport: { width: 375, height: 667 } });");
  });

  it('round-trips test.use() through parse and generate', () => {
    setup();
    const filePath = writeTestFile(
      'roundtrip-use.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Round trip', () => {
  test.use({ viewport: { width: 1280, height: 720 }, locale: 'fr-FR' });

  test('basic', async ({ page }) => {
    await page.goto('/');
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const output = generateTestFile(flow);

    expect(output).toContain("test.use({ viewport: { width: 1280, height: 720 }, locale: 'fr-FR' });");
    expect(output).toContain("await page.goto('/');");
  });
});

describe('iteration round-trip', () => {
  it('round-trips a forEach iteration', () => {
    setup();
    const input = `import { test, expect } from '@playwright/test';

test.describe('Iteration Suite', () => {
  test('forEach test', async ({ page }) => {
    const items = ['a', 'b', 'c'];
    items.forEach((item) => {
      console.log(item);
    });
  });
});
`;
    const filePath = writeTestFile('foreach-rt.spec.ts', input);
    const flow = parseTestFile(filePath);
    const output = generateTestFile(flow);

    expect(output).toContain('items.forEach((item) => {');
    expect(output).toContain('console.log(item);');
  });

  it('round-trips a map with result variable', () => {
    setup();
    const input = `import { test, expect } from '@playwright/test';

test.describe('Map Suite', () => {
  test('map test', async ({ page }) => {
    const urls = ['https://a.com', 'https://b.com'];
    const results = urls.map((url) => {
      return url.toUpperCase();
    });
  });
});
`;
    const filePath = writeTestFile('map-rt.spec.ts', input);
    const flow = parseTestFile(filePath);
    const output = generateTestFile(flow);

    expect(output).toContain('const results = urls.map((url) => {');
    expect(output).toContain('return url.toUpperCase();');
  });

  it('round-trips an async forEach', () => {
    setup();
    const input = `import { test, expect } from '@playwright/test';

test.describe('Async Suite', () => {
  test('async forEach', async ({ page }) => {
    const links = ['#a', '#b'];
    links.forEach(async (link) => {
      await page.goto(link);
    });
  });
});
`;
    const filePath = writeTestFile('async-foreach-rt.spec.ts', input);
    const flow = parseTestFile(filePath);
    const output = generateTestFile(flow);

    expect(output).toContain('links.forEach(async (link) => {');
  });

  it('generates iteration node from model directly', () => {
    const iterNode = makeNode('iter1', {
      type: 'iteration',
      method: 'forEach',
      arrayExpression: 'items',
      callbackParams: ['item'],
      children: [
        makeNode('c1', { type: 'codeBlock', code: 'console.log(item);' }),
      ],
    } as ActionNode['data']);

    const flow = makeMinimalFlow({
      tests: [
        {
          id: 'tc1',
          name: 'iteration test',
          nodes: [iterNode],
          edges: [],
        },
      ],
    });

    const output = generateTestFile(flow);
    expect(output).toContain('items.forEach((item) => {');
    expect(output).toContain('console.log(item);');
  });

  it('generates a switch statement with cases and default', () => {
    const switchNode = makeNode('s1', {
      type: 'switch',
      expression: 'status',
      cases: [
        {
          value: "'active'",
          children: [makeNode('s1a', { type: 'navigate', url: 'https://example.com/active' })],
          fallsThrough: false,
        },
        {
          value: "'inactive'",
          children: [makeNode('s1b', { type: 'navigate', url: 'https://example.com/inactive' })],
          fallsThrough: false,
        },
        {
          value: null,
          children: [makeNode('s1c', { type: 'navigate', url: 'https://example.com/unknown' })],
          fallsThrough: false,
        },
      ],
    });

    const flow = makeMinimalFlow({
      tests: [
        {
          id: 'tc1',
          name: 'switch test',
          nodes: [switchNode],
          edges: [],
        },
      ],
    });

    const output = generateTestFile(flow);
    expect(output).toContain('switch (status) {');
    expect(output).toContain("case 'active':");
    expect(output).toContain("await page.goto('https://example.com/active');");
    expect(output).toContain('break;');
    expect(output).toContain("case 'inactive':");
    expect(output).toContain('default:');
    expect(output).toContain("await page.goto('https://example.com/unknown');");
  });

  it('generates switch with fall-through cases', () => {
    const switchNode = makeNode('s1', {
      type: 'switch',
      expression: 'role',
      cases: [
        {
          value: "'admin'",
          children: [],
          fallsThrough: true,
        },
        {
          value: "'superadmin'",
          children: [makeNode('s1a', { type: 'navigate', url: 'https://example.com/admin' })],
          fallsThrough: false,
        },
      ],
    });

    const flow = makeMinimalFlow({
      tests: [
        {
          id: 'tc1',
          name: 'fallthrough test',
          nodes: [switchNode],
          edges: [],
        },
      ],
    });

    const output = generateTestFile(flow);
    expect(output).toContain("case 'admin':");
    expect(output).toContain("case 'superadmin':");
    // The admin case should NOT have break
    const adminIndex = output.indexOf("case 'admin':");
    const superadminIndex = output.indexOf("case 'superadmin':");
    const betweenCases = output.slice(adminIndex, superadminIndex);
    expect(betweenCases).not.toContain('break;');
  });

  it('round-trips a switch statement through parse and generate', () => {
    setup();
    const original = `import { test, expect } from '@playwright/test';

test.describe('Switch Suite', () => {
  test('switch test', async ({ page }) => {
    switch (status) {
      case 'active':
        await page.goto('https://example.com/active');
        break;
      case 'inactive':
        await page.goto('https://example.com/inactive');
        break;
      default:
        await page.goto('https://example.com/unknown');
        break;
    }
  });
});
`;

    const filePath = writeTestFile('switch-roundtrip.spec.ts', original);
    const flow = parseTestFile(filePath);
    const output = generateTestFile(flow);

    expect(output).toContain('switch (status) {');
    expect(output).toContain("case 'active':");
    expect(output).toContain("case 'inactive':");
    expect(output).toContain('default:');
    expect(output).toContain("await page.goto('https://example.com/active');");
    expect(output).toContain("await page.goto('https://example.com/inactive');");
    expect(output).toContain("await page.goto('https://example.com/unknown');");
  });

  describe('custom expect messages', () => {
    it('generates expect with message when present', () => {
      setup();
      const flow = makeMinimalFlow({
        tests: [
          {
            id: 'tc1',
            name: 'message test',
            nodes: [
              makeNode('n1', {
                type: 'assertVisible',
                locator: { kind: 'inline', strategy: 'getByRole', value: "'button', { name: 'Submit' }" },
                message: 'Submit button should be visible',
              } as any),
            ],
            edges: [],
          },
        ],
      });

      const output = generateTestFile(flow);
      expect(output).toContain("await expect(page.getByRole('button', { name: 'Submit' }), 'Submit button should be visible').toBeVisible();");
    });

    it('generates expect without message when absent', () => {
      setup();
      const flow = makeMinimalFlow({
        tests: [
          {
            id: 'tc1',
            name: 'no message test',
            nodes: [
              makeNode('n1', {
                type: 'assertVisible',
                locator: { kind: 'inline', strategy: 'getByRole', value: "'button', { name: 'Submit' }" },
              } as any),
            ],
            edges: [],
          },
        ],
      });

      const output = generateTestFile(flow);
      expect(output).toContain("await expect(page.getByRole('button', { name: 'Submit' })).toBeVisible();");
      expect(output).not.toContain("undefined");
    });

    it('generates expect.soft with message', () => {
      setup();
      const flow = makeMinimalFlow({
        tests: [
          {
            id: 'tc1',
            name: 'soft message test',
            nodes: [
              makeNode('n1', {
                type: 'assertText',
                locator: { kind: 'inline', strategy: 'locator', value: '.greeting' },
                expected: 'Hello',
                exact: true,
                soft: true,
                message: 'check greeting text',
              } as any),
            ],
            edges: [],
          },
        ],
      });

      const output = generateTestFile(flow);
      expect(output).toContain("await expect.soft(page.locator('.greeting'), 'check greeting text').toHaveText('Hello');");
    });

    it('round-trips custom expect message through parse and generate', () => {
      setup();
      const filePath = writeTestFile(
        'roundtrip-message.spec.ts',
        `
import { test, expect } from '@playwright/test';

test('roundtrip message', async ({ page }) => {
  await expect(page.locator('.btn'), 'Login button should be visible').toBeVisible();
  await expect.soft(page.locator('.text'), 'check text content').toHaveText('hello');
});
`,
      );

      const flow = parseTestFile(filePath);
      const output = generateTestFile(flow);

      expect(output).toContain("await expect(page.locator('.btn'), 'Login button should be visible').toBeVisible();");
      expect(output).toContain("await expect.soft(page.locator('.text'), 'check text content').toHaveText('hello');");
    });
  });

  it('round-trips test.describe.parallel()', () => {
    setup();
    const filePath = writeTestFile(
      'parallel-rt.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe.parallel('Parallel Suite', () => {
  test('fast test', async ({ page }) => {
    await page.goto('/fast');
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    expect(flow.describeMode).toBe('parallel');

    const output = generateTestFile(flow);
    expect(output).toContain("test.describe.parallel('Parallel Suite'");
    expect(output).toContain("await page.goto('/fast')");
  });

  it('generates test.setTimeout() in test body', () => {
    setup();
    const filePath = writeTestFile(
      'timeout-gen.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Suite', () => {
  test('slow test', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/slow');
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    expect(flow.tests[0].timeout).toBe(60000);

    const output = generateTestFile(flow);
    expect(output).toContain('test.setTimeout(60000);');
    expect(output).toContain("await page.goto('/slow')");
  });

  it('generates test.setTimeout() at describe level', () => {
    setup();
    const filePath = writeTestFile(
      'desc-timeout-gen.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Suite', () => {
  test.setTimeout(30000);

  test('a test', async ({ page }) => {
    await page.goto('/');
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    expect(flow.timeout).toBe(30000);

    const output = generateTestFile(flow);
    expect(output).toContain('test.setTimeout(30000);');
  });

  it('omits test.setTimeout() when timeout is undefined', () => {
    setup();
    const filePath = writeTestFile(
      'no-timeout-gen.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Suite', () => {
  test('normal test', async ({ page }) => {
    await page.goto('/');
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const output = generateTestFile(flow);
    expect(output).not.toContain('test.setTimeout');
  });
});
