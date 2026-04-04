import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app.js';
import { scanProject } from '../project-scanner.js';
import type { ProjectInfo } from '../project-scanner.js';

describe('API routes', () => {
  let tmpDir: string;
  let app: Express;
  let projectInfo: ProjectInfo;

  // Keep track of test file IDs for parameterized route tests
  let testFileId: string;
  let pageObjectFileId: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-server-api-test-'));

    // Create playwright.config.ts
    fs.writeFileSync(
      path.join(tmpDir, 'playwright.config.ts'),
      `import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
});
`,
    );

    // Create tests directory with a spec file
    const testsDir = path.join(tmpDir, 'tests');
    fs.mkdirSync(testsDir, { recursive: true });

    fs.writeFileSync(
      path.join(testsDir, 'login.spec.ts'),
      `import { test, expect } from '@playwright/test';

test.describe('Login Tests', () => {
  test('should navigate to login page', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('user@example.com');
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
  });
});
`,
    );

    // Create pages directory with a page object file
    const pagesDir = path.join(tmpDir, 'pages');
    fs.mkdirSync(pagesDir, { recursive: true });

    fs.writeFileSync(
      path.join(pagesDir, 'login.page.ts'),
      `import { type Page, type Locator } from '@playwright/test';

export class LoginPage {
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;

  constructor(private readonly page: Page) {
    this.emailInput = page.getByLabel('Email');
    this.passwordInput = page.getByLabel('Password');
    this.submitButton = page.getByRole('button', { name: 'Sign In' });
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }
}
`,
    );

    // Scan the project and create the app
    projectInfo = scanProject(tmpDir);
    app = createApp(projectInfo);

    // Capture IDs for later tests
    testFileId = projectInfo.testFiles[0].id;
    pageObjectFileId = projectInfo.pageObjectFiles.find(
      (f) => f.fileName === 'login.page.ts',
    )!.id;
  });

  afterAll(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // ── GET /api/config ───────────────────────────────────────────────

  describe('GET /api/config', () => {
    it('returns rootDir, configPath, and config object', async () => {
      const res = await request(app).get('/api/config').expect(200);

      expect(res.body).toHaveProperty('rootDir', path.resolve(tmpDir));
      expect(res.body).toHaveProperty('configPath');
      expect(res.body.configPath).toContain('playwright.config.ts');
      expect(res.body).toHaveProperty('config');
      expect(res.body.config).toHaveProperty('testDir', './tests');
    });
  });

  // ── GET /api/tests ────────────────────────────────────────────────

  describe('GET /api/tests', () => {
    it('returns list of test files with correct count', async () => {
      const res = await request(app).get('/api/tests').expect(200);

      expect(res.body).toHaveProperty('files');
      expect(res.body).toHaveProperty('total');
      expect(res.body.total).toBe(1);
      expect(res.body.files).toHaveLength(1);
      expect(res.body.files[0]).toHaveProperty('fileName', 'login.spec.ts');
      expect(res.body.files[0]).toHaveProperty('filePath');
      expect(res.body.files[0]).toHaveProperty('id');
    });
  });

  // ── GET /api/tests/:id ────────────────────────────────────────────

  describe('GET /api/tests/:id', () => {
    it('returns parsed TestFlow with nodes and edges', async () => {
      const res = await request(app)
        .get(`/api/tests/${testFileId}`)
        .expect(200);

      expect(res.body).toHaveProperty('id', testFileId);
      expect(res.body).toHaveProperty('describe', 'Login Tests');
      expect(res.body).toHaveProperty('tests');
      expect(res.body.tests).toHaveLength(1);

      const testCase = res.body.tests[0];
      expect(testCase).toHaveProperty('name', 'should navigate to login page');
      expect(testCase).toHaveProperty('nodes');
      expect(testCase.nodes.length).toBeGreaterThan(0);
      expect(testCase).toHaveProperty('edges');

      // Verify nodes have expected structure
      const firstNode = testCase.nodes[0];
      expect(firstNode).toHaveProperty('id');
      expect(firstNode).toHaveProperty('type');
      expect(firstNode).toHaveProperty('position');
      expect(firstNode).toHaveProperty('data');

      // Verify imports
      expect(res.body).toHaveProperty('imports');
      expect(res.body.imports.length).toBeGreaterThan(0);

      // Verify metadata
      expect(res.body).toHaveProperty('metadata');
      expect(res.body.metadata).toHaveProperty('contentHash');
    });

    it('returns 404 for unknown test id', async () => {
      const res = await request(app)
        .get('/api/tests/nonexistent-id')
        .expect(404);

      expect(res.body).toHaveProperty('error', 'Test file not found');
    });
  });

  // ── PUT /api/tests/:id ────────────────────────────────────────────

  describe('PUT /api/tests/:id', () => {
    it('saves and returns updated TestFlow', async () => {
      // First, get the current flow
      const getRes = await request(app)
        .get(`/api/tests/${testFileId}`)
        .expect(200);

      const flow = getRes.body;

      // Send it back (round-trip test)
      const putRes = await request(app)
        .put(`/api/tests/${testFileId}`)
        .send(flow)
        .set('Content-Type', 'application/json')
        .expect(200);

      // Should return a valid TestFlow
      expect(putRes.body).toHaveProperty('id', testFileId);
      expect(putRes.body).toHaveProperty('describe');
      expect(putRes.body).toHaveProperty('tests');
      expect(putRes.body).toHaveProperty('metadata');
      expect(putRes.body.metadata).toHaveProperty('contentHash');
    });

    it('returns 404 for unknown test id', async () => {
      const res = await request(app)
        .put('/api/tests/nonexistent-id')
        .send({})
        .set('Content-Type', 'application/json')
        .expect(404);

      expect(res.body).toHaveProperty('error', 'Test file not found');
    });
  });

  // ── GET /api/page-objects ─────────────────────────────────────────

  describe('GET /api/page-objects', () => {
    it('returns list of page objects', async () => {
      const res = await request(app).get('/api/page-objects').expect(200);

      expect(res.body).toHaveProperty('files');
      expect(res.body).toHaveProperty('total');
      expect(res.body.total).toBeGreaterThanOrEqual(1);

      const loginPo = res.body.files.find(
        (f: any) => f.fileName === 'login.page.ts',
      );
      expect(loginPo).toBeDefined();
      expect(loginPo).toHaveProperty('name', 'LoginPage');
      expect(loginPo).toHaveProperty('locatorCount');
      expect(loginPo.locatorCount).toBeGreaterThanOrEqual(1);
      expect(loginPo).toHaveProperty('methodCount');
      expect(loginPo.methodCount).toBeGreaterThanOrEqual(1);
    });
  });

  // ── GET /api/page-objects/:id ─────────────────────────────────────

  describe('GET /api/page-objects/:id', () => {
    it('returns parsed page object with locators and methods', async () => {
      const res = await request(app)
        .get(`/api/page-objects/${pageObjectFileId}`)
        .expect(200);

      expect(res.body).toHaveProperty('id', pageObjectFileId);
      expect(res.body).toHaveProperty('name', 'LoginPage');

      // Locators
      expect(res.body).toHaveProperty('locators');
      expect(res.body.locators.length).toBeGreaterThanOrEqual(3);
      const locatorNames = res.body.locators.map((l: any) => l.name);
      expect(locatorNames).toContain('emailInput');
      expect(locatorNames).toContain('passwordInput');
      expect(locatorNames).toContain('submitButton');

      // Each locator should have strategy and value
      for (const loc of res.body.locators) {
        expect(loc).toHaveProperty('strategy');
        expect(loc).toHaveProperty('value');
      }

      // Methods
      expect(res.body).toHaveProperty('methods');
      expect(res.body.methods.length).toBeGreaterThanOrEqual(1);
      const methodNames = res.body.methods.map((m: any) => m.name);
      expect(methodNames).toContain('login');

      const loginMethod = res.body.methods.find(
        (m: any) => m.name === 'login',
      );
      expect(loginMethod.parameters).toHaveLength(2);
      expect(loginMethod).toHaveProperty('body');
    });

    it('returns 404 for unknown page object id', async () => {
      const res = await request(app)
        .get('/api/page-objects/nonexistent-id')
        .expect(404);

      expect(res.body).toHaveProperty('error', 'Page object file not found');
    });
  });

  // ── GET /api/runner/status ────────────────────────────────────────

  describe('GET /api/runner/status', () => {
    it('returns { running: false } when no tests are running', async () => {
      const res = await request(app).get('/api/runner/status').expect(200);

      expect(res.body).toEqual({ running: false });
    });
  });
});
