import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EnvManager, maskValue } from '../services/env-manager.js';
import type { ProjectInfo } from '../project-scanner.js';

function createTmpProject(): { tmpDir: string; projectInfo: ProjectInfo } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-env-test-'));

  // Create tests directory with a spec file that uses env vars
  const testsDir = path.join(tmpDir, 'tests');
  fs.mkdirSync(testsDir, { recursive: true });

  fs.writeFileSync(
    path.join(testsDir, 'login.spec.ts'),
    `import { test } from '@playwright/test';
test('login', async ({ page }) => {
  await page.goto(process.env.BASE_URL + '/login');
  const key = process.env.API_KEY;
});
`,
  );

  fs.writeFileSync(
    path.join(testsDir, 'api.spec.ts'),
    `import { test } from '@playwright/test';
const { AUTH_TOKEN, BASE_URL } = process.env;
test('api call', async ({ request }) => {
  await request.get(BASE_URL + '/api');
});
`,
  );

  const projectInfo: ProjectInfo = {
    rootDir: tmpDir,
    configPath: null,
    config: { testDir: './tests' },
    testFiles: [
      {
        id: 'login',
        filePath: 'tests/login.spec.ts',
        fileName: 'login.spec.ts',
        directory: 'tests',
        size: 100,
        lastModified: Date.now(),
      },
      {
        id: 'api',
        filePath: 'tests/api.spec.ts',
        fileName: 'api.spec.ts',
        directory: 'tests',
        size: 100,
        lastModified: Date.now(),
      },
    ],
    pageObjectFiles: [],
  };

  return { tmpDir, projectInfo };
}

describe('EnvManager', () => {
  let tmpDir: string;
  let projectInfo: ProjectInfo;
  let envManager: EnvManager;

  beforeEach(() => {
    const result = createTmpProject();
    tmpDir = result.tmpDir;
    projectInfo = result.projectInfo;
    envManager = new EnvManager(projectInfo);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('discoverEnvVars', () => {
    it('finds env vars across test files', () => {
      const vars = envManager.discoverEnvVars();
      const names = vars.map((v) => v.name);
      expect(names).toContain('BASE_URL');
      expect(names).toContain('API_KEY');
      expect(names).toContain('AUTH_TOKEN');
    });

    it('tracks which files reference each var', () => {
      const vars = envManager.discoverEnvVars();
      const baseUrl = vars.find((v) => v.name === 'BASE_URL')!;
      expect(baseUrl.referencedIn).toHaveLength(2);
      expect(baseUrl.referencedIn).toContain('tests/login.spec.ts');
      expect(baseUrl.referencedIn).toContain('tests/api.spec.ts');
    });
  });

  describe('loadDotEnv', () => {
    it('returns empty object when no .env file', () => {
      expect(envManager.loadDotEnv()).toEqual({});
    });

    it('parses KEY=VALUE lines', () => {
      fs.writeFileSync(
        path.join(tmpDir, '.env'),
        'BASE_URL=http://localhost:3000\nAPI_KEY=secret123\n',
      );
      expect(envManager.loadDotEnv()).toEqual({
        BASE_URL: 'http://localhost:3000',
        API_KEY: 'secret123',
      });
    });

    it('handles quoted values and comments', () => {
      fs.writeFileSync(
        path.join(tmpDir, '.env'),
        `# This is a comment
BASE_URL="http://localhost:3000"
API_KEY='my-secret'

# Another comment
`,
      );
      expect(envManager.loadDotEnv()).toEqual({
        BASE_URL: 'http://localhost:3000',
        API_KEY: 'my-secret',
      });
    });
  });

  describe('overrides', () => {
    it('returns empty when no overrides file', () => {
      expect(envManager.loadOverrides()).toEqual({});
    });

    it('saves and loads overrides', () => {
      envManager.saveOverrides({ BASE_URL: 'http://test.com' });
      expect(envManager.loadOverrides()).toEqual({ BASE_URL: 'http://test.com' });
    });

    it('updateOverrides merges with existing', () => {
      envManager.saveOverrides({ BASE_URL: 'http://test.com' });
      envManager.updateOverrides({ API_KEY: 'key123' });
      expect(envManager.loadOverrides()).toEqual({
        BASE_URL: 'http://test.com',
        API_KEY: 'key123',
      });
    });

    it('updateOverrides removes empty string values', () => {
      envManager.saveOverrides({ BASE_URL: 'http://test.com', API_KEY: 'key' });
      envManager.updateOverrides({ API_KEY: '' });
      expect(envManager.loadOverrides()).toEqual({ BASE_URL: 'http://test.com' });
    });
  });

  describe('getEnvVars', () => {
    it('returns discovered vars with merged values', () => {
      fs.writeFileSync(path.join(tmpDir, '.env'), 'BASE_URL=http://localhost\n');
      envManager.saveOverrides({ API_KEY: 'override-key' });

      const vars = envManager.getEnvVars(false);
      const baseUrl = vars.find((v) => v.name === 'BASE_URL')!;
      const apiKey = vars.find((v) => v.name === 'API_KEY')!;

      expect(baseUrl.value).toBe('http://localhost');
      expect(baseUrl.source).toBe('dotenv');
      expect(apiKey.value).toBe('override-key');
      expect(apiKey.source).toBe('override');
    });

    it('masks values by default', () => {
      fs.writeFileSync(path.join(tmpDir, '.env'), 'BASE_URL=http://localhost\n');
      const vars = envManager.getEnvVars(true);
      const baseUrl = vars.find((v) => v.name === 'BASE_URL')!;
      expect(baseUrl.value).not.toBe('http://localhost');
      expect(baseUrl.value).toMatch(/^h\*+t$/);
    });

    it('override takes priority over dotenv', () => {
      fs.writeFileSync(path.join(tmpDir, '.env'), 'BASE_URL=http://from-dotenv\n');
      envManager.saveOverrides({ BASE_URL: 'http://from-override' });

      const vars = envManager.getEnvVars(false);
      const baseUrl = vars.find((v) => v.name === 'BASE_URL')!;
      expect(baseUrl.value).toBe('http://from-override');
      expect(baseUrl.source).toBe('override');
    });
  });
});

describe('maskValue', () => {
  it('masks empty string', () => {
    expect(maskValue('')).toBe('');
  });

  it('fully masks short values', () => {
    expect(maskValue('ab')).toBe('**');
    expect(maskValue('abc')).toBe('***');
  });

  it('shows first and last char for longer values', () => {
    expect(maskValue('secret')).toBe('s****t');
    expect(maskValue('hello')).toBe('h***o');
  });
});
