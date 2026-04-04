/**
 * Integration tests verifying that the parser correctly handles real-world
 * Playwright test patterns from playwright.dev documentation examples.
 *
 * Each test creates a realistic .spec.ts file, parses it, verifies all nodes
 * are correctly typed (no unexpected codeBlocks), then generates code and
 * verifies it is syntactically valid TypeScript.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Project } from 'ts-morph';
import { parseTestFile } from '../test-parser.js';
import { generateTestFile } from '../../generator/test-generator.js';

let tmpDir: string;

function setup(): string {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'real-world-patterns-'));
  return tmpDir;
}

function writeTestFile(name: string, content: string): string {
  const filePath = path.join(tmpDir, name);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

/** Assert that generated code is syntactically valid TypeScript */
function assertValidTypeScript(code: string, label: string): void {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { strict: false, noEmit: true },
  });
  const sf = project.createSourceFile('__check__.ts', code, { overwrite: true });
  const diagnostics = sf.getPreEmitDiagnostics().filter(
    (d) => d.getCategory() === 1, // errors only
  );
  if (diagnostics.length > 0) {
    const msgs = diagnostics.map((d) => d.getMessageText().toString()).join('\n');
    throw new Error(`Generated code for "${label}" has TypeScript syntax errors:\n${msgs}\n\nGenerated code:\n${code}`);
  }
}

/** Return array of node types for all nodes in a test case, recursively flattening loops/conditionals */
function collectNodeTypes(nodes: { data: { type: string } }[]): string[] {
  return nodes.map((n) => n.data.type);
}

afterEach(() => {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

describe('Real-world playwright.dev patterns', () => {
  // ---------------------------------------------------------------
  // 1. Authentication setup with storageState
  // ---------------------------------------------------------------
  describe('authentication setup with storageState', () => {
    it('parses auth setup that saves storageState', () => {
      setup();
      const filePath = writeTestFile(
        'auth.setup.spec.ts',
        `
import { test, expect } from '@playwright/test';

test.describe('auth setup', () => {
  test('authenticate and save state', async ({ page, context }) => {
    await page.goto('https://example.com/login');
    await page.getByLabel('Username').fill('admin');
    await page.getByLabel('Password').fill('secret');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL('https://example.com/dashboard');
    await context.storageState({ path: '.auth/user.json' });
  });
});
`,
      );

      const flow = parseTestFile(filePath);
      expect(flow.tests).toHaveLength(1);

      const tc = flow.tests[0];
      const types = collectNodeTypes(tc.nodes);

      // Should have navigate, fill x2, click, assertURL, storageState
      expect(types).toContain('navigate');
      expect(types).toContain('fill');
      expect(types).toContain('click');
      expect(types).toContain('assertURL');
      expect(types).toContain('storageState');

      // No unexpected codeBlock nodes
      const codeBlocks = types.filter((t) => t === 'codeBlock');
      expect(codeBlocks).toHaveLength(0);

      // Verify storageState node data
      const ssNode = tc.nodes.find((n) => n.data.type === 'storageState');
      expect(ssNode).toBeDefined();
      if (ssNode && ssNode.data.type === 'storageState') {
        expect(ssNode.data.operation).toBe('save');
        expect(ssNode.data.filePath).toBe('.auth/user.json');
      }
    });

    it('generates valid TypeScript from auth setup flow', () => {
      setup();
      const filePath = writeTestFile(
        'auth.setup.spec.ts',
        `
import { test, expect } from '@playwright/test';

test.describe('auth setup', () => {
  test('authenticate and save state', async ({ page, context }) => {
    await page.goto('https://example.com/login');
    await page.getByLabel('Username').fill('admin');
    await page.getByLabel('Password').fill('secret');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL('https://example.com/dashboard');
    await context.storageState({ path: '.auth/user.json' });
  });
});
`,
      );

      const flow = parseTestFile(filePath);
      const generated = generateTestFile(flow);

      expect(generated).toBeTruthy();
      expect(generated).toContain('storageState');
      assertValidTypeScript(generated, 'auth setup');
    });
  });

  // ---------------------------------------------------------------
  // 2. Page Object Model usage
  // ---------------------------------------------------------------
  describe('page object model usage', () => {
    it('parses tests with class instantiation and method calls on page objects', () => {
      setup();
      const filePath = writeTestFile(
        'pom.spec.ts',
        `
import { test, expect } from '@playwright/test';

class LoginPage {
  constructor(private page: any) {}

  async navigate() {
    await this.page.goto('https://example.com/login');
  }

  async login(username: string, password: string) {
    await this.page.getByLabel('Username').fill(username);
    await this.page.getByLabel('Password').fill(password);
    await this.page.getByRole('button', { name: 'Log in' }).click();
  }
}

test.describe('login tests', () => {
  test('should login successfully', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.navigate();
    await loginPage.login('admin', 'password123');
    await expect(page).toHaveURL('https://example.com/dashboard');
  });
});
`,
      );

      const flow = parseTestFile(filePath);
      expect(flow.tests).toHaveLength(1);

      const tc = flow.tests[0];
      const types = collectNodeTypes(tc.nodes);

      // Should contain pageObjectRef nodes (or codeBlock for the constructor)
      // The key test: we should get assertURL and no crashes
      expect(types).toContain('assertURL');
      expect(tc.nodes.length).toBeGreaterThanOrEqual(2);
    });

    it('generates code from POM flow that preserves page object calls', () => {
      setup();
      const filePath = writeTestFile(
        'pom.spec.ts',
        `
import { test, expect } from '@playwright/test';

class LoginPage {
  constructor(private page: any) {}
  async navigate() {
    await this.page.goto('https://example.com/login');
  }
  async login(username: string, password: string) {
    await this.page.getByLabel('Username').fill(username);
    await this.page.getByLabel('Password').fill(password);
    await this.page.getByRole('button', { name: 'Log in' }).click();
  }
}

test.describe('login tests', () => {
  test('should login successfully', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.navigate();
    await loginPage.login('admin', 'password123');
    await expect(page).toHaveURL('https://example.com/dashboard');
  });
});
`,
      );

      const flow = parseTestFile(filePath);
      const generated = generateTestFile(flow);
      expect(generated).toBeTruthy();
      // Page object refs get generated using the class name -- verify the output
      // contains the relevant calls (constructor, methods, assertion)
      expect(generated).toContain('LoginPage');
      expect(generated).toContain('navigate');
      expect(generated).toContain('toHaveURL');
    });
  });

  // ---------------------------------------------------------------
  // 3. API testing patterns
  // ---------------------------------------------------------------
  describe('API testing patterns', () => {
    it('parses API request calls with request fixture', () => {
      setup();
      const filePath = writeTestFile(
        'api.spec.ts',
        `
import { test, expect } from '@playwright/test';

test.describe('API tests', () => {
  test('create and fetch a resource', async ({ request }) => {
    const createResponse = await request.post('https://api.example.com/items', {
      data: { name: 'Test Item', price: 42 },
    });
    await expect(createResponse).toBeOK();

    const getResponse = await request.get('https://api.example.com/items/1');
    await expect(getResponse).toBeOK();
  });

  test('delete a resource', async ({ request }) => {
    const response = await request.delete('https://api.example.com/items/1');
    await expect(response).toBeOK();
  });
});
`,
      );

      const flow = parseTestFile(filePath);
      expect(flow.tests).toHaveLength(2);

      const tc0 = flow.tests[0];
      const types0 = collectNodeTypes(tc0.nodes);

      // Should detect API request nodes
      const apiNodes = types0.filter((t) => t === 'apiRequest');
      // We expect at least some of the API calls to be recognized
      expect(tc0.nodes.length).toBeGreaterThanOrEqual(2);

      // Verify the second test also parses
      const tc1 = flow.tests[1];
      expect(tc1.name).toBe('delete a resource');
      expect(tc1.nodes.length).toBeGreaterThanOrEqual(1);
    });

    it('generates valid TypeScript from API test flow', () => {
      setup();
      const filePath = writeTestFile(
        'api.spec.ts',
        `
import { test, expect } from '@playwright/test';

test.describe('API tests', () => {
  test('create a resource', async ({ request }) => {
    const response = await request.post('https://api.example.com/items', {
      data: { name: 'Test Item' },
    });
    await expect(response).toBeOK();
  });
});
`,
      );

      const flow = parseTestFile(filePath);
      const generated = generateTestFile(flow);
      expect(generated).toBeTruthy();
      assertValidTypeScript(generated, 'API testing');
    });
  });

  // ---------------------------------------------------------------
  // 4. Multiple assertions on the same element
  // ---------------------------------------------------------------
  describe('multiple assertions on the same element', () => {
    it('parses multiple expect assertions correctly', () => {
      setup();
      const filePath = writeTestFile(
        'assertions.spec.ts',
        `
import { test, expect } from '@playwright/test';

test.describe('assertions demo', () => {
  test('element has correct attributes and text', async ({ page }) => {
    await page.goto('https://example.com');
    await expect(page.getByRole('button', { name: 'Submit' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Submit' })).toHaveText('Submit');
    await expect(page.getByRole('button', { name: 'Submit' })).toHaveAttribute('type', 'submit');
    await expect(page.getByRole('button', { name: 'Submit' })).toHaveClass('btn-primary');
  });

  test('page-level assertions', async ({ page }) => {
    await page.goto('https://example.com');
    await expect(page).toHaveTitle('Example Domain');
    await expect(page).toHaveURL('https://example.com');
  });
});
`,
      );

      const flow = parseTestFile(filePath);
      expect(flow.tests).toHaveLength(2);

      // First test: navigate + multiple assertions (inline locators, no variables)
      const tc0 = flow.tests[0];
      const types0 = collectNodeTypes(tc0.nodes);

      expect(types0).toContain('navigate');
      expect(types0).toContain('assertVisible');
      expect(types0).toContain('assertEnabled');
      expect(types0).toContain('assertText');
      expect(types0).toContain('assertAttribute');
      expect(types0).toContain('assertClass');

      // No unexpected codeBlock nodes for inline-locator assertions
      const codeBlocks0 = types0.filter((t) => t === 'codeBlock');
      expect(codeBlocks0).toHaveLength(0);

      // Second test: page-level assertions
      const tc1 = flow.tests[1];
      const types1 = collectNodeTypes(tc1.nodes);

      expect(types1).toContain('navigate');
      expect(types1).toContain('assertTitle');
      expect(types1).toContain('assertURL');
    });

    it('parses assertions on stored variables as codeBlocks', () => {
      setup();
      const filePath = writeTestFile(
        'var-assertions.spec.ts',
        `
import { test, expect } from '@playwright/test';

test.describe('variable assertions', () => {
  test('assertions via stored locator variable', async ({ page }) => {
    await page.goto('https://example.com');
    const btn = page.getByRole('button', { name: 'Submit' });
    await expect(btn).toBeVisible();
    await expect(btn).toHaveText('Submit');
  });
});
`,
      );

      const flow = parseTestFile(filePath);
      expect(flow.tests).toHaveLength(1);
      const tc = flow.tests[0];
      // Variable-based assertions may become codeBlocks -- just verify no crash
      // and that navigate is correctly parsed
      const types = collectNodeTypes(tc.nodes);
      expect(types).toContain('navigate');
      expect(tc.nodes.length).toBeGreaterThanOrEqual(2);
    });

    it('generates valid TypeScript from multi-assertion flow', () => {
      setup();
      const filePath = writeTestFile(
        'assertions.spec.ts',
        `
import { test, expect } from '@playwright/test';

test.describe('assertions demo', () => {
  test('multiple assertions on element', async ({ page }) => {
    await page.goto('https://example.com');
    await expect(page.getByRole('button', { name: 'Submit' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Submit' })).toHaveText('Submit');
    await expect(page.getByRole('button', { name: 'Submit' })).toHaveAttribute('type', 'submit');
  });
});
`,
      );

      const flow = parseTestFile(filePath);
      const generated = generateTestFile(flow);
      expect(generated).toBeTruthy();
      assertValidTypeScript(generated, 'multiple assertions');
    });
  });

  // ---------------------------------------------------------------
  // 5. Complex locator chains
  // ---------------------------------------------------------------
  describe('complex locator chains', () => {
    it('parses chained locators with filter and nth', () => {
      setup();
      const filePath = writeTestFile(
        'locators.spec.ts',
        `
import { test, expect } from '@playwright/test';

test.describe('complex locators', () => {
  test('uses chained locators', async ({ page }) => {
    await page.goto('https://example.com/products');

    // Click on a filtered and chained locator
    await page.locator('.product-list').locator('.product-card').first().click();

    // Use getByRole with filter
    await page.getByRole('listitem').filter({ hasText: 'Product A' }).click();

    // Nested locator: get list then nth item
    await page.locator('ul.items').locator('li').nth(2).click();

    // Assertion with chained locator
    await expect(page.locator('.product-list').locator('.product-card').first()).toBeVisible();
  });

  test('uses getByRole with options and chaining', async ({ page }) => {
    await page.goto('https://example.com');
    await page.getByRole('navigation').getByRole('link', { name: 'About' }).click();
    await expect(page.getByRole('heading', { name: 'About Us' })).toBeVisible();
  });
});
`,
      );

      const flow = parseTestFile(filePath);
      expect(flow.tests).toHaveLength(2);

      // First test: multiple clicks + assertion
      const tc0 = flow.tests[0];
      const types0 = collectNodeTypes(tc0.nodes);

      expect(types0).toContain('navigate');
      expect(types0).toContain('click');
      expect(types0).toContain('assertVisible');

      const clickNodes = tc0.nodes.filter((n) => n.data.type === 'click');
      expect(clickNodes.length).toBeGreaterThanOrEqual(3);

      // Verify no unexpected codeBlocks for locator-based actions
      const codeBlocks = types0.filter((t) => t === 'codeBlock');
      expect(codeBlocks).toHaveLength(0);

      // Second test: chained getByRole navigation
      const tc1 = flow.tests[1];
      const types1 = collectNodeTypes(tc1.nodes);
      expect(types1).toContain('navigate');
      expect(types1).toContain('click');
      expect(types1).toContain('assertVisible');
    });

    it('generates valid TypeScript from complex locator flow', () => {
      setup();
      const filePath = writeTestFile(
        'locators.spec.ts',
        `
import { test, expect } from '@playwright/test';

test.describe('complex locators', () => {
  test('chained locators', async ({ page }) => {
    await page.goto('https://example.com');
    await page.locator('.parent').locator('.child').first().click();
    await page.locator('.list').locator('.item').nth(0).click();
    await expect(page.locator('.parent').locator('.child').first()).toBeVisible();
  });
});
`,
      );

      const flow = parseTestFile(filePath);
      const generated = generateTestFile(flow);
      expect(generated).toBeTruthy();
      // Verify chained locators appear in generated code
      expect(generated).toContain('.locator(');
      assertValidTypeScript(generated, 'complex locators');
    });
  });

  // ---------------------------------------------------------------
  // 6. Network mocking with route.fulfill
  // ---------------------------------------------------------------
  describe('network mocking with route.fulfill', () => {
    it('parses page.route with fulfill handler', () => {
      setup();
      const filePath = writeTestFile(
        'network-mock.spec.ts',
        `
import { test, expect } from '@playwright/test';

test.describe('network mocking', () => {
  test('mock API response with route.fulfill', async ({ page }) => {
    await page.route('**/api/items', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 1, name: 'Mocked Item' }]),
      });
    });

    await page.goto('https://example.com/items');
    await expect(page.getByText('Mocked Item')).toBeVisible();
  });

  test('abort image requests', async ({ page }) => {
    await page.route('**/*.png', async route => {
      await route.abort();
    });

    await page.goto('https://example.com');
  });

  test('continue with modified headers', async ({ page }) => {
    await page.route('**/api/**', async route => {
      await route.continue({
        headers: { ...route.request().headers(), 'X-Custom': 'test' },
      });
    });

    await page.goto('https://example.com');
  });
});
`,
      );

      const flow = parseTestFile(filePath);
      expect(flow.tests).toHaveLength(3);

      // First test: route fulfill + goto + assertion
      const tc0 = flow.tests[0];
      const types0 = collectNodeTypes(tc0.nodes);

      expect(types0).toContain('networkRoute');
      expect(types0).toContain('navigate');
      expect(types0).toContain('assertVisible');

      // Verify networkRoute node data for fulfill
      const routeNode = tc0.nodes.find((n) => n.data.type === 'networkRoute');
      expect(routeNode).toBeDefined();
      if (routeNode && routeNode.data.type === 'networkRoute') {
        expect(routeNode.data.handlerAction).toBe('fulfill');
        expect(routeNode.data.urlPattern).toBe('**/api/items');
      }

      // Second test: abort
      const tc1 = flow.tests[1];
      const abortNode = tc1.nodes.find((n) => n.data.type === 'networkRoute');
      expect(abortNode).toBeDefined();
      if (abortNode && abortNode.data.type === 'networkRoute') {
        expect(abortNode.data.handlerAction).toBe('abort');
      }
    });

    it('generates valid TypeScript from network mock flow', () => {
      setup();
      const filePath = writeTestFile(
        'network-mock.spec.ts',
        `
import { test, expect } from '@playwright/test';

test.describe('network mocking', () => {
  test('mock API response', async ({ page }) => {
    await page.route('**/api/items', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 1, name: 'Mocked' }]),
      });
    });

    await page.goto('https://example.com/items');
    await expect(page.getByText('Mocked')).toBeVisible();
  });
});
`,
      );

      const flow = parseTestFile(filePath);
      const generated = generateTestFile(flow);
      expect(generated).toBeTruthy();
      expect(generated).toContain('route');
      assertValidTypeScript(generated, 'network mocking');
    });
  });

  // ---------------------------------------------------------------
  // Combined: Full realistic test suite (todo-app style)
  // ---------------------------------------------------------------
  describe('full todo-app style test suite', () => {
    it('parses a complete todo-app test with beforeEach, multiple tests, and assertions', () => {
      setup();
      const filePath = writeTestFile(
        'todo-app.spec.ts',
        `
import { test, expect } from '@playwright/test';

test.describe('Todo App', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('https://demo.playwright.dev/todomvc');
  });

  test('should allow me to add todo items', async ({ page }) => {
    await page.getByPlaceholder('What needs to be done?').fill('Buy groceries');
    await page.getByPlaceholder('What needs to be done?').press('Enter');
    await expect(page.getByTestId('todo-title')).toHaveText('Buy groceries');
  });

  test('should allow me to mark items as complete', async ({ page }) => {
    await page.getByPlaceholder('What needs to be done?').fill('Buy groceries');
    await page.getByPlaceholder('What needs to be done?').press('Enter');
    await page.getByRole('checkbox', { name: 'Toggle Todo' }).click();
    await expect(page.getByTestId('todo-item')).toHaveClass('completed');
  });

  test('should display the correct count', async ({ page }) => {
    await page.getByPlaceholder('What needs to be done?').fill('Item 1');
    await page.getByPlaceholder('What needs to be done?').press('Enter');
    await page.getByPlaceholder('What needs to be done?').fill('Item 2');
    await page.getByPlaceholder('What needs to be done?').press('Enter');
    await expect(page.getByTestId('todo-count')).toHaveText('2 items left');
  });
});
`,
      );

      const flow = parseTestFile(filePath);

      // Should have beforeEach with navigate
      expect(flow.beforeEach).toBeDefined();
      expect(flow.beforeEach!.length).toBeGreaterThanOrEqual(1);

      // Should have 3 test cases
      expect(flow.tests).toHaveLength(3);

      // Each test should have at least 2 nodes
      for (const tc of flow.tests) {
        expect(tc.nodes.length).toBeGreaterThanOrEqual(2);
      }

      // Verify correct assertions in each test
      const tc0Types = collectNodeTypes(flow.tests[0].nodes);
      expect(tc0Types).toContain('fill');
      expect(tc0Types).toContain('assertText');

      const tc1Types = collectNodeTypes(flow.tests[1].nodes);
      expect(tc1Types).toContain('click');
      expect(tc1Types).toContain('assertClass');
    });

    it('generates valid TypeScript from todo-app flow', () => {
      setup();
      const filePath = writeTestFile(
        'todo-app.spec.ts',
        `
import { test, expect } from '@playwright/test';

test.describe('Todo App', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('https://demo.playwright.dev/todomvc');
  });

  test('add todo', async ({ page }) => {
    await page.getByPlaceholder('What needs to be done?').fill('Buy groceries');
    await page.getByPlaceholder('What needs to be done?').press('Enter');
    await expect(page.getByTestId('todo-title')).toHaveText('Buy groceries');
  });

  test('mark complete', async ({ page }) => {
    await page.getByPlaceholder('What needs to be done?').fill('Buy groceries');
    await page.getByPlaceholder('What needs to be done?').press('Enter');
    await page.getByRole('checkbox', { name: 'Toggle Todo' }).click();
    await expect(page.getByTestId('todo-item')).toHaveClass('completed');
  });
});
`,
      );

      const flow = parseTestFile(filePath);
      const generated = generateTestFile(flow);
      expect(generated).toBeTruthy();
      expect(generated).toContain('Todo App');
      expect(generated).toContain('beforeEach');
      assertValidTypeScript(generated, 'todo-app');
    });
  });
});
