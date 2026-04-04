import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parsePageObjectFile, scanPageObjectFiles } from '../page-object-parser.js';

let tmpDir: string;

function setup(): string {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'po-parser-'));
  return tmpDir;
}

function writeTsFile(name: string, content: string): string {
  const filePath = path.join(tmpDir, name);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

afterEach(() => {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

describe('parsePageObjectFile', () => {
  it('parses class with locator property initializers', () => {
    setup();
    const filePath = writeTsFile(
      'login-page.ts',
      `
import { Page, Locator } from '@playwright/test';

export class LoginPage {
  readonly emailInput = this.page.getByLabel('Email');
  readonly passwordInput = this.page.getByLabel('Password');
  readonly submitButton = this.page.getByRole('button', { name: 'Sign in' });
  readonly errorLocator = this.page.locator('.error-message');

  constructor(private page: Page) {}

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }
}
`,
    );

    const po = parsePageObjectFile(filePath);

    expect(po).not.toBeNull();
    expect(po!.name).toBe('LoginPage');

    // Locators
    expect(po!.locators).toHaveLength(4);

    const email = po!.locators.find((l) => l.name === 'emailInput');
    expect(email).toBeDefined();
    expect(email!.strategy).toBe('getByLabel');
    expect(email!.value).toBe('Email');

    const submit = po!.locators.find((l) => l.name === 'submitButton');
    expect(submit).toBeDefined();
    expect(submit!.strategy).toBe('getByRole');

    const errorLoc = po!.locators.find((l) => l.name === 'errorLocator');
    expect(errorLoc).toBeDefined();
    expect(errorLoc!.strategy).toBe('locator');
    expect(errorLoc!.value).toBe('.error-message');

    // Methods
    expect(po!.methods).toHaveLength(1);
    expect(po!.methods[0].name).toBe('login');
    expect(po!.methods[0].parameters).toHaveLength(2);
    expect(po!.methods[0].parameters[0].name).toBe('email');
    expect(po!.methods[0].parameters[1].name).toBe('password');
    expect(po!.methods[0].body).toContain('this.emailInput.fill');
  });

  it('parses class with constructor-assigned locators', () => {
    setup();
    const filePath = writeTsFile(
      'dashboard-page.ts',
      `
import { Page, Locator } from '@playwright/test';

export class DashboardPage {
  heading: Locator;
  logoutBtn: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole('heading', { name: 'Dashboard' });
    this.logoutBtn = page.getByText('Logout');
  }

  async logout() {
    await this.logoutBtn.click();
  }
}
`,
    );

    const po = parsePageObjectFile(filePath);

    expect(po).not.toBeNull();
    expect(po!.name).toBe('DashboardPage');

    expect(po!.locators.length).toBeGreaterThanOrEqual(2);

    const heading = po!.locators.find((l) => l.name === 'heading');
    expect(heading).toBeDefined();
    expect(heading!.strategy).toBe('getByRole');

    const logout = po!.locators.find((l) => l.name === 'logoutBtn');
    expect(logout).toBeDefined();
    expect(logout!.strategy).toBe('getByText');
    expect(logout!.value).toBe('Logout');

    // Methods
    expect(po!.methods).toHaveLength(1);
    expect(po!.methods[0].name).toBe('logout');
  });

  it('extracts methods with parameters and body', () => {
    setup();
    const filePath = writeTsFile(
      'form-page.ts',
      `
import { Page } from '@playwright/test';

export class FormPage {
  constructor(private page: Page) {}

  async fillField(label: string, value: string) {
    await this.page.getByLabel(label).fill(value);
  }

  async submitForm() {
    await this.page.getByRole('button', { name: 'Submit' }).click();
  }

  async waitForSuccess(timeout: number) {
    await this.page.waitForTimeout(timeout);
  }
}
`,
    );

    const po = parsePageObjectFile(filePath);

    expect(po).not.toBeNull();
    expect(po!.methods).toHaveLength(3);

    const fillField = po!.methods.find((m) => m.name === 'fillField');
    expect(fillField).toBeDefined();
    expect(fillField!.parameters).toHaveLength(2);
    expect(fillField!.parameters[0].name).toBe('label');
    expect(fillField!.parameters[1].name).toBe('value');
    expect(fillField!.body).toContain('getByLabel');

    const submitForm = po!.methods.find((m) => m.name === 'submitForm');
    expect(submitForm).toBeDefined();
    expect(submitForm!.parameters).toHaveLength(0);

    const waitMethod = po!.methods.find((m) => m.name === 'waitForSuccess');
    expect(waitMethod).toBeDefined();
    expect(waitMethod!.parameters).toHaveLength(1);
    expect(waitMethod!.parameters[0].name).toBe('timeout');
  });

  it('returns null for files without a recognizable page object class', () => {
    setup();
    const filePath = writeTsFile(
      'utility.ts',
      `
export function formatDate(d: Date): string {
  return d.toISOString();
}

export const API_URL = 'https://example.com';
`,
    );

    const po = parsePageObjectFile(filePath);
    expect(po).toBeNull();
  });

  it('returns null for class without page parameter', () => {
    setup();
    const filePath = writeTsFile(
      'not-a-po.ts',
      `
export class DataHelper {
  constructor(private data: string[]) {}

  getFirst() {
    return this.data[0];
  }
}
`,
    );

    const po = parsePageObjectFile(filePath);
    expect(po).toBeNull();
  });

  it('returns null for non-existent file', () => {
    setup();
    const filePath = path.join(tmpDir, 'does-not-exist.ts');
    const po = parsePageObjectFile(filePath);
    expect(po).toBeNull();
  });
});

describe('scanPageObjectFiles', () => {
  it('scans a directory and returns page objects', () => {
    setup();

    writeTsFile(
      'pages/login.ts',
      `
import { Page } from '@playwright/test';

export class LoginPage {
  readonly emailField = this.page.getByLabel('Email');

  constructor(private page: Page) {}

  async login(email: string) {
    await this.emailField.fill(email);
  }
}
`,
    );

    writeTsFile(
      'pages/dashboard.ts',
      `
import { Page } from '@playwright/test';

export class DashboardPage {
  readonly title = this.page.getByRole('heading', { name: 'Dashboard' });

  constructor(private page: Page) {}
}
`,
    );

    // This file should be skipped (not a page object)
    writeTsFile(
      'pages/helpers.ts',
      `
export function helper() { return 42; }
`,
    );

    const results = scanPageObjectFiles(path.join(tmpDir, 'pages'));

    expect(results).toHaveLength(2);
    const names = results.map((r) => r.name).sort();
    expect(names).toEqual(['DashboardPage', 'LoginPage']);
  });

  it('returns empty array for non-existent directory', () => {
    setup();
    const results = scanPageObjectFiles(path.join(tmpDir, 'nonexistent'));
    expect(results).toEqual([]);
  });

  it('skips node_modules and hidden directories', () => {
    setup();

    writeTsFile(
      'pages/node_modules/some-pkg.ts',
      `
import { Page } from '@playwright/test';
export class HiddenPage {
  constructor(private page: Page) {}
}
`,
    );

    writeTsFile(
      'pages/.hidden/secret.ts',
      `
import { Page } from '@playwright/test';
export class SecretPage {
  constructor(private page: Page) {}
}
`,
    );

    writeTsFile(
      'pages/visible.ts',
      `
import { Page } from '@playwright/test';
export class VisiblePage {
  constructor(private page: Page) {}
}
`,
    );

    const results = scanPageObjectFiles(path.join(tmpDir, 'pages'));
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('VisiblePage');
  });
});
