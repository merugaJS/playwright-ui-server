import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import { scanProject } from '../project-scanner.js';

describe('scanProject', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  function createTmpProject() {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-server-test-'));
    return tmpDir;
  }

  it('discovers playwright.config.ts', () => {
    const dir = createTmpProject();
    fs.writeFileSync(
      path.join(dir, 'playwright.config.ts'),
      `import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
});
`,
    );
    fs.mkdirSync(path.join(dir, 'tests'), { recursive: true });

    const info = scanProject(dir);

    expect(info.configPath).toBe(path.join(dir, 'playwright.config.ts'));
    expect(info.config.testDir).toBe('./tests');
  });

  it('discovers .spec.ts test files', () => {
    const dir = createTmpProject();
    // Config pointing to tests/
    fs.writeFileSync(
      path.join(dir, 'playwright.config.ts'),
      `import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests' });
`,
    );

    const testsDir = path.join(dir, 'tests');
    fs.mkdirSync(testsDir, { recursive: true });

    fs.writeFileSync(
      path.join(testsDir, 'login.spec.ts'),
      `import { test, expect } from '@playwright/test';
test.describe('Login', () => {
  test('should login', async ({ page }) => {
    await page.goto('/login');
  });
});
`,
    );

    fs.writeFileSync(
      path.join(testsDir, 'dashboard.spec.ts'),
      `import { test, expect } from '@playwright/test';
test.describe('Dashboard', () => {
  test('should load', async ({ page }) => {
    await page.goto('/dashboard');
  });
});
`,
    );

    // Non-test file should be ignored
    fs.writeFileSync(path.join(testsDir, 'helpers.ts'), 'export const foo = 1;');

    const info = scanProject(dir);

    expect(info.testFiles).toHaveLength(2);
    const fileNames = info.testFiles.map((f) => f.fileName).sort();
    expect(fileNames).toEqual(['dashboard.spec.ts', 'login.spec.ts']);
  });

  it('discovers page object files in pages/ directory', () => {
    const dir = createTmpProject();
    fs.writeFileSync(
      path.join(dir, 'playwright.config.ts'),
      `import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests' });
`,
    );

    fs.mkdirSync(path.join(dir, 'tests'), { recursive: true });

    // Create pages/ dir with a page object
    const pagesDir = path.join(dir, 'pages');
    fs.mkdirSync(pagesDir, { recursive: true });
    fs.writeFileSync(
      path.join(pagesDir, 'login.page.ts'),
      `import { type Page, type Locator } from '@playwright/test';
export class LoginPage {
  readonly emailInput: Locator;

  constructor(private readonly page: Page) {
    this.emailInput = page.getByLabel('Email');
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
  }
}
`,
    );

    const info = scanProject(dir);

    expect(info.pageObjectFiles.length).toBeGreaterThanOrEqual(1);
    const poFileNames = info.pageObjectFiles.map((f) => f.fileName);
    expect(poFileNames).toContain('login.page.ts');
  });

  it('returns correct relative paths', () => {
    const dir = createTmpProject();
    fs.writeFileSync(
      path.join(dir, 'playwright.config.ts'),
      `import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests' });
`,
    );

    const testsDir = path.join(dir, 'tests');
    fs.mkdirSync(testsDir, { recursive: true });
    fs.writeFileSync(
      path.join(testsDir, 'example.spec.ts'),
      `import { test, expect } from '@playwright/test';
test.describe('Example', () => {
  test('works', async ({ page }) => {
    await page.goto('/');
  });
});
`,
    );

    const info = scanProject(dir);

    expect(info.rootDir).toBe(path.resolve(dir));
    expect(info.testFiles).toHaveLength(1);

    // filePath should be relative to rootDir
    const testFile = info.testFiles[0];
    expect(testFile.filePath).toBe(path.join('tests', 'example.spec.ts'));
    expect(testFile.fileName).toBe('example.spec.ts');
    expect(testFile.directory).toBe('tests');

    // id should be base64url of the relative path
    const expectedId = Buffer.from(testFile.filePath).toString('base64url');
    expect(testFile.id).toBe(expectedId);
  });

  it('returns default config when no playwright.config.ts exists', () => {
    const dir = createTmpProject();
    // Create a tests dir but no config
    fs.mkdirSync(path.join(dir, 'tests'), { recursive: true });

    const info = scanProject(dir);

    expect(info.configPath).toBeNull();
    expect(info.config.testDir).toBe('./tests');
  });
});
