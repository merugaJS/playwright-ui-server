import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseTestFile } from '../test-parser.js';

let tmpDir: string;

function setup(): string {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-parser-'));
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

describe('parseTestFile', () => {
  it('parses a simple test with page.goto, click, fill and returns correct node types', () => {
    setup();
    const filePath = writeTestFile(
      'simple.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('login flow', async ({ page }) => {
  await page.goto('https://example.com');
  await page.getByLabel('Email').fill('user@test.com');
  await page.getByRole('button', { name: 'Submit' }).click();
});
`,
    );

    const flow = parseTestFile(filePath);

    expect(flow.tests).toHaveLength(1);
    const tc = flow.tests[0];
    expect(tc.name).toBe('login flow');

    const types = tc.nodes.map((n) => n.data.type);
    expect(types).toEqual(['navigate', 'fill', 'click']);

    // Verify navigate data
    const nav = tc.nodes[0].data;
    expect(nav.type).toBe('navigate');
    if (nav.type === 'navigate') {
      expect(nav.url).toBe('https://example.com');
    }

    // Verify fill data
    const fill = tc.nodes[1].data;
    expect(fill.type).toBe('fill');
    if (fill.type === 'fill') {
      expect(fill.value).toBe('user@test.com');
      expect(fill.locator.kind).toBe('inline');
      if (fill.locator.kind === 'inline') {
        expect(fill.locator.strategy).toBe('getByLabel');
        expect(fill.locator.value).toBe('Email');
      }
    }

    // Verify click data
    const click = tc.nodes[2].data;
    expect(click.type).toBe('click');
    if (click.type === 'click') {
      expect(click.locator.kind).toBe('inline');
      if (click.locator.kind === 'inline') {
        expect(click.locator.strategy).toBe('getByRole');
      }
    }

    // Verify linear edges were created
    expect(tc.edges).toHaveLength(2);
    expect(tc.edges[0].source).toBe(tc.nodes[0].id);
    expect(tc.edges[0].target).toBe(tc.nodes[1].id);
    expect(tc.edges[1].source).toBe(tc.nodes[1].id);
    expect(tc.edges[1].target).toBe(tc.nodes[2].id);
  });

  it('parses beforeEach and afterEach hooks', () => {
    setup();
    const filePath = writeTestFile(
      'hooks.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('https://example.com/setup');
});

test.afterEach(async ({ page }) => {
  await page.goto('https://example.com/cleanup');
});

test('with hooks', async ({ page }) => {
  await page.getByText('Hello').click();
});
`,
    );

    const flow = parseTestFile(filePath);

    expect(flow.beforeEach).toBeDefined();
    expect(flow.beforeEach).toHaveLength(1);
    expect(flow.beforeEach![0].data.type).toBe('navigate');

    expect(flow.afterEach).toBeDefined();
    expect(flow.afterEach).toHaveLength(1);
    expect(flow.afterEach![0].data.type).toBe('navigate');
  });

  it('parses test.describe with correct name', () => {
    setup();
    const filePath = writeTestFile(
      'describe.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Login Suite', () => {
  test('should login', async ({ page }) => {
    await page.goto('/login');
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    expect(flow.describe).toBe('Login Suite');
  });

  it('parses expect assertions (toBeVisible, toHaveText)', () => {
    setup();
    const filePath = writeTestFile(
      'assertions.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('assertions', async ({ page }) => {
  await expect(page.getByText('Welcome')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Title' })).toHaveText('Title');
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(2);

    const visible = tc.nodes[0].data;
    expect(visible.type).toBe('assertVisible');
    if (visible.type === 'assertVisible') {
      expect(visible.locator.kind).toBe('inline');
      if (visible.locator.kind === 'inline') {
        expect(visible.locator.strategy).toBe('getByText');
        expect(visible.locator.value).toBe('Welcome');
      }
    }

    const textAssert = tc.nodes[1].data;
    expect(textAssert.type).toBe('assertText');
    if (textAssert.type === 'assertText') {
      expect(textAssert.expected).toBe('Title');
      expect(textAssert.exact).toBe(true);
      if (textAssert.locator.kind === 'inline') {
        expect(textAssert.locator.strategy).toBe('getByRole');
      }
    }
  });

  it('parses different locator strategies (getByRole, getByText, getByLabel, locator)', () => {
    setup();
    const filePath = writeTestFile(
      'locators.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('locator strategies', async ({ page }) => {
  await page.getByRole('button', { name: 'OK' }).click();
  await page.getByText('Hello').click();
  await page.getByLabel('Username').fill('admin');
  await page.locator('#my-input').fill('value');
});
`,
    );

    const flow = parseTestFile(filePath);
    const nodes = flow.tests[0].nodes;
    expect(nodes).toHaveLength(4);

    // getByRole
    const n0 = nodes[0].data;
    if (n0.type === 'click' && n0.locator.kind === 'inline') {
      expect(n0.locator.strategy).toBe('getByRole');
    }

    // getByText
    const n1 = nodes[1].data;
    if (n1.type === 'click' && n1.locator.kind === 'inline') {
      expect(n1.locator.strategy).toBe('getByText');
      expect(n1.locator.value).toBe('Hello');
    }

    // getByLabel
    const n2 = nodes[2].data;
    if (n2.type === 'fill' && n2.locator.kind === 'inline') {
      expect(n2.locator.strategy).toBe('getByLabel');
      expect(n2.locator.value).toBe('Username');
    }

    // locator (css)
    const n3 = nodes[3].data;
    if (n3.type === 'fill' && n3.locator.kind === 'inline') {
      expect(n3.locator.strategy).toBe('locator');
      expect(n3.locator.value).toBe('#my-input');
    }
  });

  it('detects page object method calls as pageObjectRef nodes', () => {
    setup();
    const filePath = writeTestFile(
      'page-object-ref.spec.ts',
      `
import { test, expect } from '@playwright/test';
import { LoginPage } from './login-page';

test('uses page object', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.login('admin', 'password');
});
`,
    );

    const flow = parseTestFile(filePath);
    const nodes = flow.tests[0].nodes;

    // const loginPage = new LoginPage(page) => codeBlock
    // await loginPage.login('admin', 'password') => pageObjectRef
    expect(nodes).toHaveLength(2);

    const constructorNode = nodes[0];
    expect(constructorNode.data.type).toBe('codeBlock');

    const poRef = nodes[1].data;
    expect(poRef.type).toBe('pageObjectRef');
    if (poRef.type === 'pageObjectRef') {
      expect(poRef.pageObjectId).toBe('LoginPage');
      expect(poRef.method).toBe('login');
      expect(poRef.args).toEqual(['admin', 'password']);
    }
  });

  it('constructor calls (const lp = new LoginPage(page)) become codeBlock nodes', () => {
    setup();
    const filePath = writeTestFile(
      'constructor.spec.ts',
      `
import { test } from '@playwright/test';
import { LoginPage } from './login-page';

test('constructor call', async ({ page }) => {
  const lp = new LoginPage(page);
  await page.goto('/');
});
`,
    );

    const flow = parseTestFile(filePath);
    const nodes = flow.tests[0].nodes;
    expect(nodes).toHaveLength(2);

    // Variable declaration => codeBlock
    expect(nodes[0].data.type).toBe('codeBlock');
    if (nodes[0].data.type === 'codeBlock') {
      expect(nodes[0].data.code).toContain('new LoginPage');
    }

    expect(nodes[1].data.type).toBe('navigate');
  });

  it('extracts fixture names from destructured params', () => {
    setup();
    const filePath = writeTestFile(
      'fixtures.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('with fixtures', async ({ page, myFixture, anotherFixture }) => {
  await page.goto('/');
});
`,
    );

    const flow = parseTestFile(filePath);
    expect(flow.fixtures).toContain('page');
    expect(flow.fixtures).toContain('myFixture');
    expect(flow.fixtures).toContain('anotherFixture');
  });

  it('extracts imports', () => {
    setup();
    const filePath = writeTestFile(
      'imports.spec.ts',
      `
import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/login-page';
import DefaultExport from './some-module';

test('a test', async ({ page }) => {
  await page.goto('/');
});
`,
    );

    const flow = parseTestFile(filePath);
    expect(flow.imports).toHaveLength(3);

    const pwImport = flow.imports.find((i) => i.moduleSpecifier === '@playwright/test');
    expect(pwImport).toBeDefined();
    expect(pwImport!.namedImports).toContain('test');
    expect(pwImport!.namedImports).toContain('expect');

    const loginImport = flow.imports.find((i) => i.moduleSpecifier === '../pages/login-page');
    expect(loginImport).toBeDefined();
    expect(loginImport!.namedImports).toContain('LoginPage');

    const defaultImport = flow.imports.find((i) => i.moduleSpecifier === './some-module');
    expect(defaultImport).toBeDefined();
    expect(defaultImport!.defaultImport).toBe('DefaultExport');
  });

  it('extracts utility named imports from relative paths', () => {
    setup();
    const filePath = writeTestFile(
      'util-imports.spec.ts',
      `
import { test, expect } from '@playwright/test';
import { generateUser, waitForApi } from '../utils/helpers';

test.describe('util tests', () => {
  test('uses helpers', async ({ page }) => {
    await page.goto('/');
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    expect(flow.imports).toHaveLength(2);

    const utilImport = flow.imports.find((i) => i.moduleSpecifier === '../utils/helpers');
    expect(utilImport).toBeDefined();
    expect(utilImport!.namedImports).toEqual(['generateUser', 'waitForApi']);
    expect(utilImport!.isSideEffect).toBeUndefined();
    expect(utilImport!.namespaceImport).toBeUndefined();
  });

  it('extracts default utility imports', () => {
    setup();
    const filePath = writeTestFile(
      'default-import.spec.ts',
      `
import { test } from '@playwright/test';
import helpers from '../utils/helpers';

test.describe('default import', () => {
  test('uses default', async ({ page }) => {
    await page.goto('/');
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const utilImport = flow.imports.find((i) => i.moduleSpecifier === '../utils/helpers');
    expect(utilImport).toBeDefined();
    expect(utilImport!.defaultImport).toBe('helpers');
    expect(utilImport!.namedImports).toEqual([]);
    expect(utilImport!.isSideEffect).toBeUndefined();
  });

  it('extracts side-effect imports', () => {
    setup();
    const filePath = writeTestFile(
      'side-effect.spec.ts',
      `
import { test } from '@playwright/test';
import './setup';

test.describe('side effect', () => {
  test('runs setup', async ({ page }) => {
    await page.goto('/');
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const sideEffectImport = flow.imports.find((i) => i.moduleSpecifier === './setup');
    expect(sideEffectImport).toBeDefined();
    expect(sideEffectImport!.isSideEffect).toBe(true);
    expect(sideEffectImport!.namedImports).toEqual([]);
    expect(sideEffectImport!.defaultImport).toBeUndefined();
    expect(sideEffectImport!.namespaceImport).toBeUndefined();
  });

  it('extracts namespace imports', () => {
    setup();
    const filePath = writeTestFile(
      'namespace-import.spec.ts',
      `
import { test } from '@playwright/test';
import * as utils from '../utils/helpers';

test.describe('namespace', () => {
  test('uses namespace', async ({ page }) => {
    await page.goto('/');
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const nsImport = flow.imports.find((i) => i.moduleSpecifier === '../utils/helpers');
    expect(nsImport).toBeDefined();
    expect(nsImport!.namespaceImport).toBe('utils');
    expect(nsImport!.namedImports).toEqual([]);
    expect(nsImport!.isSideEffect).toBeUndefined();
  });

  it('extracts mixed utility imports alongside Playwright imports', () => {
    setup();
    const filePath = writeTestFile(
      'mixed-imports.spec.ts',
      `
import { test, expect } from '@playwright/test';
import { generateUser } from '../utils/helpers';
import defaultHelper from '../lib/default-helper';
import * as config from '../support/config';
import '../setup/global-setup';

test.describe('mixed imports', () => {
  test('all imports captured', async ({ page }) => {
    await page.goto('/');
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    expect(flow.imports).toHaveLength(5);

    // Playwright import
    const pwImport = flow.imports.find((i) => i.moduleSpecifier === '@playwright/test');
    expect(pwImport).toBeDefined();
    expect(pwImport!.namedImports).toEqual(['test', 'expect']);

    // Named utility import
    const namedUtil = flow.imports.find((i) => i.moduleSpecifier === '../utils/helpers');
    expect(namedUtil).toBeDefined();
    expect(namedUtil!.namedImports).toEqual(['generateUser']);

    // Default utility import
    const defaultUtil = flow.imports.find((i) => i.moduleSpecifier === '../lib/default-helper');
    expect(defaultUtil).toBeDefined();
    expect(defaultUtil!.defaultImport).toBe('defaultHelper');

    // Namespace utility import
    const nsUtil = flow.imports.find((i) => i.moduleSpecifier === '../support/config');
    expect(nsUtil).toBeDefined();
    expect(nsUtil!.namespaceImport).toBe('config');

    // Side-effect import
    const sideEffect = flow.imports.find((i) => i.moduleSpecifier === '../setup/global-setup');
    expect(sideEffect).toBeDefined();
    expect(sideEffect!.isSideEffect).toBe(true);
  });

  it('uses file basename as describe name when no test.describe is present', () => {
    setup();
    const filePath = writeTestFile(
      'my-feature.spec.ts',
      `
import { test } from '@playwright/test';

test('standalone', async ({ page }) => {
  await page.goto('/');
});
`,
    );

    const flow = parseTestFile(filePath);
    expect(flow.describe).toBe('my-feature');
  });

  it('generates unique node IDs and correct positions', () => {
    setup();
    const filePath = writeTestFile(
      'ids.spec.ts',
      `
import { test } from '@playwright/test';

test('multi step', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Link').click();
  await page.getByLabel('Name').fill('test');
});
`,
    );

    const flow = parseTestFile(filePath);
    const nodes = flow.tests[0].nodes;
    const ids = nodes.map((n) => n.id);

    // All IDs should be unique
    expect(new Set(ids).size).toBe(ids.length);

    // Positions should increment
    for (let i = 1; i < nodes.length; i++) {
      expect(nodes[i].position.y).toBeGreaterThan(nodes[i - 1].position.y);
    }
  });

  it('handles test.only and test.skip tags', () => {
    setup();
    const filePath = writeTestFile(
      'tags.spec.ts',
      `
import { test } from '@playwright/test';

test.only('focused test', async ({ page }) => {
  await page.goto('/');
});

test.skip('skipped test', async ({ page }) => {
  await page.goto('/');
});
`,
    );

    const flow = parseTestFile(filePath);
    expect(flow.tests).toHaveLength(2);

    const onlyTest = flow.tests.find((t) => t.name === 'focused test');
    expect(onlyTest!.tags).toContain('@only');

    const skipTest = flow.tests.find((t) => t.name === 'skipped test');
    expect(skipTest!.tags).toContain('@skip');
  });

  it('discovers page objects from fixture destructuring', () => {
    setup();
    const filePath = writeTestFile(
      'fixture-po.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('uses fixture page object', async ({ page, loginPage }) => {
  await loginPage.navigateToLogin();
  await page.goto('/');
});
`,
    );

    const flow = parseTestFile(filePath);
    const nodes = flow.tests[0].nodes;

    // loginPage.navigateToLogin() should be detected as pageObjectRef
    const poRef = nodes.find((n) => n.data.type === 'pageObjectRef');
    expect(poRef).toBeDefined();
    if (poRef && poRef.data.type === 'pageObjectRef') {
      expect(poRef.data.pageObjectId).toBe('LoginPage');
      expect(poRef.data.method).toBe('navigateToLogin');
    }
  });

  it('accepts knownPageObjects parameter for explicit mappings', () => {
    setup();
    const filePath = writeTestFile(
      'known-po.spec.ts',
      `
import { test } from '@playwright/test';

test('with known po', async ({ page }) => {
  await myApi.doSomething();
});
`,
    );

    const known = new Map([['myApi', 'MyApiHelper']]);
    const flow = parseTestFile(filePath, known);
    const nodes = flow.tests[0].nodes;

    const poRef = nodes.find((n) => n.data.type === 'pageObjectRef');
    expect(poRef).toBeDefined();
    if (poRef && poRef.data.type === 'pageObjectRef') {
      expect(poRef.data.pageObjectId).toBe('MyApiHelper');
      expect(poRef.data.method).toBe('doSomething');
    }
  });

  it('parses a standard for loop with Playwright actions inside', () => {
    setup();
    const filePath = writeTestFile(
      'for-loop.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('for loop test', async ({ page }) => {
  for (let i = 0; i < 5; i++) {
    await page.getByText('Item').click();
  }
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(1);

    const loopNode = tc.nodes[0];
    expect(loopNode.type).toBe('loop');
    expect(loopNode.data.type).toBe('loop');
    if (loopNode.data.type === 'loop') {
      expect(loopNode.data.loopKind).toBe('for');
      expect(loopNode.data.initializer).toBe('let i = 0');
      expect(loopNode.data.condition).toBe('i < 5');
      expect(loopNode.data.incrementer).toBe('i++');
      expect(loopNode.data.body).toHaveLength(1);
      expect(loopNode.data.body[0].data.type).toBe('click');
    }
  });

  it('parses a for...of loop', () => {
    setup();
    const filePath = writeTestFile(
      'for-of-loop.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('for of loop test', async ({ page }) => {
  for (const item of items) {
    await page.goto(item);
  }
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(1);

    const loopNode = tc.nodes[0];
    expect(loopNode.type).toBe('loop');
    if (loopNode.data.type === 'loop') {
      expect(loopNode.data.loopKind).toBe('for...of');
      expect(loopNode.data.variableName).toBe('item');
      expect(loopNode.data.iterable).toBe('items');
      expect(loopNode.data.body).toHaveLength(1);
      expect(loopNode.data.body[0].data.type).toBe('navigate');
    }
  });

  it('parses a for...in loop', () => {
    setup();
    const filePath = writeTestFile(
      'for-in-loop.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('for in loop test', async ({ page }) => {
  for (const key in obj) {
    await page.goto(key);
  }
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(1);

    const loopNode = tc.nodes[0];
    expect(loopNode.type).toBe('loop');
    if (loopNode.data.type === 'loop') {
      expect(loopNode.data.loopKind).toBe('for...in');
      expect(loopNode.data.variableName).toBe('key');
      expect(loopNode.data.iterable).toBe('obj');
      expect(loopNode.data.body).toHaveLength(1);
    }
  });

  it('parses nested for loops', () => {
    setup();
    const filePath = writeTestFile(
      'nested-loops.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('nested loops', async ({ page }) => {
  for (let i = 0; i < 3; i++) {
    for (const item of items) {
      await page.getByText('Hello').click();
    }
  }
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(1);

    const outerLoop = tc.nodes[0];
    expect(outerLoop.data.type).toBe('loop');
    if (outerLoop.data.type === 'loop') {
      expect(outerLoop.data.loopKind).toBe('for');
      expect(outerLoop.data.body).toHaveLength(1);

      const innerLoop = outerLoop.data.body[0];
      expect(innerLoop.data.type).toBe('loop');
      if (innerLoop.data.type === 'loop') {
        expect(innerLoop.data.loopKind).toBe('for...of');
        expect(innerLoop.data.body).toHaveLength(1);
        expect(innerLoop.data.body[0].data.type).toBe('click');
      }
    }
  });

  it('parses a while loop', () => {
    setup();
    const filePath = writeTestFile(
      'while-loop.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('while loop test', async ({ page }) => {
  while (await page.getByText('Next').isVisible()) {
    await page.getByText('Next').click();
  }
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(1);

    const loopNode = tc.nodes[0];
    expect(loopNode.type).toBe('loop');
    expect(loopNode.data.type).toBe('loop');
    if (loopNode.data.type === 'loop') {
      expect(loopNode.data.loopKind).toBe('while');
      expect(loopNode.data.condition).toBe("await page.getByText('Next').isVisible()");
      expect(loopNode.data.body).toHaveLength(1);
      expect(loopNode.data.body[0].data.type).toBe('click');
    }
  });

  it('parses a do...while loop', () => {
    setup();
    const filePath = writeTestFile(
      'do-while-loop.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('do while loop test', async ({ page }) => {
  do {
    await page.getByText('Load More').click();
  } while (await page.getByText('Load More').isVisible());
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(1);

    const loopNode = tc.nodes[0];
    expect(loopNode.type).toBe('loop');
    expect(loopNode.data.type).toBe('loop');
    if (loopNode.data.type === 'loop') {
      expect(loopNode.data.loopKind).toBe('do...while');
      expect(loopNode.data.condition).toBe("await page.getByText('Load More').isVisible()");
      expect(loopNode.data.body).toHaveLength(1);
      expect(loopNode.data.body[0].data.type).toBe('click');
    }
  });

  it('parses nested while inside for loop', () => {
    setup();
    const filePath = writeTestFile(
      'nested-while-for.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('nested while in for', async ({ page }) => {
  for (let i = 0; i < 3; i++) {
    while (await page.getByText('Loading').isVisible()) {
      await page.waitForTimeout(100);
    }
  }
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(1);

    const outerLoop = tc.nodes[0];
    expect(outerLoop.data.type).toBe('loop');
    if (outerLoop.data.type === 'loop') {
      expect(outerLoop.data.loopKind).toBe('for');
      expect(outerLoop.data.body).toHaveLength(1);

      const innerLoop = outerLoop.data.body[0];
      expect(innerLoop.data.type).toBe('loop');
      if (innerLoop.data.type === 'loop') {
        expect(innerLoop.data.loopKind).toBe('while');
        expect(innerLoop.data.body).toHaveLength(1);
        expect(innerLoop.data.body[0].data.type).toBe('wait');
      }
    }
  });

  it('parses a simple if statement', () => {
    setup();
    const filePath = writeTestFile(
      'simple-if.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('simple if', async ({ page }) => {
  if (condition) {
    await page.getByText('OK').click();
  }
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(1);

    const node = tc.nodes[0];
    expect(node.type).toBe('conditional');
    expect(node.data.type).toBe('conditional');
    if (node.data.type === 'conditional') {
      expect(node.data.condition).toBe('condition');
      expect(node.data.thenChildren).toHaveLength(1);
      expect(node.data.thenChildren[0].data.type).toBe('click');
      expect(node.data.elseChildren).toBeUndefined();
      expect(node.data.elseIfBranches).toBeUndefined();
    }
  });

  it('parses if/else statement', () => {
    setup();
    const filePath = writeTestFile(
      'if-else.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('if else', async ({ page }) => {
  if (isLoggedIn) {
    await page.goto('/dashboard');
  } else {
    await page.goto('/login');
  }
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(1);

    const node = tc.nodes[0];
    expect(node.data.type).toBe('conditional');
    if (node.data.type === 'conditional') {
      expect(node.data.condition).toBe('isLoggedIn');
      expect(node.data.thenChildren).toHaveLength(1);
      expect(node.data.thenChildren[0].data.type).toBe('navigate');
      expect(node.data.elseChildren).toHaveLength(1);
      expect(node.data.elseChildren![0].data.type).toBe('navigate');
    }
  });

  it('parses if/else-if/else statement', () => {
    setup();
    const filePath = writeTestFile(
      'if-elseif-else.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('if else-if else', async ({ page }) => {
  if (role === 'admin') {
    await page.goto('/admin');
  } else if (role === 'user') {
    await page.goto('/user');
  } else {
    await page.goto('/guest');
  }
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(1);

    const node = tc.nodes[0];
    expect(node.data.type).toBe('conditional');
    if (node.data.type === 'conditional') {
      expect(node.data.condition).toBe("role === 'admin'");
      expect(node.data.thenChildren).toHaveLength(1);
      expect(node.data.elseIfBranches).toHaveLength(1);
      expect(node.data.elseIfBranches![0].condition).toBe("role === 'user'");
      expect(node.data.elseIfBranches![0].children).toHaveLength(1);
      expect(node.data.elseChildren).toHaveLength(1);
    }
  });

  it('parses expect(locator).not.toBeVisible() as assertVisible with negated: true', () => {
    setup();
    const filePath = writeTestFile(
      'negated-visible.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('negated visible', async ({ page }) => {
  await expect(page.locator('h1')).not.toBeVisible();
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(1);

    const node = tc.nodes[0].data;
    expect(node.type).toBe('assertVisible');
    if (node.type === 'assertVisible') {
      expect(node.negated).toBe(true);
      expect(node.locator.kind).toBe('inline');
      if (node.locator.kind === 'inline') {
        expect(node.locator.strategy).toBe('locator');
        expect(node.locator.value).toBe('h1');
      }
    }
  });

  it('parses expect(locator).not.toHaveText() as assertText with negated: true', () => {
    setup();
    const filePath = writeTestFile(
      'negated-text.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('negated text', async ({ page }) => {
  await expect(page.locator('h1')).not.toHaveText('foo');
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(1);

    const node = tc.nodes[0].data;
    expect(node.type).toBe('assertText');
    if (node.type === 'assertText') {
      expect(node.negated).toBe(true);
      expect(node.expected).toBe('foo');
      expect(node.exact).toBe(true);
    }
  });

  it('parses expect(locator).not.toContainText() as assertText with negated: true', () => {
    setup();
    const filePath = writeTestFile(
      'negated-contain.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('negated contain text', async ({ page }) => {
  await expect(page.getByText('heading')).not.toContainText('bar');
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(1);

    const node = tc.nodes[0].data;
    expect(node.type).toBe('assertText');
    if (node.type === 'assertText') {
      expect(node.negated).toBe(true);
      expect(node.expected).toBe('bar');
      expect(node.exact).toBeUndefined();
    }
  });

  it('non-negated assertions do not have negated field set', () => {
    setup();
    const filePath = writeTestFile(
      'non-negated.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('non negated', async ({ page }) => {
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('h1')).toHaveText('hello');
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(2);

    const visible = tc.nodes[0].data;
    expect(visible.type).toBe('assertVisible');
    if (visible.type === 'assertVisible') {
      expect(visible.negated).toBeUndefined();
    }

    const text = tc.nodes[1].data;
    expect(text.type).toBe('assertText');
    if (text.type === 'assertText') {
      expect(text.negated).toBeUndefined();
    }
  });

  it('parses nested if inside a for loop', () => {
    setup();
    const filePath = writeTestFile(
      'if-in-loop.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('if inside loop', async ({ page }) => {
  for (const item of items) {
    if (item.visible) {
      await page.getByText(item.name).click();
    }
  }
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(1);

    const loopNode = tc.nodes[0];
    expect(loopNode.data.type).toBe('loop');
    if (loopNode.data.type === 'loop') {
      expect(loopNode.data.body).toHaveLength(1);
      const ifNode = loopNode.data.body[0];
      expect(ifNode.data.type).toBe('conditional');
      if (ifNode.data.type === 'conditional') {
        expect(ifNode.data.condition).toBe('item.visible');
        expect(ifNode.data.thenChildren).toHaveLength(1);
        expect(ifNode.data.thenChildren[0].data.type).toBe('click');
      }
    }
  });

  // ─── Locator Chaining ───────────────────────────────────────────────

  it('parses a two-step chained locator: page.locator().locator()', () => {
    setup();
    const filePath = writeTestFile(
      'chained-locator.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('chained locator', async ({ page }) => {
  await page.locator('.parent').locator('.child').click();
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(1);

    const node = tc.nodes[0].data;
    expect(node.type).toBe('click');
    if (node.type === 'click') {
      expect(node.locator.kind).toBe('inline');
      if (node.locator.kind === 'inline') {
        expect(node.locator.chain).toBeDefined();
        expect(node.locator.chain).toHaveLength(2);
        expect(node.locator.chain![0]).toEqual({ strategy: 'locator', value: '.parent' });
        expect(node.locator.chain![1]).toEqual({ strategy: 'locator', value: '.child' });
        // Backward compat: strategy/value hold the first step
        expect(node.locator.strategy).toBe('locator');
        expect(node.locator.value).toBe('.parent');
      }
    }
  });

  it('parses a chained locator with mixed strategies: getByRole().getByText()', () => {
    setup();
    const filePath = writeTestFile(
      'chained-mixed.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('chained mixed strategies', async ({ page }) => {
  await page.getByRole('list').getByText('item').click();
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(1);

    const node = tc.nodes[0].data;
    expect(node.type).toBe('click');
    if (node.type === 'click' && node.locator.kind === 'inline') {
      expect(node.locator.chain).toHaveLength(2);
      expect(node.locator.chain![0].strategy).toBe('getByRole');
      expect(node.locator.chain![1]).toEqual({ strategy: 'getByText', value: 'item' });
    }
  });

  it('parses a three-step chained locator', () => {
    setup();
    const filePath = writeTestFile(
      'chained-three.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('three-step chain', async ({ page }) => {
  await page.locator('a').locator('b').locator('c').click();
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(1);

    const node = tc.nodes[0].data;
    expect(node.type).toBe('click');
    if (node.type === 'click' && node.locator.kind === 'inline') {
      expect(node.locator.chain).toHaveLength(3);
      expect(node.locator.chain![0]).toEqual({ strategy: 'locator', value: 'a' });
      expect(node.locator.chain![1]).toEqual({ strategy: 'locator', value: 'b' });
      expect(node.locator.chain![2]).toEqual({ strategy: 'locator', value: 'c' });
    }
  });

  it('single-step locator has no chain field', () => {
    setup();
    const filePath = writeTestFile(
      'single-step.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('single step', async ({ page }) => {
  await page.locator('.btn').click();
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    const node = tc.nodes[0].data;
    expect(node.type).toBe('click');
    if (node.type === 'click' && node.locator.kind === 'inline') {
      expect(node.locator.chain).toBeUndefined();
      expect(node.locator.strategy).toBe('locator');
      expect(node.locator.value).toBe('.btn');
    }
  });

  it('parses chained locator with fill action', () => {
    setup();
    const filePath = writeTestFile(
      'chained-fill.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('chained fill', async ({ page }) => {
  await page.locator('.form').getByLabel('Email').fill('test@example.com');
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(1);

    const node = tc.nodes[0].data;
    expect(node.type).toBe('fill');
    if (node.type === 'fill' && node.locator.kind === 'inline') {
      expect(node.locator.chain).toHaveLength(2);
      expect(node.locator.chain![0]).toEqual({ strategy: 'locator', value: '.form' });
      expect(node.locator.chain![1]).toEqual({ strategy: 'getByLabel', value: 'Email' });
      expect(node.value).toBe('test@example.com');
    }
  });

  it('parses chained locator inside expect assertion', () => {
    setup();
    const filePath = writeTestFile(
      'chained-expect.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('chained expect', async ({ page }) => {
  await expect(page.locator('.container').getByText('Welcome')).toBeVisible();
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(1);

    const node = tc.nodes[0].data;
    expect(node.type).toBe('assertVisible');
    if (node.type === 'assertVisible' && node.locator.kind === 'inline') {
      expect(node.locator.chain).toHaveLength(2);
      expect(node.locator.chain![0]).toEqual({ strategy: 'locator', value: '.container' });
      expect(node.locator.chain![1]).toEqual({ strategy: 'getByText', value: 'Welcome' });
    }
  });

  // ─── Frame Locators (TICKET-014) ─────────────────────────────────────

  it('parses page.frameLocator().locator() into frame step + locator step', () => {
    setup();
    const filePath = writeTestFile(
      'frame-locator.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('frame locator', async ({ page }) => {
  await page.frameLocator('#iframe').locator('.btn').click();
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(1);

    const actionNode = tc.nodes[0];
    expect(actionNode.data.type).toBe('click');
    // Frame locators are separated to top-level frameLocators array
    expect(actionNode.frameLocators).toBeDefined();
    expect(actionNode.frameLocators).toEqual(['#iframe']);
    // The remaining locator is the inner step
    if (actionNode.data.type === 'click' && actionNode.data.locator.kind === 'inline') {
      expect(actionNode.data.locator.strategy).toBe('locator');
      expect(actionNode.data.locator.value).toBe('.btn');
    }
  });

  it('parses nested frame locators: page.frameLocator().frameLocator().locator()', () => {
    setup();
    const filePath = writeTestFile(
      'nested-frame-locator.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('nested frame locator', async ({ page }) => {
  await page.frameLocator('#outer').frameLocator('#inner').locator('.btn').click();
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(1);

    const actionNode = tc.nodes[0];
    expect(actionNode.data.type).toBe('click');
    expect(actionNode.frameLocators).toBeDefined();
    expect(actionNode.frameLocators).toEqual(['#outer', '#inner']);
    if (actionNode.data.type === 'click' && actionNode.data.locator.kind === 'inline') {
      expect(actionNode.data.locator.strategy).toBe('locator');
      expect(actionNode.data.locator.value).toBe('.btn');
    }
  });

  it('parses page.frameLocator().getByRole() with non-css inner locator', () => {
    setup();
    const filePath = writeTestFile(
      'frame-getbyrole.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('frame getByRole', async ({ page }) => {
  await page.frameLocator('#iframe').getByRole('button', { name: 'Submit' }).click();
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(1);

    const actionNode = tc.nodes[0];
    expect(actionNode.data.type).toBe('click');
    expect(actionNode.frameLocators).toBeDefined();
    expect(actionNode.frameLocators).toEqual(['#iframe']);
    if (actionNode.data.type === 'click' && actionNode.data.locator.kind === 'inline') {
      expect(actionNode.data.locator.strategy).toBe('getByRole');
    }
  });

  it('parses frame locator inside expect assertion', () => {
    setup();
    const filePath = writeTestFile(
      'frame-expect.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('frame expect', async ({ page }) => {
  await expect(page.frameLocator('#iframe').locator('.msg')).toBeVisible();
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(1);

    const actionNode = tc.nodes[0];
    expect(actionNode.data.type).toBe('assertVisible');
    expect(actionNode.frameLocators).toBeDefined();
    expect(actionNode.frameLocators).toEqual(['#iframe']);
    if (actionNode.data.type === 'assertVisible' && actionNode.data.locator.kind === 'inline') {
      expect(actionNode.data.locator.strategy).toBe('locator');
      expect(actionNode.data.locator.value).toBe('.msg');
    }
  });

  // ─── Extended Assertion Types (TICKET-008) ────────────────────────────

  it('parses expect(locator).toHaveCount(n) as assertCount', () => {
    setup();
    const filePath = writeTestFile(
      'assert-count.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('assert count', async ({ page }) => {
  await expect(page.locator('.item')).toHaveCount(5);
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(1);

    const node = tc.nodes[0].data;
    expect(node.type).toBe('assertCount');
    if (node.type === 'assertCount') {
      expect(node.expected).toBe(5);
      expect(node.locator.kind).toBe('inline');
      if (node.locator.kind === 'inline') {
        expect(node.locator.strategy).toBe('locator');
        expect(node.locator.value).toBe('.item');
      }
    }
  });

  it('parses expect(page).toHaveURL(url) as assertURL', () => {
    setup();
    const filePath = writeTestFile(
      'assert-url.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('assert url', async ({ page }) => {
  await expect(page).toHaveURL('https://example.com/dashboard');
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(1);

    const node = tc.nodes[0].data;
    expect(node.type).toBe('assertURL');
    if (node.type === 'assertURL') {
      expect(node.expected).toBe('https://example.com/dashboard');
    }
  });

  it('parses expect(page).toHaveTitle(title) as assertTitle', () => {
    setup();
    const filePath = writeTestFile(
      'assert-title.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('assert title', async ({ page }) => {
  await expect(page).toHaveTitle('My App');
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(1);

    const node = tc.nodes[0].data;
    expect(node.type).toBe('assertTitle');
    if (node.type === 'assertTitle') {
      expect(node.expected).toBe('My App');
    }
  });

  it('parses expect(page).toHaveURL(/regex/) as assertURL with isRegex', () => {
    setup();
    const filePath = writeTestFile(
      'assert-url-regex.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('assert url regex', async ({ page }) => {
  await expect(page).toHaveURL(/\\/dashboard/);
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(1);

    const node = tc.nodes[0].data;
    expect(node.type).toBe('assertURL');
    if (node.type === 'assertURL') {
      expect(node.expected).toBe('/\\/dashboard/');
      expect(node.isRegex).toBe(true);
    }
  });

  it('parses expect(page).toHaveTitle(/regex/) as assertTitle with isRegex', () => {
    setup();
    const filePath = writeTestFile(
      'assert-title-regex.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('assert title regex', async ({ page }) => {
  await expect(page).toHaveTitle(/My App.*/i);
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(1);

    const node = tc.nodes[0].data;
    expect(node.type).toBe('assertTitle');
    if (node.type === 'assertTitle') {
      expect(node.expected).toBe('/My App.*/i');
      expect(node.isRegex).toBe(true);
    }
  });

  it('parses expect(page).toHaveScreenshot() as assertScreenshot', () => {
    setup();
    const filePath = writeTestFile(
      'assert-screenshot.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('assert screenshot', async ({ page }) => {
  await expect(page).toHaveScreenshot();
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(1);

    const node = tc.nodes[0].data;
    expect(node.type).toBe('assertScreenshot');
  });

  it('parses expect(page).toHaveScreenshot(name) with name', () => {
    setup();
    const filePath = writeTestFile(
      'assert-screenshot-name.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('assert screenshot named', async ({ page }) => {
  await expect(page).toHaveScreenshot('landing.png');
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(1);

    const node = tc.nodes[0].data;
    expect(node.type).toBe('assertScreenshot');
    if (node.type === 'assertScreenshot') {
      expect(node.name).toBe('landing.png');
    }
  });

  it('parses expect(page).toHaveScreenshot(name, { fullPage: true })', () => {
    setup();
    const filePath = writeTestFile(
      'assert-screenshot-fullpage.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('assert screenshot full page', async ({ page }) => {
  await expect(page).toHaveScreenshot('full.png', { fullPage: true });
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(1);

    const node = tc.nodes[0].data;
    expect(node.type).toBe('assertScreenshot');
    if (node.type === 'assertScreenshot') {
      expect(node.name).toBe('full.png');
      expect(node.fullPage).toBe(true);
    }
  });

  it('parses expect(page).not.toHaveURL(/regex/) with negation', () => {
    setup();
    const filePath = writeTestFile(
      'assert-url-regex-negated.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('negated regex url', async ({ page }) => {
  await expect(page).not.toHaveURL(/\\/login/);
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(1);

    const node = tc.nodes[0].data;
    expect(node.type).toBe('assertURL');
    if (node.type === 'assertURL') {
      expect(node.expected).toBe('/\\/login/');
      expect(node.isRegex).toBe(true);
      expect(node.negated).toBe(true);
    }
  });

  it('parses expect(page).toHaveURL(string) without isRegex flag', () => {
    setup();
    const filePath = writeTestFile(
      'assert-url-string.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('string url', async ({ page }) => {
  await expect(page).toHaveURL('https://example.com');
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(1);

    const node = tc.nodes[0].data;
    expect(node.type).toBe('assertURL');
    if (node.type === 'assertURL') {
      expect(node.expected).toBe('https://example.com');
      expect(node.isRegex).toBeUndefined();
    }
  });

  it('parses expect(locator).toHaveAttribute(name, value) as assertAttribute', () => {
    setup();
    const filePath = writeTestFile(
      'assert-attr.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('assert attribute', async ({ page }) => {
  await expect(page.locator('a')).toHaveAttribute('href', '/about');
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(1);

    const node = tc.nodes[0].data;
    expect(node.type).toBe('assertAttribute');
    if (node.type === 'assertAttribute') {
      expect(node.attributeName).toBe('href');
      expect(node.expected).toBe('/about');
      expect(node.locator.kind).toBe('inline');
    }
  });

  it('parses expect(locator).toBeEnabled() as assertEnabled', () => {
    setup();
    const filePath = writeTestFile(
      'assert-enabled.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('assert enabled', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Submit' })).toBeEnabled();
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(1);

    const node = tc.nodes[0].data;
    expect(node.type).toBe('assertEnabled');
    if (node.type === 'assertEnabled') {
      expect(node.locator.kind).toBe('inline');
      if (node.locator.kind === 'inline') {
        expect(node.locator.strategy).toBe('getByRole');
      }
    }
  });

  it('parses expect(locator).toBeChecked() as assertChecked', () => {
    setup();
    const filePath = writeTestFile(
      'assert-checked.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('assert checked', async ({ page }) => {
  await expect(page.getByLabel('Accept terms')).toBeChecked();
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(1);

    const node = tc.nodes[0].data;
    expect(node.type).toBe('assertChecked');
    if (node.type === 'assertChecked') {
      expect(node.locator.kind).toBe('inline');
      if (node.locator.kind === 'inline') {
        expect(node.locator.strategy).toBe('getByLabel');
        expect(node.locator.value).toBe('Accept terms');
      }
    }
  });

  it('parses negated new assertion types', () => {
    setup();
    const filePath = writeTestFile(
      'negated-new-asserts.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('negated assertions', async ({ page }) => {
  await expect(page.locator('.item')).not.toHaveCount(0);
  await expect(page).not.toHaveURL('https://example.com/login');
  await expect(page.getByRole('button')).not.toBeEnabled();
  await expect(page.locator('input')).not.toBeChecked();
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(4);

    const countNode = tc.nodes[0].data;
    expect(countNode.type).toBe('assertCount');
    if (countNode.type === 'assertCount') {
      expect(countNode.negated).toBe(true);
      expect(countNode.expected).toBe(0);
    }

    const urlNode = tc.nodes[1].data;
    expect(urlNode.type).toBe('assertURL');
    if (urlNode.type === 'assertURL') {
      expect(urlNode.negated).toBe(true);
    }

    const enabledNode = tc.nodes[2].data;
    expect(enabledNode.type).toBe('assertEnabled');
    if (enabledNode.type === 'assertEnabled') {
      expect(enabledNode.negated).toBe(true);
    }

    const checkedNode = tc.nodes[3].data;
    expect(checkedNode.type).toBe('assertChecked');
    if (checkedNode.type === 'assertChecked') {
      expect(checkedNode.negated).toBe(true);
    }
  });

  it('parses toHaveValue, toHaveClass, toBeDisabled, toBeHidden assertions', () => {
    setup();
    const filePath = writeTestFile(
      'more-asserts.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('more assertions', async ({ page }) => {
  await expect(page.locator('input')).toHaveValue('hello');
  await expect(page.locator('.btn')).toHaveClass('primary active');
  await expect(page.locator('button')).toBeDisabled();
  await expect(page.locator('.modal')).toBeHidden();
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(4);

    expect(tc.nodes[0].data.type).toBe('assertValue');
    if (tc.nodes[0].data.type === 'assertValue') {
      expect(tc.nodes[0].data.expected).toBe('hello');
    }

    expect(tc.nodes[1].data.type).toBe('assertClass');
    if (tc.nodes[1].data.type === 'assertClass') {
      expect(tc.nodes[1].data.expected).toBe('primary active');
    }

    expect(tc.nodes[2].data.type).toBe('assertDisabled');
    expect(tc.nodes[3].data.type).toBe('assertHidden');
  });

  // TICKET-018: beforeAll / afterAll hooks
  it('parses test.beforeAll hook', () => {
    setup();
    const filePath = writeTestFile(
      'beforeall.spec.ts',
      `import { test, expect } from '@playwright/test';
test.describe('Suite', () => {
  test.beforeAll(async () => {
    await page.goto('/setup');
  });
  test('example', async ({ page }) => {
    await page.click('button');
  });
});`
    );

    const flow = parseTestFile(filePath);
    expect(flow.beforeAll).toBeDefined();
    expect(flow.beforeAll).toHaveLength(1);
    expect(flow.beforeAll![0].data.type).toBe('navigate');
  });

  it('parses test.afterAll hook', () => {
    setup();
    const filePath = writeTestFile(
      'afterall.spec.ts',
      `import { test, expect } from '@playwright/test';
test.describe('Suite', () => {
  test.afterAll(async () => {
    await page.goto('/teardown');
  });
  test('example', async ({ page }) => {
    await page.click('button');
  });
});`
    );

    const flow = parseTestFile(filePath);
    expect(flow.afterAll).toBeDefined();
    expect(flow.afterAll).toHaveLength(1);
    expect(flow.afterAll![0].data.type).toBe('navigate');
  });

  it('parses multiple beforeAll hooks', () => {
    setup();
    const filePath = writeTestFile(
      'multi-beforeall.spec.ts',
      `import { test, expect } from '@playwright/test';
test.describe('Suite', () => {
  test.beforeAll(async () => {
    await page.goto('/setup1');
  });
  test.beforeAll(async () => {
    await page.goto('/setup2');
  });
  test('example', async ({ page }) => {
    await page.click('button');
  });
});`
    );

    const flow = parseTestFile(filePath);
    expect(flow.beforeAll).toBeDefined();
    expect(flow.beforeAll).toHaveLength(2);
  });

  it('parses all four hook types', () => {
    setup();
    const filePath = writeTestFile(
      'all-hooks.spec.ts',
      `import { test, expect } from '@playwright/test';
test.describe('Suite', () => {
  test.beforeAll(async () => {
    await page.goto('/before-all');
  });
  test.beforeEach(async ({ page }) => {
    await page.goto('/before-each');
  });
  test.afterEach(async ({ page }) => {
    await page.goto('/after-each');
  });
  test.afterAll(async () => {
    await page.goto('/after-all');
  });
  test('example', async ({ page }) => {
    await page.click('button');
  });
});`
    );

    const flow = parseTestFile(filePath);
    expect(flow.beforeAll).toBeDefined();
    expect(flow.beforeAll).toHaveLength(1);
    expect(flow.beforeEach).toBeDefined();
    expect(flow.beforeEach).toHaveLength(1);
    expect(flow.afterEach).toBeDefined();
    expect(flow.afterEach).toHaveLength(1);
    expect(flow.afterAll).toBeDefined();
    expect(flow.afterAll).toHaveLength(1);
  });

  // TICKET-013: Locator Filters (.filter, .nth, .first, .last)
  it('parses .filter({ hasText }) modifier', () => {
    setup();
    const filePath = writeTestFile(
      'filter-hastext.spec.ts',
      `import { test, expect } from '@playwright/test';
test.describe('Suite', () => {
  test('filter test', async ({ page }) => {
    await page.locator('tr').filter({ hasText: 'John' }).click();
  });
});`
    );

    const flow = parseTestFile(filePath);
    const node = flow.tests[0].nodes[0];
    expect(node.data.type).toBe('click');
    if (node.data.type === 'click' && node.data.locator.kind === 'inline') {
      expect(node.data.locator.modifiers).toBeDefined();
      expect(node.data.locator.modifiers).toHaveLength(1);
      expect(node.data.locator.modifiers![0].kind).toBe('filter');
      expect(node.data.locator.modifiers![0].hasText).toBe('John');
    }
  });

  it('parses .nth() modifier', () => {
    setup();
    const filePath = writeTestFile(
      'nth.spec.ts',
      `import { test, expect } from '@playwright/test';
test.describe('Suite', () => {
  test('nth test', async ({ page }) => {
    await page.locator('li').nth(2).click();
  });
});`
    );

    const flow = parseTestFile(filePath);
    const node = flow.tests[0].nodes[0];
    expect(node.data.type).toBe('click');
    if (node.data.type === 'click' && node.data.locator.kind === 'inline') {
      expect(node.data.locator.modifiers).toBeDefined();
      expect(node.data.locator.modifiers).toHaveLength(1);
      expect(node.data.locator.modifiers![0].kind).toBe('nth');
      expect(node.data.locator.modifiers![0].index).toBe(2);
    }
  });

  it('parses .first() and .last() modifiers', () => {
    setup();
    const filePath = writeTestFile(
      'first-last.spec.ts',
      `import { test, expect } from '@playwright/test';
test.describe('Suite', () => {
  test('first last test', async ({ page }) => {
    await page.locator('li').first().click();
    await page.locator('li').last().click();
  });
});`
    );

    const flow = parseTestFile(filePath);
    const n1 = flow.tests[0].nodes[0];
    const n2 = flow.tests[0].nodes[1];
    expect(n1.data.type).toBe('click');
    if (n1.data.type === 'click' && n1.data.locator.kind === 'inline') {
      expect(n1.data.locator.modifiers).toHaveLength(1);
      expect(n1.data.locator.modifiers![0].kind).toBe('first');
    }
    if (n2.data.type === 'click' && n2.data.locator.kind === 'inline') {
      expect(n2.data.locator.modifiers).toHaveLength(1);
      expect(n2.data.locator.modifiers![0].kind).toBe('last');
    }
  });

  it('parses chained locator with filter: getByRole().filter().getByRole()', () => {
    setup();
    const filePath = writeTestFile(
      'chain-filter.spec.ts',
      `import { test, expect } from '@playwright/test';
test.describe('Suite', () => {
  test('chain filter test', async ({ page }) => {
    await page.getByRole('row').filter({ hasText: 'John' }).getByRole('button').click();
  });
});`
    );

    const flow = parseTestFile(filePath);
    const node = flow.tests[0].nodes[0];
    expect(node.data.type).toBe('click');
    if (node.data.type === 'click' && node.data.locator.kind === 'inline') {
      expect(node.data.locator.chain).toBeDefined();
      expect(node.data.locator.chain).toHaveLength(2);
      // First step should have filter modifier
      expect(node.data.locator.chain![0].modifiers).toHaveLength(1);
      expect(node.data.locator.chain![0].modifiers![0].kind).toBe('filter');
      expect(node.data.locator.chain![0].modifiers![0].hasText).toBe('John');
      // Second step is getByRole('button')
      expect(node.data.locator.chain![1].strategy).toBe('getByRole');
    }
  });

  // TICKET-017: Nested Describe Blocks
  it('parses nested test.describe blocks', () => {
    setup();
    const filePath = writeTestFile(
      'nested-describe.spec.ts',
      `import { test, expect } from '@playwright/test';
test.describe('Outer', () => {
  test('outer test', async ({ page }) => {
    await page.goto('/outer');
  });
  test.describe('Inner', () => {
    test('inner test', async ({ page }) => {
      await page.goto('/inner');
    });
  });
});`
    );

    const flow = parseTestFile(filePath);
    expect(flow.describe).toBe('Outer');
    expect(flow.tests).toHaveLength(1);
    expect(flow.tests[0].name).toBe('outer test');
    expect(flow.children).toBeDefined();
    expect(flow.children).toHaveLength(1);
    expect(flow.children![0].name).toBe('Inner');
    expect(flow.children![0].tests).toHaveLength(1);
    expect(flow.children![0].tests[0].name).toBe('inner test');
  });

  it('parses 3 levels of nested describes', () => {
    setup();
    const filePath = writeTestFile(
      'deep-nested.spec.ts',
      `import { test, expect } from '@playwright/test';
test.describe('Level 1', () => {
  test.describe('Level 2', () => {
    test.describe('Level 3', () => {
      test('deep test', async ({ page }) => {
        await page.goto('/deep');
      });
    });
  });
});`
    );

    const flow = parseTestFile(filePath);
    expect(flow.children).toHaveLength(1);
    expect(flow.children![0].name).toBe('Level 2');
    expect(flow.children![0].children).toHaveLength(1);
    expect(flow.children![0].children![0].name).toBe('Level 3');
    expect(flow.children![0].children![0].tests).toHaveLength(1);
    expect(flow.children![0].children![0].tests[0].name).toBe('deep test');
  });

  it('nested describe with its own beforeEach retains hook at correct level', () => {
    setup();
    const filePath = writeTestFile(
      'nested-hooks.spec.ts',
      `import { test, expect } from '@playwright/test';
test.describe('Outer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/outer-setup');
  });
  test.describe('Inner', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/inner-setup');
    });
    test('inner test', async ({ page }) => {
      await page.click('button');
    });
  });
  test('outer test', async ({ page }) => {
    await page.click('a');
  });
});`
    );

    const flow = parseTestFile(filePath);
    // Outer has its own beforeEach
    expect(flow.beforeEach).toBeDefined();
    expect(flow.beforeEach).toHaveLength(1);

    // Inner describe has its own beforeEach, not the outer one
    expect(flow.children).toHaveLength(1);
    const inner = flow.children![0];
    expect(inner.beforeEach).toBeDefined();
    expect(inner.beforeEach).toHaveLength(1);
    expect(inner.tests).toHaveLength(1);
    expect(inner.tests[0].name).toBe('inner test');
  });

  // ─── Network Route Interception ─────────────────────────────────────

  it('parses page.route with route.fulfill({ json: [...] })', () => {
    setup();
    const filePath = writeTestFile(
      'route-fulfill.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('API mocking', () => {
  test('mock users', async ({ page }) => {
    await page.route('**/api/users', route => route.fulfill({ json: [{ id: 1 }] }));
    await page.goto('/users');
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(2);

    const routeNode = tc.nodes[0];
    expect(routeNode.data.type).toBe('networkRoute');
    if (routeNode.data.type === 'networkRoute') {
      expect(routeNode.data.urlPattern).toBe('**/api/users');
      expect(routeNode.data.handlerAction).toBe('fulfill');
      expect(routeNode.data.fulfillOptions).toBeDefined();
      expect(routeNode.data.fulfillOptions!.json).toBe('[{ id: 1 }]');
    }
  });

  it('parses page.route with route.abort()', () => {
    setup();
    const filePath = writeTestFile(
      'route-abort.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Blocking', () => {
  test('block requests', async ({ page }) => {
    await page.route('**/api/data', route => route.abort());
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(1);

    const routeNode = tc.nodes[0];
    expect(routeNode.data.type).toBe('networkRoute');
    if (routeNode.data.type === 'networkRoute') {
      expect(routeNode.data.urlPattern).toBe('**/api/data');
      expect(routeNode.data.handlerAction).toBe('abort');
      expect(routeNode.data.abortReason).toBeUndefined();
    }
  });

  it('parses page.route with route.abort(reason)', () => {
    setup();
    const filePath = writeTestFile(
      'route-abort-reason.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Blocking', () => {
  test('block requests', async ({ page }) => {
    await page.route('**/api/data', route => route.abort('blockedbyclient'));
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    const routeNode = tc.nodes[0];
    expect(routeNode.data.type).toBe('networkRoute');
    if (routeNode.data.type === 'networkRoute') {
      expect(routeNode.data.handlerAction).toBe('abort');
      expect(routeNode.data.abortReason).toBe('blockedbyclient');
    }
  });

  it('parses page.route with route.continue()', () => {
    setup();
    const filePath = writeTestFile(
      'route-continue.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Passthrough', () => {
  test('continue requests', async ({ page }) => {
    await page.route('**/api/data', route => route.continue());
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    const routeNode = tc.nodes[0];
    expect(routeNode.data.type).toBe('networkRoute');
    if (routeNode.data.type === 'networkRoute') {
      expect(routeNode.data.urlPattern).toBe('**/api/data');
      expect(routeNode.data.handlerAction).toBe('continue');
    }
  });

  it('parses page.route with route.continue({ headers: { ... } })', () => {
    setup();
    const filePath = writeTestFile(
      'route-continue-override.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Override', () => {
  test('override headers', async ({ page }) => {
    await page.route('**/api/data', async route => {
      await route.continue({ headers: { 'X-Custom': 'value' } });
    });
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    const routeNode = tc.nodes[0];
    expect(routeNode.data.type).toBe('networkRoute');
    if (routeNode.data.type === 'networkRoute') {
      expect(routeNode.data.handlerAction).toBe('continue');
      expect(routeNode.data.continueOverrides).toBeDefined();
      expect(routeNode.data.continueOverrides!.headers).toEqual({ 'X-Custom': 'value' });
    }
  });

  it('parses page.route with RegExp pattern', () => {
    setup();
    const filePath = writeTestFile(
      'route-regex.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Regex route', () => {
  test('regex pattern', async ({ page }) => {
    await page.route(/\\/api\\/users/, route => route.fulfill({ json: [] }));
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    const routeNode = tc.nodes[0];
    expect(routeNode.data.type).toBe('networkRoute');
    if (routeNode.data.type === 'networkRoute') {
      expect(routeNode.data.urlPattern).toContain('api');
      expect(routeNode.data.urlPattern).toContain('users');
      expect(routeNode.data.handlerAction).toBe('fulfill');
    }
  });

  it('parses page.route with fulfill status and contentType', () => {
    setup();
    const filePath = writeTestFile(
      'route-fulfill-options.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Fulfill options', () => {
  test('with status', async ({ page }) => {
    await page.route('**/api/data', route => route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' }));
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    const routeNode = tc.nodes[0];
    expect(routeNode.data.type).toBe('networkRoute');
    if (routeNode.data.type === 'networkRoute') {
      expect(routeNode.data.fulfillOptions!.status).toBe(404);
      expect(routeNode.data.fulfillOptions!.contentType).toBe('text/plain');
      expect(routeNode.data.fulfillOptions!.body).toBe('Not found');
    }
  });

  // ─── API Request Parsing ─────────────────────────────────────────────

  it('parses request.get with result variable', () => {
    setup();
    const filePath = writeTestFile(
      'api-get.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('api get', async ({ request }) => {
  const response = await request.get('/api/users');
});
`,
    );

    const flow = parseTestFile(filePath);
    expect(flow.tests).toHaveLength(1);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(1);

    const node = tc.nodes[0];
    expect(node.data.type).toBe('apiRequest');
    if (node.data.type === 'apiRequest') {
      expect(node.data.method).toBe('GET');
      expect(node.data.url).toBe('/api/users');
      expect(node.data.resultVariable).toBe('response');
    }
  });

  it('parses request.post with data body', () => {
    setup();
    const filePath = writeTestFile(
      'api-post.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('api post', async ({ request }) => {
  await request.post('/api/users', { data: { name: 'John' } });
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(1);

    const node = tc.nodes[0];
    expect(node.data.type).toBe('apiRequest');
    if (node.data.type === 'apiRequest') {
      expect(node.data.method).toBe('POST');
      expect(node.data.url).toBe('/api/users');
      expect(node.data.body).toBe("{ name: 'John' }");
    }
  });

  it('parses request.put with headers and data', () => {
    setup();
    const filePath = writeTestFile(
      'api-put.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('api put', async ({ request }) => {
  await request.put('/api/users/1', { headers: { 'X-Token': 'abc' }, data: { name: 'Jane' } });
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    const node = tc.nodes[0];
    expect(node.data.type).toBe('apiRequest');
    if (node.data.type === 'apiRequest') {
      expect(node.data.method).toBe('PUT');
      expect(node.data.url).toBe('/api/users/1');
      expect(node.data.headers).toEqual({ 'X-Token': 'abc' });
      expect(node.data.body).toBe("{ name: 'Jane' }");
    }
  });

  it('parses request.delete', () => {
    setup();
    const filePath = writeTestFile(
      'api-delete.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('api delete', async ({ request }) => {
  await request.delete('/api/users/1');
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    const node = tc.nodes[0];
    expect(node.data.type).toBe('apiRequest');
    if (node.data.type === 'apiRequest') {
      expect(node.data.method).toBe('DELETE');
      expect(node.data.url).toBe('/api/users/1');
    }
  });

  it('parses request.patch with data', () => {
    setup();
    const filePath = writeTestFile(
      'api-patch.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('api patch', async ({ request }) => {
  await request.patch('/api/users/1', { data: { status: 'active' } });
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    const node = tc.nodes[0];
    expect(node.data.type).toBe('apiRequest');
    if (node.data.type === 'apiRequest') {
      expect(node.data.method).toBe('PATCH');
      expect(node.data.url).toBe('/api/users/1');
      expect(node.data.body).toBe("{ status: 'active' }");
    }
  });

  it('includes request in fixtures when parsing API request tests', () => {
    setup();
    const filePath = writeTestFile(
      'api-fixtures.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('api test', async ({ request }) => {
  const response = await request.get('/api/health');
});
`,
    );

    const flow = parseTestFile(filePath);
    expect(flow.fixtures).toContain('request');
  });

  // ─── File Upload Tests ──────────────────────────────────────────────

  it('parses page.setInputFiles with single file', () => {
    setup();
    const filePath = writeTestFile(
      'upload-single.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('upload single file', async ({ page }) => {
  await page.setInputFiles('#upload', 'path/to/file.pdf');
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(1);
    const node = tc.nodes[0];
    expect(node.data.type).toBe('fileUpload');
    if (node.data.type === 'fileUpload') {
      expect(node.data.selector).toBe('#upload');
      expect(node.data.files).toEqual(['path/to/file.pdf']);
      expect(node.data.locatorMethod).toBeUndefined();
    }
  });

  it('parses page.setInputFiles with multiple files', () => {
    setup();
    const filePath = writeTestFile(
      'upload-multi.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('upload multiple files', async ({ page }) => {
  await page.setInputFiles('#upload', ['file1.pdf', 'file2.pdf']);
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    const node = tc.nodes[0];
    expect(node.data.type).toBe('fileUpload');
    if (node.data.type === 'fileUpload') {
      expect(node.data.selector).toBe('#upload');
      expect(node.data.files).toEqual(['file1.pdf', 'file2.pdf']);
    }
  });

  it('parses page.setInputFiles with empty array (clear)', () => {
    setup();
    const filePath = writeTestFile(
      'upload-clear.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('clear file input', async ({ page }) => {
  await page.setInputFiles('#upload', []);
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    const node = tc.nodes[0];
    expect(node.data.type).toBe('fileUpload');
    if (node.data.type === 'fileUpload') {
      expect(node.data.selector).toBe('#upload');
      expect(node.data.files).toEqual([]);
    }
  });

  it('parses locator-based setInputFiles with single file', () => {
    setup();
    const filePath = writeTestFile(
      'upload-locator.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('upload via locator', async ({ page }) => {
  await page.locator('#upload').setInputFiles('file.pdf');
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    const node = tc.nodes[0];
    expect(node.data.type).toBe('fileUpload');
    if (node.data.type === 'fileUpload') {
      expect(node.data.selector).toBe('#upload');
      expect(node.data.files).toEqual(['file.pdf']);
      expect(node.data.locatorMethod).toBe('locator');
    }
  });

  it('parses locator-based setInputFiles with multiple files', () => {
    setup();
    const filePath = writeTestFile(
      'upload-locator-multi.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('upload multiple via locator', async ({ page }) => {
  await page.locator('input[type="file"]').setInputFiles(['doc1.pdf', 'doc2.pdf']);
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    const node = tc.nodes[0];
    expect(node.data.type).toBe('fileUpload');
    if (node.data.type === 'fileUpload') {
      expect(node.data.selector).toBe('input[type="file"]');
      expect(node.data.files).toEqual(['doc1.pdf', 'doc2.pdf']);
      expect(node.data.locatorMethod).toBe('locator');
    }
  });

  it('parses locator-based setInputFiles with empty array', () => {
    setup();
    const filePath = writeTestFile(
      'upload-locator-clear.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('clear via locator', async ({ page }) => {
  await page.locator('#upload').setInputFiles([]);
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    const node = tc.nodes[0];
    expect(node.data.type).toBe('fileUpload');
    if (node.data.type === 'fileUpload') {
      expect(node.data.selector).toBe('#upload');
      expect(node.data.files).toEqual([]);
      expect(node.data.locatorMethod).toBe('locator');
    }
  });

  it('parses getByLabel-based setInputFiles', () => {
    setup();
    const filePath = writeTestFile(
      'upload-getbylabel.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('upload via getByLabel', async ({ page }) => {
  await page.getByLabel('Upload file').setInputFiles('report.pdf');
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    const node = tc.nodes[0];
    expect(node.data.type).toBe('fileUpload');
    if (node.data.type === 'fileUpload') {
      expect(node.data.selector).toBe('Upload file');
      expect(node.data.files).toEqual(['report.pdf']);
      expect(node.data.locatorMethod).toBe('getByLabel');
    }
  });

  // ─── Dialog Handler Tests ────────────────────────────────────────────

  it('parses page.on("dialog", dialog => dialog.accept())', () => {
    setup();
    const filePath = writeTestFile(
      'dialog-accept.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Dialog tests', () => {
  test('accept dialog', async ({ page }) => {
    page.on('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Delete' }).click();
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(2);

    const dialogNode = tc.nodes[0];
    expect(dialogNode.data.type).toBe('dialogHandler');
    if (dialogNode.data.type === 'dialogHandler') {
      expect(dialogNode.data.action).toBe('accept');
      expect(dialogNode.data.once).toBe(false);
      expect(dialogNode.data.inputText).toBeUndefined();
    }
  });

  it('parses page.once("dialog", dialog => dialog.dismiss())', () => {
    setup();
    const filePath = writeTestFile(
      'dialog-dismiss-once.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Dialog tests', () => {
  test('dismiss dialog once', async ({ page }) => {
    page.once('dialog', dialog => dialog.dismiss());
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(1);

    const dialogNode = tc.nodes[0];
    expect(dialogNode.data.type).toBe('dialogHandler');
    if (dialogNode.data.type === 'dialogHandler') {
      expect(dialogNode.data.action).toBe('dismiss');
      expect(dialogNode.data.once).toBe(true);
    }
  });

  it('parses page.on("dialog", dialog => dialog.accept("my input"))', () => {
    setup();
    const filePath = writeTestFile(
      'dialog-accept-text.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Dialog tests', () => {
  test('accept prompt with text', async ({ page }) => {
    page.on('dialog', dialog => dialog.accept('my input'));
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    const dialogNode = tc.nodes[0];
    expect(dialogNode.data.type).toBe('dialogHandler');
    if (dialogNode.data.type === 'dialogHandler') {
      expect(dialogNode.data.action).toBe('accept');
      expect(dialogNode.data.inputText).toBe('my input');
      expect(dialogNode.data.once).toBe(false);
    }
  });

  it('parses async callback: page.on("dialog", async dialog => { await dialog.accept(); })', () => {
    setup();
    const filePath = writeTestFile(
      'dialog-async.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Dialog tests', () => {
  test('async accept dialog', async ({ page }) => {
    page.on('dialog', async dialog => {
      await dialog.accept();
    });
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    const dialogNode = tc.nodes[0];
    expect(dialogNode.data.type).toBe('dialogHandler');
    if (dialogNode.data.type === 'dialogHandler') {
      expect(dialogNode.data.action).toBe('accept');
      expect(dialogNode.data.once).toBe(false);
    }
  });

  it('parses async callback with input text: page.on("dialog", async (dialog) => { await dialog.accept("text"); })', () => {
    setup();
    const filePath = writeTestFile(
      'dialog-async-text.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Dialog tests', () => {
  test('async accept with text', async ({ page }) => {
    page.on('dialog', async (dialog) => {
      await dialog.accept('hello world');
    });
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    const dialogNode = tc.nodes[0];
    expect(dialogNode.data.type).toBe('dialogHandler');
    if (dialogNode.data.type === 'dialogHandler') {
      expect(dialogNode.data.action).toBe('accept');
      expect(dialogNode.data.inputText).toBe('hello world');
    }
  });

  // ─── New Tab / Multi-Page Tests ───────────────────────────────────

  it('parses Promise.all newTab pattern with context.waitForEvent("page")', () => {
    setup();
    const filePath = writeTestFile(
      'newtab.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Multi-tab test', () => {
  test('opens new tab', async ({ page, context }) => {
    await page.goto('https://example.com');
    const [newPage] = await Promise.all([
      context.waitForEvent('page'),
      page.click('a[target=_blank]')
    ]);
    await newPage.goto('https://other.com');
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    expect(flow.tests).toHaveLength(1);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(3);

    // First node: navigate
    expect(tc.nodes[0].data.type).toBe('navigate');

    // Second node: newTab
    const newTabNode = tc.nodes[1];
    expect(newTabNode.type).toBe('newTab');
    expect(newTabNode.data.type).toBe('newTab');
    if (newTabNode.data.type === 'newTab') {
      expect(newTabNode.data.pageVariable).toBe('newPage');
      expect(newTabNode.data.triggerAction).toBe("page.click('a[target=_blank]')");
      expect(newTabNode.data.triggerSelector).toBe('a[target=_blank]');
      // contextVariable should be undefined when it's the default 'context'
      expect(newTabNode.data.contextVariable).toBeUndefined();
    }
  });

  it('parses simpler page.waitForEvent("popup") pattern', () => {
    setup();
    const filePath = writeTestFile(
      'popup.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Popup test', () => {
  test('opens popup', async ({ page }) => {
    await page.goto('https://example.com');
    const popup = await page.waitForEvent('popup');
    await popup.goto('https://popup.com');
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    expect(flow.tests).toHaveLength(1);
    const tc = flow.tests[0];

    // Should have 3 nodes: navigate, newTab (popup), navigate/codeBlock
    expect(tc.nodes).toHaveLength(3);

    const popupNode = tc.nodes[1];
    expect(popupNode.type).toBe('newTab');
    expect(popupNode.data.type).toBe('newTab');
    if (popupNode.data.type === 'newTab') {
      expect(popupNode.data.pageVariable).toBe('popup');
      expect(popupNode.data.triggerAction).toBe("page.waitForEvent('popup')");
    }
  });

  it('parses Promise.all newTab with custom context variable', () => {
    setup();
    const filePath = writeTestFile(
      'custom-ctx.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Custom context', () => {
  test('opens new tab with custom ctx', async ({ page }) => {
    const [newPage] = await Promise.all([
      browserContext.waitForEvent('page'),
      page.click('#open-link')
    ]);
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(1);

    const newTabNode = tc.nodes[0];
    expect(newTabNode.type).toBe('newTab');
    if (newTabNode.data.type === 'newTab') {
      expect(newTabNode.data.pageVariable).toBe('newPage');
      expect(newTabNode.data.contextVariable).toBe('browserContext');
      expect(newTabNode.data.triggerAction).toBe("page.click('#open-link')");
      expect(newTabNode.data.triggerSelector).toBe('#open-link');
    }
  });

  it('parses multi-tab test where actions alternate between page and newPage', () => {
    setup();
    const filePath = writeTestFile(
      'multi-tab.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Multi-tab', () => {
  test('alternates pages', async ({ page, context }) => {
    await page.goto('https://example.com');
    const [newPage] = await Promise.all([
      context.waitForEvent('page'),
      page.click('a[target=_blank]')
    ]);
    await page.locator('#back-button').click();
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    // 3 nodes: navigate, newTab, click
    expect(tc.nodes).toHaveLength(3);

    // Verify the newTab node is present
    const newTabNode = tc.nodes.find(n => n.data.type === 'newTab');
    expect(newTabNode).toBeDefined();
    if (newTabNode && newTabNode.data.type === 'newTab') {
      expect(newTabNode.data.pageVariable).toBe('newPage');
    }

    // Verify the click action on original page is still parsed
    const clickNode = tc.nodes.find(n => n.data.type === 'click');
    expect(clickNode).toBeDefined();
  });

  // ─── Storage State Tests ───────────────────────────────────────────

  it('parses context.storageState({ path }) as save operation', () => {
    setup();
    const filePath = writeTestFile(
      'storage-save.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Storage tests', () => {
  test('save state', async ({ context }) => {
    await context.storageState({ path: 'auth.json' });
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(1);
    const node = tc.nodes[0];
    expect(node.data.type).toBe('storageState');
    if (node.data.type === 'storageState') {
      expect(node.data.operation).toBe('save');
      expect(node.data.filePath).toBe('auth.json');
    }
  });

  it('parses test.use({ storageState }) as load operation', () => {
    setup();
    const filePath = writeTestFile(
      'storage-load.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Auth tests', () => {
  test.use({ storageState: 'auth.json' });

  test('logged in test', async ({ page }) => {
    await page.goto('/dashboard');
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    // test.use becomes a node at the describe level or a node in the test
    // Depending on parsing, it may appear as a top-level node
    const allNodes = tc.nodes;
    expect(allNodes.length).toBeGreaterThanOrEqual(1);
  });

  it('parses browser.newContext({ storageState }) as load operation', () => {
    setup();
    const filePath = writeTestFile(
      'storage-newcontext.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Context tests', () => {
  test('load state into context', async ({ browser }) => {
    const context = await browser.newContext({ storageState: 'auth.json' });
    const page = await context.newPage();
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    const storageNode = tc.nodes.find(n => n.data.type === 'storageState');
    expect(storageNode).toBeDefined();
    if (storageNode && storageNode.data.type === 'storageState') {
      expect(storageNode.data.operation).toBe('load');
      expect(storageNode.data.filePath).toBe('auth.json');
    }
  });

  // ─── test.step() / Group Tests ─────────────────────────────────────

  it('parses test.step() as a group node with children', () => {
    setup();
    const filePath = writeTestFile(
      'test-step.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Step tests', () => {
  test('grouped actions', async ({ page }) => {
    await test.step('Login', async () => {
      await page.goto('/login');
      await page.locator('#username').fill('admin');
      await page.locator('#password').fill('secret');
      await page.locator('button[type="submit"]').click();
    });
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(1);
    const groupNode = tc.nodes[0];
    expect(groupNode.data.type).toBe('group');
    if (groupNode.data.type === 'group') {
      expect(groupNode.data.stepName).toBe('Login');
      expect(groupNode.data.children).toHaveLength(4);
      expect(groupNode.data.children[0].data.type).toBe('navigate');
      expect(groupNode.data.children[1].data.type).toBe('fill');
      expect(groupNode.data.children[2].data.type).toBe('fill');
      expect(groupNode.data.children[3].data.type).toBe('click');
    }
  });

  it('parses nested test.step() calls', () => {
    setup();
    const filePath = writeTestFile(
      'nested-step.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Nested steps', () => {
  test('multi-level', async ({ page }) => {
    await test.step('Setup', async () => {
      await page.goto('/app');
      await test.step('Fill form', async () => {
        await page.locator('#name').fill('John');
      });
    });
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(1);
    const outerGroup = tc.nodes[0];
    expect(outerGroup.data.type).toBe('group');
    if (outerGroup.data.type === 'group') {
      expect(outerGroup.data.stepName).toBe('Setup');
      expect(outerGroup.data.children).toHaveLength(2);
      // First child: navigate
      expect(outerGroup.data.children[0].data.type).toBe('navigate');
      // Second child: nested group
      const innerGroup = outerGroup.data.children[1];
      expect(innerGroup.data.type).toBe('group');
      if (innerGroup.data.type === 'group') {
        expect(innerGroup.data.stepName).toBe('Fill form');
        expect(innerGroup.data.children).toHaveLength(1);
        expect(innerGroup.data.children[0].data.type).toBe('fill');
      }
    }
  });

  // ─── Variable Tracking Tests ──────────────────────────────────────────

  it('extracts declared variable from const declaration', () => {
    setup();
    const filePath = writeTestFile(
      'var-decl.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('variable declaration', async ({ page, request }) => {
  const response = await request.get('/api/users');
  await page.goto('/home');
});
`,
    );

    const flow = parseTestFile(filePath);
    const nodes = flow.tests[0].nodes;

    // First node: const response = await request.get(...)
    expect(nodes[0].declaredVariables).toEqual([
      expect.objectContaining({ name: 'response' }),
    ]);

    // Second node: await page.goto(...)  — no declarations
    expect(nodes[1].declaredVariables).toBeUndefined();
  });

  it('detects variable usage in a subsequent node', () => {
    setup();
    const filePath = writeTestFile(
      'var-usage.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('variable usage', async ({ page }) => {
  const userId = 'abc123';
  await page.goto('/users/' + userId);
});
`,
    );

    const flow = parseTestFile(filePath);
    const nodes = flow.tests[0].nodes;

    // First node declares userId
    expect(nodes[0].declaredVariables).toEqual([
      expect.objectContaining({ name: 'userId' }),
    ]);

    // Second node uses userId
    expect(nodes[1].usedVariables).toContain('userId');
  });

  it('does not track built-in identifiers like page, test, expect', () => {
    setup();
    const filePath = writeTestFile(
      'builtins.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('builtins are filtered', async ({ page }) => {
  await page.goto('https://example.com');
  await expect(page).toHaveTitle('Example');
});
`,
    );

    const flow = parseTestFile(filePath);
    const nodes = flow.tests[0].nodes;

    // Neither node should have usedVariables containing 'page', 'expect', 'test'
    for (const node of nodes) {
      const used = node.usedVariables ?? [];
      expect(used).not.toContain('page');
      expect(used).not.toContain('expect');
      expect(used).not.toContain('test');
    }
  });

  it('extracts destructured variable declarations', () => {
    setup();
    const filePath = writeTestFile(
      'destructure.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('destructure', async ({ page }) => {
  const { name, age } = { name: 'Alice', age: 30 };
  await page.goto('/users/' + name);
});
`,
    );

    const flow = parseTestFile(filePath);
    const nodes = flow.tests[0].nodes;

    // First node declares name and age
    const declaredNames = (nodes[0].declaredVariables ?? []).map(v => v.name);
    expect(declaredNames).toContain('name');
    expect(declaredNames).toContain('age');
  });

  // ─── Try/Catch/Finally Parsing ────────────────────────────────────────

  it('parses try/catch with variable into tryCatch node', () => {
    setup();
    const filePath = writeTestFile(
      'try-catch.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('try catch', async ({ page }) => {
  try {
    await page.goto('https://example.com');
  } catch (e) {
    await page.screenshot();
  }
});
`,
    );

    const flow = parseTestFile(filePath);
    const nodes = flow.tests[0].nodes;
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe('tryCatch');
    expect(nodes[0].data.type).toBe('tryCatch');

    const data = nodes[0].data as any;
    expect(data.tryChildren).toHaveLength(1);
    expect(data.tryChildren[0].data.type).toBe('navigate');
    expect(data.catchVariable).toBe('e');
    expect(data.catchChildren).toHaveLength(1);
    expect(data.catchChildren[0].data.type).toBe('screenshot');
    expect(data.finallyChildren).toBeUndefined();
  });

  it('parses try/finally (no catch) into tryCatch node', () => {
    setup();
    const filePath = writeTestFile(
      'try-finally.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('try finally', async ({ page }) => {
  try {
    await page.goto('https://example.com');
  } finally {
    await page.screenshot();
  }
});
`,
    );

    const flow = parseTestFile(filePath);
    const nodes = flow.tests[0].nodes;
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe('tryCatch');

    const data = nodes[0].data as any;
    expect(data.tryChildren).toHaveLength(1);
    expect(data.catchChildren).toBeUndefined();
    expect(data.catchVariable).toBeUndefined();
    expect(data.finallyChildren).toHaveLength(1);
    expect(data.finallyChildren[0].data.type).toBe('screenshot');
  });

  it('parses try/catch without variable', () => {
    setup();
    const filePath = writeTestFile(
      'try-catch-novar.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('try catch no var', async ({ page }) => {
  try {
    await page.goto('https://example.com');
  } catch {
    await page.screenshot();
  }
});
`,
    );

    const flow = parseTestFile(filePath);
    const nodes = flow.tests[0].nodes;
    expect(nodes).toHaveLength(1);

    const data = nodes[0].data as any;
    expect(data.catchVariable).toBeUndefined();
    expect(data.catchChildren).toHaveLength(1);
  });

  it('parses try/catch/finally with all three sections', () => {
    setup();
    const filePath = writeTestFile(
      'try-catch-finally.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('try catch finally', async ({ page }) => {
  try {
    await page.goto('https://example.com');
    await page.getByRole('button', { name: 'Submit' }).click();
  } catch (error) {
    await page.screenshot();
  } finally {
    await page.waitForTimeout(1000);
  }
});
`,
    );

    const flow = parseTestFile(filePath);
    const nodes = flow.tests[0].nodes;
    expect(nodes).toHaveLength(1);

    const data = nodes[0].data as any;
    expect(data.tryChildren).toHaveLength(2);
    expect(data.tryChildren[0].data.type).toBe('navigate');
    expect(data.tryChildren[1].data.type).toBe('click');
    expect(data.catchVariable).toBe('error');
    expect(data.catchChildren).toHaveLength(1);
    expect(data.finallyChildren).toHaveLength(1);
    expect(data.finallyChildren[0].data.type).toBe('wait');
  });

  it('parses child Playwright actions inside try/catch as proper action nodes', () => {
    setup();
    const filePath = writeTestFile(
      'try-catch-actions.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('try catch actions', async ({ page }) => {
  try {
    await page.goto('https://example.com');
    await expect(page).toHaveURL('https://example.com');
  } catch (e) {
    await page.goto('https://fallback.com');
  }
});
`,
    );

    const flow = parseTestFile(filePath);
    const nodes = flow.tests[0].nodes;
    const data = nodes[0].data as any;
    expect(data.tryChildren[0].data.type).toBe('navigate');
    expect(data.tryChildren[1].data.type).toBe('assertURL');
    expect(data.catchChildren[0].data.type).toBe('navigate');
  });

  // ── Soft assertions ──────────────────────────────────────────────────

  it('parses expect.soft(locator).toBeVisible() as assertVisible with soft: true', () => {
    setup();
    const filePath = writeTestFile(
      'soft-visible.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('soft visible', async ({ page }) => {
  await expect.soft(page.locator('h1')).toBeVisible();
});
`,
    );

    const flow = parseTestFile(filePath);
    const node = flow.tests[0].nodes[0].data;
    expect(node.type).toBe('assertVisible');
    if (node.type === 'assertVisible') {
      expect(node.soft).toBe(true);
      expect(node.negated).toBeUndefined();
    }
  });

  it('parses expect.soft(locator).not.toHaveText() as assertText with soft: true and negated: true', () => {
    setup();
    const filePath = writeTestFile(
      'soft-negated-text.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('soft negated text', async ({ page }) => {
  await expect.soft(page.locator('h1')).not.toHaveText('x');
});
`,
    );

    const flow = parseTestFile(filePath);
    const node = flow.tests[0].nodes[0].data;
    expect(node.type).toBe('assertText');
    if (node.type === 'assertText') {
      expect(node.soft).toBe(true);
      expect(node.negated).toBe(true);
    }
  });

  it('parses expect.soft(locator).toHaveText() as assertText with soft: true', () => {
    setup();
    const filePath = writeTestFile(
      'soft-text.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('soft text', async ({ page }) => {
  await expect.soft(page.getByText('heading')).toHaveText('Hello');
});
`,
    );

    const flow = parseTestFile(filePath);
    const node = flow.tests[0].nodes[0].data;
    expect(node.type).toBe('assertText');
    if (node.type === 'assertText') {
      expect(node.soft).toBe(true);
      expect(node.expected).toBe('Hello');
      expect(node.negated).toBeUndefined();
    }
  });

  it('parses expect.soft(locator).not.toBeVisible() with both soft and negated', () => {
    setup();
    const filePath = writeTestFile(
      'soft-negated-visible.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('soft negated visible', async ({ page }) => {
  await expect.soft(page.locator('.banner')).not.toBeVisible();
});
`,
    );

    const flow = parseTestFile(filePath);
    const node = flow.tests[0].nodes[0].data;
    expect(node.type).toBe('assertVisible');
    if (node.type === 'assertVisible') {
      expect(node.soft).toBe(true);
      expect(node.negated).toBe(true);
    }
  });

  it('parses expect.soft(page).toHaveURL() as assertURL with soft: true', () => {
    setup();
    const filePath = writeTestFile(
      'soft-url.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('soft url', async ({ page }) => {
  await expect.soft(page).toHaveURL('https://example.com');
});
`,
    );

    const flow = parseTestFile(filePath);
    const node = flow.tests[0].nodes[0].data;
    expect(node.type).toBe('assertURL');
    if (node.type === 'assertURL') {
      expect(node.soft).toBe(true);
      expect(node.expected).toBe('https://example.com');
    }
  });

  it('non-soft assertions do not have soft field set', () => {
    setup();
    const filePath = writeTestFile(
      'non-soft.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('non soft', async ({ page }) => {
  await expect(page.locator('h1')).toBeVisible();
});
`,
    );

    const flow = parseTestFile(filePath);
    const node = flow.tests[0].nodes[0].data;
    expect(node.type).toBe('assertVisible');
    if (node.type === 'assertVisible') {
      expect(node.soft).toBeUndefined();
    }
  });
});

describe('parseTestFile - annotations and tags', () => {
  it('parses test.slow() annotation from test body', () => {
    setup();
    const filePath = writeTestFile(
      'slow.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Suite', () => {
  test('slow test', async ({ page }) => {
    test.slow();
    await page.goto('https://example.com');
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    expect(flow.tests).toHaveLength(1);
    expect(flow.tests[0].annotations).toEqual(['slow']);
    // The test.slow() statement should NOT appear as an action node
    expect(flow.tests[0].nodes).toHaveLength(1);
    expect(flow.tests[0].nodes[0].data.type).toBe('navigate');
  });

  it('parses test.fixme() and test.fail() annotations', () => {
    setup();
    const filePath = writeTestFile(
      'multi-annotation.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Suite', () => {
  test('broken test', async ({ page }) => {
    test.fixme();
    test.fail();
    await page.goto('https://example.com');
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    expect(flow.tests[0].annotations).toEqual(['fixme', 'fail']);
  });

  it('parses test.skip() annotation from test body', () => {
    setup();
    const filePath = writeTestFile(
      'skip-annotation.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Suite', () => {
  test('skipped test', async ({ page }) => {
    test.skip();
    await page.goto('https://example.com');
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    expect(flow.tests[0].annotations).toEqual(['skip']);
  });

  it('parses tags from options object with array', () => {
    setup();
    const filePath = writeTestFile(
      'tags-array.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Suite', () => {
  test('tagged test', { tag: ['@smoke', '@regression'] }, async ({ page }) => {
    await page.goto('https://example.com');
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    expect(flow.tests[0].tags).toEqual(['@smoke', '@regression']);
  });

  it('parses tags from options object with single string', () => {
    setup();
    const filePath = writeTestFile(
      'tags-single.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Suite', () => {
  test('tagged test', { tag: '@smoke' }, async ({ page }) => {
    await page.goto('https://example.com');
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    expect(flow.tests[0].tags).toEqual(['@smoke']);
  });

  it('parses both annotations and tags on the same test', () => {
    setup();
    const filePath = writeTestFile(
      'both.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Suite', () => {
  test('annotated and tagged', { tag: ['@smoke'] }, async ({ page }) => {
    test.slow();
    await page.goto('https://example.com');
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    expect(tc.tags).toEqual(['@smoke']);
    expect(tc.annotations).toEqual(['slow']);
  });

  it('does not treat annotation calls with arguments as annotations', () => {
    setup();
    const filePath = writeTestFile(
      'conditional-skip.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Suite', () => {
  test('conditional skip', async ({ page }) => {
    test.skip(true, 'not ready');
    await page.goto('https://example.com');
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    // test.skip(true, 'not ready') has arguments, so it should not be captured as annotation
    expect(flow.tests[0].annotations).toBeUndefined();
  });

  // ── test.use() Fixture Overrides ──────────────────────────────────────

  it('parses test.use({ viewport: { width: 1280, height: 720 } }) with nested object structure', () => {
    setup();
    const filePath = writeTestFile(
      'fixture-viewport.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Responsive tests', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('desktop layout', async ({ page }) => {
    await page.goto('/');
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    expect(flow.fixtureOverrides).toBeDefined();
    expect(flow.fixtureOverrides!.viewport).toBeDefined();
    expect(flow.fixtureOverrides!.viewport.value).toEqual({ width: 1280, height: 720 });
    expect(flow.fixtureOverrides!.viewport.rawSource).toBeUndefined();
  });

  it('parses test.use({ locale, baseURL }) with multiple keys', () => {
    setup();
    const filePath = writeTestFile(
      'fixture-multi.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Localized tests', () => {
  test.use({ locale: 'fr-FR', baseURL: 'http://localhost:3000' });

  test('french page', async ({ page }) => {
    await page.goto('/');
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    expect(flow.fixtureOverrides).toBeDefined();
    expect(flow.fixtureOverrides!.locale.value).toBe('fr-FR');
    expect(flow.fixtureOverrides!.baseURL.value).toBe('http://localhost:3000');
  });

  it('parses test.use() with non-literal expression value and preserves raw source', () => {
    setup();
    const filePath = writeTestFile(
      'fixture-expr.spec.ts',
      `
import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Auth tests', () => {
  test.use({ storageState: path.join(__dirname, 'auth.json') });

  test('logged in', async ({ page }) => {
    await page.goto('/dashboard');
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    expect(flow.fixtureOverrides).toBeDefined();
    expect(flow.fixtureOverrides!.storageState).toBeDefined();
    expect(flow.fixtureOverrides!.storageState.rawSource).toBe("path.join(__dirname, 'auth.json')");
  });

  it('parses test.use() in nested describe blocks', () => {
    setup();
    const filePath = writeTestFile(
      'fixture-nested.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Suite', () => {
  test.describe('Mobile', () => {
    test.use({ viewport: { width: 375, height: 667 } });

    test('mobile layout', async ({ page }) => {
      await page.goto('/');
    });
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    expect(flow.children).toBeDefined();
    expect(flow.children!.length).toBe(1);
    const child = flow.children![0];
    expect(child.fixtureOverrides).toBeDefined();
    expect(child.fixtureOverrides!.viewport.value).toEqual({ width: 375, height: 667 });
  });

  it('merges multiple test.use() calls in the same describe', () => {
    setup();
    const filePath = writeTestFile(
      'fixture-merge.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Multi use', () => {
  test.use({ locale: 'en-US' });
  test.use({ viewport: { width: 800, height: 600 } });

  test('merged config', async ({ page }) => {
    await page.goto('/');
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    expect(flow.fixtureOverrides).toBeDefined();
    expect(flow.fixtureOverrides!.locale.value).toBe('en-US');
    expect(flow.fixtureOverrides!.viewport.value).toEqual({ width: 800, height: 600 });
  });

  it('parses test.use() with boolean and null values', () => {
    setup();
    const filePath = writeTestFile(
      'fixture-boolnull.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Config tests', () => {
  test.use({ javaScriptEnabled: false, storageState: undefined });

  test('no js', async ({ page }) => {
    await page.goto('/');
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    expect(flow.fixtureOverrides).toBeDefined();
    expect(flow.fixtureOverrides!.javaScriptEnabled.value).toBe(false);
  });

  it('parses page.getByAltText and page.getByTitle locator strategies', () => {
    setup();
    const filePath = writeTestFile(
      'alt-title.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('alt text and title locators', () => {
  test('uses getByAltText and getByTitle', async ({ page }) => {
    await page.getByAltText('Company logo').click();
    await page.getByTitle('Close dialog').click();
    await expect(page.getByAltText('Hero image')).toBeVisible();
    await expect(page.getByTitle('Settings menu')).toBeVisible();
  });
});
`,
    );

    const flow = parseTestFile(filePath);

    expect(flow.tests).toHaveLength(1);
    const tc = flow.tests[0];
    expect(tc.nodes).toHaveLength(4);

    // Verify getByAltText click
    const altClick = tc.nodes[0].data;
    expect(altClick.type).toBe('click');
    if (altClick.type === 'click') {
      expect(altClick.locator.kind).toBe('inline');
      if (altClick.locator.kind === 'inline') {
        expect(altClick.locator.strategy).toBe('getByAltText');
        expect(altClick.locator.value).toBe('Company logo');
      }
    }

    // Verify getByTitle click
    const titleClick = tc.nodes[1].data;
    expect(titleClick.type).toBe('click');
    if (titleClick.type === 'click') {
      expect(titleClick.locator.kind).toBe('inline');
      if (titleClick.locator.kind === 'inline') {
        expect(titleClick.locator.strategy).toBe('getByTitle');
        expect(titleClick.locator.value).toBe('Close dialog');
      }
    }

    // Verify getByAltText assertion
    const altAssert = tc.nodes[2].data;
    expect(altAssert.type).toBe('assertVisible');
    if (altAssert.type === 'assertVisible') {
      expect(altAssert.locator.kind).toBe('inline');
      if (altAssert.locator.kind === 'inline') {
        expect(altAssert.locator.strategy).toBe('getByAltText');
        expect(altAssert.locator.value).toBe('Hero image');
      }
    }

    // Verify getByTitle assertion
    const titleAssert = tc.nodes[3].data;
    expect(titleAssert.type).toBe('assertVisible');
    if (titleAssert.type === 'assertVisible') {
      expect(titleAssert.locator.kind).toBe('inline');
      if (titleAssert.locator.kind === 'inline') {
        expect(titleAssert.locator.strategy).toBe('getByTitle');
        expect(titleAssert.locator.value).toBe('Settings menu');
      }
    }
  });
});

describe('iteration parsing', () => {
  it('parses a simple forEach iteration', () => {
    setup();
    const filePath = writeTestFile(
      'foreach.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('forEach test', async ({ page }) => {
  const items = ['a', 'b', 'c'];
  items.forEach((item) => {
    console.log(item);
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    const iterNode = tc.nodes.find(n => n.type === 'iteration');
    expect(iterNode).toBeDefined();
    if (iterNode && iterNode.data.type === 'iteration') {
      expect(iterNode.data.method).toBe('forEach');
      expect(iterNode.data.arrayExpression).toBe('items');
      expect(iterNode.data.callbackParams).toEqual(['item']);
      expect(iterNode.data.isAsync).toBeUndefined();
    }
  });

  it('parses a map with variable assignment', () => {
    setup();
    const filePath = writeTestFile(
      'map.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('map test', async ({ page }) => {
  const urls = ['https://a.com', 'https://b.com'];
  const results = urls.map((url) => {
    return url.toUpperCase();
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    const iterNode = tc.nodes.find(n => n.type === 'iteration');
    expect(iterNode).toBeDefined();
    if (iterNode && iterNode.data.type === 'iteration') {
      expect(iterNode.data.method).toBe('map');
      expect(iterNode.data.arrayExpression).toBe('urls');
      expect(iterNode.data.callbackParams).toEqual(['url']);
      expect(iterNode.data.resultVariable).toBe('results');
    }
  });

  it('parses an async forEach iteration', () => {
    setup();
    const filePath = writeTestFile(
      'async-foreach.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('async forEach', async ({ page }) => {
  const links = ['#a', '#b'];
  links.forEach(async (link) => {
    await page.goto(link);
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    const iterNode = tc.nodes.find(n => n.type === 'iteration');
    expect(iterNode).toBeDefined();
    if (iterNode && iterNode.data.type === 'iteration') {
      expect(iterNode.data.method).toBe('forEach');
      expect(iterNode.data.isAsync).toBe(true);
      expect(iterNode.data.callbackParams).toEqual(['link']);
      expect(iterNode.data.children.length).toBeGreaterThan(0);
    }
  });

  it('does not match Playwright locator .filter() as iteration', () => {
    setup();
    const filePath = writeTestFile(
      'locator-filter.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('locator filter', async ({ page }) => {
  await page.goto('https://example.com');
  const items = page.locator('.item').filter({ hasText: 'hello' });
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    const iterNode = tc.nodes.find(n => n.type === 'iteration');
    expect(iterNode).toBeUndefined();
  });

  it('parses filter with variable assignment', () => {
    setup();
    const filePath = writeTestFile(
      'filter.spec.ts',
      `
import { test, expect } from '@playwright/test';

test('filter test', async ({ page }) => {
  const numbers = [1, 2, 3, 4, 5];
  const evens = numbers.filter((n) => {
    return n % 2 === 0;
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    const iterNode = tc.nodes.find(n => n.type === 'iteration');
    expect(iterNode).toBeDefined();
    if (iterNode && iterNode.data.type === 'iteration') {
      expect(iterNode.data.method).toBe('filter');
      expect(iterNode.data.arrayExpression).toBe('numbers');
      expect(iterNode.data.callbackParams).toEqual(['n']);
      expect(iterNode.data.resultVariable).toBe('evens');
    }
  });

  describe('switch statement parsing', () => {
    it('parses a basic switch statement with cases and default', () => {
      setup();
      const filePath = writeTestFile(
        'switch-basic.spec.ts',
        `
import { test, expect } from '@playwright/test';

test.describe('Switch Suite', () => {
  test('basic switch', async ({ page }) => {
    const status = 'active';
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
`,
      );

      const flow = parseTestFile(filePath);
      const tc = flow.tests[0];
      const switchNode = tc.nodes.find(n => n.type === 'switch');
      expect(switchNode).toBeDefined();
      if (switchNode && switchNode.data.type === 'switch') {
        expect(switchNode.data.expression).toBe('status');
        expect(switchNode.data.cases).toHaveLength(3);
        expect(switchNode.data.cases[0].value).toBe("'active'");
        expect(switchNode.data.cases[0].fallsThrough).toBe(false);
        expect(switchNode.data.cases[0].children).toHaveLength(1);
        expect(switchNode.data.cases[1].value).toBe("'inactive'");
        expect(switchNode.data.cases[1].fallsThrough).toBe(false);
        expect(switchNode.data.cases[2].value).toBeNull();
        expect(switchNode.data.cases[2].fallsThrough).toBe(false);
      }
    });

    it('parses grouped cases (fall-through pattern)', () => {
      setup();
      const filePath = writeTestFile(
        'switch-grouped.spec.ts',
        `
import { test, expect } from '@playwright/test';

test.describe('Switch Suite', () => {
  test('grouped cases', async ({ page }) => {
    const role = 'admin';
    switch (role) {
      case 'admin':
      case 'superadmin':
        await page.goto('https://example.com/admin');
        break;
      case 'user':
        await page.goto('https://example.com/user');
        break;
    }
  });
});
`,
      );

      const flow = parseTestFile(filePath);
      const tc = flow.tests[0];
      const switchNode = tc.nodes.find(n => n.type === 'switch');
      expect(switchNode).toBeDefined();
      if (switchNode && switchNode.data.type === 'switch') {
        expect(switchNode.data.expression).toBe('role');
        expect(switchNode.data.cases).toHaveLength(3);
        // First case falls through (grouped)
        expect(switchNode.data.cases[0].value).toBe("'admin'");
        expect(switchNode.data.cases[0].fallsThrough).toBe(true);
        expect(switchNode.data.cases[0].children).toHaveLength(0);
        // Second case has the body
        expect(switchNode.data.cases[1].value).toBe("'superadmin'");
        expect(switchNode.data.cases[1].fallsThrough).toBe(false);
        expect(switchNode.data.cases[1].children).toHaveLength(1);
        // Third case is standalone
        expect(switchNode.data.cases[2].value).toBe("'user'");
        expect(switchNode.data.cases[2].fallsThrough).toBe(false);
      }
    });

    it('detects fall-through when break is missing', () => {
      setup();
      const filePath = writeTestFile(
        'switch-fallthrough.spec.ts',
        `
import { test, expect } from '@playwright/test';

test.describe('Switch Suite', () => {
  test('fallthrough', async ({ page }) => {
    const x = 1;
    switch (x) {
      case 1:
        await page.goto('https://example.com/one');
      case 2:
        await page.goto('https://example.com/two');
        break;
    }
  });
});
`,
      );

      const flow = parseTestFile(filePath);
      const tc = flow.tests[0];
      const switchNode = tc.nodes.find(n => n.type === 'switch');
      expect(switchNode).toBeDefined();
      if (switchNode && switchNode.data.type === 'switch') {
        expect(switchNode.data.cases[0].fallsThrough).toBe(true);
        expect(switchNode.data.cases[1].fallsThrough).toBe(false);
      }
    });
  });

  describe('custom expect messages', () => {
    it('parses expect with custom message string', () => {
      setup();
      const filePath = writeTestFile(
        'expect-message.spec.ts',
        `
import { test, expect } from '@playwright/test';

test('custom message', async ({ page }) => {
  await expect(page.locator('.btn'), 'Login button should be visible').toBeVisible();
});
`,
      );

      const flow = parseTestFile(filePath);
      const node = flow.tests[0].nodes[0];
      expect(node.data.type).toBe('assertVisible');
      if (node.data.type === 'assertVisible') {
        expect(node.data.message).toBe('Login button should be visible');
      }
    });

    it('parses expect.soft with custom message string', () => {
      setup();
      const filePath = writeTestFile(
        'expect-soft-message.spec.ts',
        `
import { test, expect } from '@playwright/test';

test('soft with message', async ({ page }) => {
  await expect.soft(page.locator('.text'), 'check text').toHaveText('hello');
});
`,
      );

      const flow = parseTestFile(filePath);
      const node = flow.tests[0].nodes[0];
      expect(node.data.type).toBe('assertText');
      if (node.data.type === 'assertText') {
        expect(node.data.soft).toBe(true);
        expect(node.data.message).toBe('check text');
      }
    });

    it('parses expect without message as undefined', () => {
      setup();
      const filePath = writeTestFile(
        'expect-no-message.spec.ts',
        `
import { test, expect } from '@playwright/test';

test('no message', async ({ page }) => {
  await expect(page.locator('.btn')).toBeVisible();
});
`,
      );

      const flow = parseTestFile(filePath);
      const node = flow.tests[0].nodes[0];
      expect(node.data.type).toBe('assertVisible');
      if (node.data.type === 'assertVisible') {
        expect(node.data.message).toBeUndefined();
      }
    });

    it('parses custom message on page-level assertions', () => {
      setup();
      const filePath = writeTestFile(
        'expect-page-message.spec.ts',
        `
import { test, expect } from '@playwright/test';

test('page message', async ({ page }) => {
  await expect(page, 'should be on dashboard').toHaveURL('https://example.com/dashboard');
});
`,
      );

      const flow = parseTestFile(filePath);
      const node = flow.tests[0].nodes[0];
      expect(node.data.type).toBe('assertURL');
      if (node.data.type === 'assertURL') {
        expect(node.data.message).toBe('should be on dashboard');
      }
    });
  });

  it('parses test.describe.parallel() and stores mode: parallel', () => {
    setup();
    const filePath = writeTestFile(
      'parallel.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe.parallel('Parallel Suite', () => {
  test('first test', async ({ page }) => {
    await page.goto('/a');
  });

  test('second test', async ({ page }) => {
    await page.goto('/b');
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    expect(flow.describe).toBe('Parallel Suite');
    expect(flow.describeMode).toBe('parallel');
    expect(flow.tests).toHaveLength(2);
    expect(flow.tests[0].name).toBe('first test');
    expect(flow.tests[1].name).toBe('second test');
  });
});

describe('test.setTimeout()', () => {
  it('parses test.setTimeout() inside a test body', () => {
    const dir = setup();
    const file = path.join(dir, 'timeout.spec.ts');
    fs.writeFileSync(file, `
      import { test, expect } from '@playwright/test';
      test.describe('Suite', () => {
        test('slow test', async ({ page }) => {
          test.setTimeout(60000);
          await page.goto('/slow');
          await expect(page).toHaveTitle('Slow Page');
        });
      });
    `);
    const flow = parseTestFile(file);
    expect(flow.tests).toHaveLength(1);
    expect(flow.tests[0].timeout).toBe(60000);
  });

  it('parses test.setTimeout() at the describe level', () => {
    const dir = setup();
    const file = path.join(dir, 'desc-timeout.spec.ts');
    fs.writeFileSync(file, `
      import { test, expect } from '@playwright/test';
      test.describe('Suite', () => {
        test.setTimeout(30000);
        test('a test', async ({ page }) => {
          await page.goto('/');
        });
      });
    `);
    const flow = parseTestFile(file);
    expect(flow.timeout).toBe(30000);
  });

  it('returns undefined timeout when not set', () => {
    const dir = setup();
    const file = path.join(dir, 'no-timeout.spec.ts');
    fs.writeFileSync(file, `
      import { test, expect } from '@playwright/test';
      test.describe('Suite', () => {
        test('normal test', async ({ page }) => {
          await page.goto('/');
        });
      });
    `);
    const flow = parseTestFile(file);
    expect(flow.timeout).toBeUndefined();
    expect(flow.tests[0].timeout).toBeUndefined();
  });
});

describe('HAR Route', () => {
  it('parses page.routeFromHAR() in playback mode', () => {
    const dir = setup();
    const file = path.join(dir, 'har-playback.spec.ts');
    fs.writeFileSync(file, `
      import { test, expect } from '@playwright/test';
      test.describe('HAR tests', () => {
        test('replay', async ({ page }) => {
          await page.routeFromHAR('tests/data/api.har');
          await page.goto('/');
        });
      });
    `);
    const flow = parseTestFile(file);
    const harNode = flow.tests[0].nodes.find(n => n.data.type === 'harRoute');
    expect(harNode).toBeDefined();
    expect((harNode!.data as any).harFilePath).toBe('tests/data/api.har');
    expect((harNode!.data as any).mode).toBe('playback');
  });

  it('parses page.routeFromHAR() in record mode with options', () => {
    const dir = setup();
    const file = path.join(dir, 'har-record.spec.ts');
    fs.writeFileSync(file, `
      import { test, expect } from '@playwright/test';
      test.describe('HAR tests', () => {
        test('record', async ({ page }) => {
          await page.routeFromHAR('tests/data/api.har', { update: true, url: '**/api/**', notFound: 'abort' });
          await page.goto('/');
        });
      });
    `);
    const flow = parseTestFile(file);
    const harNode = flow.tests[0].nodes.find(n => n.data.type === 'harRoute');
    expect(harNode).toBeDefined();
    expect((harNode!.data as any).mode).toBe('record');
    expect((harNode!.data as any).url).toBe('**/api/**');
    expect((harNode!.data as any).notFound).toBe('abort');
  });
});

describe('External Data Sources', () => {
  it('detects JSON import', () => {
    const dir = setup();
    const file = path.join(dir, 'json-import.spec.ts');
    fs.writeFileSync(file, `
      import { test, expect } from '@playwright/test';
      import testData from './fixtures/data.json';

      test.describe('Data driven', () => {
        test('uses json data', async ({ page }) => {
          await page.goto('/');
        });
      });
    `);
    const flow = parseTestFile(file);
    expect(flow.externalDataSources).toBeDefined();
    expect(flow.externalDataSources).toHaveLength(1);
    expect(flow.externalDataSources![0]).toEqual({
      variableName: 'testData',
      filePath: './fixtures/data.json',
      fileType: 'json',
    });
  });

  it('detects require JSON', () => {
    const dir = setup();
    const file = path.join(dir, 'require-json.spec.ts');
    fs.writeFileSync(file, `
      import { test, expect } from '@playwright/test';
      const data = require('./data/users.json');

      test.describe('Data driven', () => {
        test('uses json data', async ({ page }) => {
          await page.goto('/');
        });
      });
    `);
    const flow = parseTestFile(file);
    expect(flow.externalDataSources).toBeDefined();
    expect(flow.externalDataSources).toHaveLength(1);
    expect(flow.externalDataSources![0]).toEqual({
      variableName: 'data',
      filePath: './data/users.json',
      fileType: 'json',
    });
  });

  it('empty when no data imports', () => {
    const dir = setup();
    const file = path.join(dir, 'no-data.spec.ts');
    fs.writeFileSync(file, `
      import { test, expect } from '@playwright/test';

      test.describe('No data', () => {
        test('basic test', async ({ page }) => {
          await page.goto('/');
        });
      });
    `);
    const flow = parseTestFile(file);
    expect(flow.externalDataSources).toBeUndefined();
  });
});

describe('Inline Data Detection', () => {
  it('detects array of objects', () => {
    setup();
    const file = writeTestFile('inline-data-objects.spec.ts', `
import { test, expect } from '@playwright/test';

test.describe('data tests', () => {
  test('uses inline data', async ({ page }) => {
    const users = [{name: 'Alice', age: 30}, {name: 'Bob', age: 25}];
    await page.goto('/');
  });
});
    `);
    const flow = parseTestFile(file);
    const nodes = flow.tests[0].nodes;
    const dataNode = nodes.find(n => n.data.type === 'inlineData');
    expect(dataNode).toBeDefined();
    expect(dataNode!.data.type).toBe('inlineData');
    const data = dataNode!.data as { type: 'inlineData'; variableName: string; dataType: string; values: unknown[] };
    expect(data.variableName).toBe('users');
    expect(data.dataType).toBe('array-of-objects');
    expect(data.values).toHaveLength(2);
    expect(data.values[0]).toEqual({ name: 'Alice', age: 30 });
    expect(data.values[1]).toEqual({ name: 'Bob', age: 25 });
  });

  it('detects array of primitives', () => {
    setup();
    const file = writeTestFile('inline-data-primitives.spec.ts', `
import { test, expect } from '@playwright/test';

test.describe('data tests', () => {
  test('uses inline numbers', async ({ page }) => {
    const values = [1, 2, 3, 4];
    await page.goto('/');
  });
});
    `);
    const flow = parseTestFile(file);
    const nodes = flow.tests[0].nodes;
    const dataNode = nodes.find(n => n.data.type === 'inlineData');
    expect(dataNode).toBeDefined();
    const data = dataNode!.data as { type: 'inlineData'; variableName: string; dataType: string; values: unknown[] };
    expect(data.variableName).toBe('values');
    expect(data.dataType).toBe('array-of-primitives');
    expect(data.values).toEqual([1, 2, 3, 4]);
  });

  it('detects object', () => {
    setup();
    const file = writeTestFile('inline-data-object.spec.ts', `
import { test, expect } from '@playwright/test';

test.describe('data tests', () => {
  test('uses inline config', async ({ page }) => {
    const config = { retries: 3, timeout: 5000 };
    await page.goto('/');
  });
});
    `);
    const flow = parseTestFile(file);
    const nodes = flow.tests[0].nodes;
    const dataNode = nodes.find(n => n.data.type === 'inlineData');
    expect(dataNode).toBeDefined();
    const data = dataNode!.data as { type: 'inlineData'; variableName: string; dataType: string; values: Record<string, unknown> };
    expect(data.variableName).toBe('config');
    expect(data.dataType).toBe('object');
    expect(data.values).toEqual({ retries: 3, timeout: 5000 });
  });

  it('does not detect non-data variables', () => {
    setup();
    const file = writeTestFile('inline-data-skip.spec.ts', `
import { test, expect } from '@playwright/test';

test.describe('data tests', () => {
  test('should not detect page objects', async ({ page }) => {
    const result = await page.evaluate(() => document.title);
    await page.goto('/');
  });
});
    `);
    const flow = parseTestFile(file);
    const nodes = flow.tests[0].nodes;
    const dataNodes = nodes.filter(n => n.data.type === 'inlineData');
    expect(dataNodes).toHaveLength(0);
  });
});
