import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parsePlaywrightConfig } from '../config-parser.js';

let tmpDir: string;

function setup(): string {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-parser-'));
  return tmpDir;
}

function writeConfigFile(name: string, content: string): string {
  const filePath = path.join(tmpDir, name);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

afterEach(() => {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

describe('parsePlaywrightConfig', () => {
  it('parses defineConfig with testDir and baseURL', () => {
    setup();
    const filePath = writeConfigFile(
      'playwright.config.ts',
      `
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:3000',
  },
});
`,
    );

    const config = parsePlaywrightConfig(filePath);

    expect(config.testDir).toBe('./e2e');
    expect(config.baseURL).toBe('http://localhost:3000');
  });

  it('parses projects array', () => {
    setup();
    const filePath = writeConfigFile(
      'playwright.config.ts',
      `
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  projects: [
    { name: 'chromium', testDir: './tests/chromium' },
    { name: 'firefox' },
    { name: 'webkit', testDir: './tests/webkit' },
  ],
});
`,
    );

    const config = parsePlaywrightConfig(filePath);

    expect(config.projects).toBeDefined();
    expect(config.projects).toHaveLength(3);
    expect(config.projects![0]).toEqual({ name: 'chromium', testDir: './tests/chromium' });
    expect(config.projects![1]).toEqual({ name: 'firefox', testDir: undefined });
    expect(config.projects![2]).toEqual({ name: 'webkit', testDir: './tests/webkit' });
  });

  it('returns defaults when config has no recognizable structure', () => {
    setup();
    const filePath = writeConfigFile(
      'playwright.config.ts',
      `
// empty config
const x = 42;
export default x;
`,
    );

    const config = parsePlaywrightConfig(filePath);
    expect(config.testDir).toBe('./tests');
  });

  it('parses timeout and outputDir', () => {
    setup();
    const filePath = writeConfigFile(
      'playwright.config.ts',
      `
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  outputDir: './test-results',
});
`,
    );

    const config = parsePlaywrightConfig(filePath);

    expect(config.timeout).toBe(30000);
    expect(config.outputDir).toBe('./test-results');
  });

  it('parses testMatch as a string', () => {
    setup();
    const filePath = writeConfigFile(
      'playwright.config.ts',
      `
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.e2e.ts',
});
`,
    );

    const config = parsePlaywrightConfig(filePath);
    expect(config.testMatch).toBe('**/*.e2e.ts');
  });

  it('parses testMatch as an array', () => {
    setup();
    const filePath = writeConfigFile(
      'playwright.config.ts',
      `
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: ['**/*.spec.ts', '**/*.e2e.ts'],
});
`,
    );

    const config = parsePlaywrightConfig(filePath);
    expect(config.testMatch).toEqual(['**/*.spec.ts', '**/*.e2e.ts']);
  });

  it('parses globalSetup and globalTeardown', () => {
    setup();
    const filePath = writeConfigFile(
      'playwright.config.ts',
      `
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
});
`,
    );

    const config = parsePlaywrightConfig(filePath);

    expect(config.globalSetup).toBe('./global-setup.ts');
    expect(config.globalTeardown).toBe('./global-teardown.ts');
  });

  it('parses globalSetup without globalTeardown', () => {
    setup();
    const filePath = writeConfigFile(
      'playwright.config.ts',
      `
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  globalSetup: require.resolve('./setup'),
});
`,
    );

    const config = parsePlaywrightConfig(filePath);

    // require.resolve is a call expression, not a string literal — should be undefined
    expect(config.globalSetup).toBeUndefined();
    expect(config.globalTeardown).toBeUndefined();
  });

  it('parses globalSetup as string literal only', () => {
    setup();
    const filePath = writeConfigFile(
      'playwright.config.ts',
      `
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  globalSetup: './setup.ts',
});
`,
    );

    const config = parsePlaywrightConfig(filePath);

    expect(config.globalSetup).toBe('./setup.ts');
    expect(config.globalTeardown).toBeUndefined();
  });

  it('parses export default object literal (without defineConfig)', () => {
    setup();
    const filePath = writeConfigFile(
      'playwright.config.ts',
      `
export default {
  testDir: './integration',
  use: {
    baseURL: 'http://localhost:8080',
  },
};
`,
    );

    const config = parsePlaywrightConfig(filePath);
    expect(config.testDir).toBe('./integration');
    expect(config.baseURL).toBe('http://localhost:8080');
  });
});
