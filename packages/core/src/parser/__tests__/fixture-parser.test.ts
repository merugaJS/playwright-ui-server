import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseFixtureFile, getBuiltInFixtures, findFixtureFiles } from '../fixture-parser.js';

let tmpDir: string;

function setup(): string {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture-parser-'));
  return tmpDir;
}

afterEach(() => {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

describe('getBuiltInFixtures', () => {
  it('returns standard Playwright fixtures', () => {
    const builtIn = getBuiltInFixtures();
    const names = builtIn.map(f => f.name);
    expect(names).toContain('page');
    expect(names).toContain('context');
    expect(names).toContain('browser');
    expect(names).toContain('request');
    expect(names).toContain('browserName');
    for (const f of builtIn) {
      expect(f.isBuiltIn).toBe(true);
    }
  });
});

describe('parseFixtureFile', () => {
  it('parses a simple fixture with inline type parameter', () => {
    setup();
    const filePath = path.join(tmpDir, 'fixtures.ts');
    fs.writeFileSync(filePath, `
import { test as base } from '@playwright/test';

export const test = base.extend<{ myPage: Page }>({
  myPage: async ({ page }, use) => {
    await page.goto('/setup');
    await use(page);
  },
});
`);

    const fixtures = parseFixtureFile(filePath);
    expect(fixtures).toHaveLength(1);
    expect(fixtures[0].name).toBe('myPage');
    expect(fixtures[0].type).toBe('Page');
    expect(fixtures[0].isBuiltIn).toBe(false);
    expect(fixtures[0].setupCode).toContain("page.goto('/setup')");
  });

  it('extracts setup and teardown code around use() call', () => {
    setup();
    const filePath = path.join(tmpDir, 'fixtures-teardown.ts');
    fs.writeFileSync(filePath, `
import { test as base } from '@playwright/test';

export const test = base.extend<{ db: Database }>({
  db: async ({}, use) => {
    const db = await connectDB();
    await use(db);
    await db.close();
  },
});
`);

    const fixtures = parseFixtureFile(filePath);
    expect(fixtures).toHaveLength(1);
    expect(fixtures[0].name).toBe('db');
    expect(fixtures[0].setupCode).toContain('connectDB()');
    expect(fixtures[0].teardownCode).toContain('db.close()');
  });

  it('parses multiple fixtures from a single extend call', () => {
    setup();
    const filePath = path.join(tmpDir, 'multi-fixtures.ts');
    fs.writeFileSync(filePath, `
import { test as base } from '@playwright/test';

export const test = base.extend<{ adminPage: Page; apiClient: APIRequestContext }>({
  adminPage: async ({ page }, use) => {
    await page.goto('/admin');
    await use(page);
  },
  apiClient: async ({ request }, use) => {
    await use(request);
  },
});
`);

    const fixtures = parseFixtureFile(filePath);
    expect(fixtures).toHaveLength(2);
    const names = fixtures.map(f => f.name);
    expect(names).toContain('adminPage');
    expect(names).toContain('apiClient');
  });

  it('handles worker scope fixture with array form', () => {
    setup();
    const filePath = path.join(tmpDir, 'worker-fixtures.ts');
    fs.writeFileSync(filePath, `
import { test as base } from '@playwright/test';

export const test = base.extend<{}, { workerDb: Database }>({
  workerDb: [async ({}, use) => {
    const db = await connectDB();
    await use(db);
    await db.close();
  }, { scope: 'worker' }],
});
`);

    const fixtures = parseFixtureFile(filePath);
    expect(fixtures).toHaveLength(1);
    expect(fixtures[0].name).toBe('workerDb');
    expect(fixtures[0].scope).toBe('worker');
  });

  it('infers worker scope from second type parameter', () => {
    setup();
    const filePath = path.join(tmpDir, 'worker-type-param.ts');
    fs.writeFileSync(filePath, `
import { test as base } from '@playwright/test';

export const test = base.extend<{ myPage: Page }, { sharedDb: Database }>({
  sharedDb: [async ({}, use) => {
    const db = await connectDB();
    await use(db);
    await db.close();
  }, { scope: 'worker' }],
  myPage: async ({ page }, use) => {
    await use(page);
  },
});
`);

    const fixtures = parseFixtureFile(filePath);
    expect(fixtures).toHaveLength(2);
    const sharedDb = fixtures.find(f => f.name === 'sharedDb')!;
    const myPage = fixtures.find(f => f.name === 'myPage')!;
    expect(sharedDb.scope).toBe('worker');
    expect(sharedDb.type).toBe('Database');
    expect(myPage.scope).toBeUndefined();
    expect(myPage.type).toBe('Page');
  });

  it('auto-detects worker scope from second type parameter without explicit scope option', () => {
    setup();
    const filePath = path.join(tmpDir, 'worker-auto-scope.ts');
    fs.writeFileSync(filePath, `
import { test as base } from '@playwright/test';

export const test = base.extend<{}, { workerPort: number }>({
  workerPort: [async ({}, use) => {
    await use(3000);
  }, { scope: 'worker' }],
});
`);

    const fixtures = parseFixtureFile(filePath);
    expect(fixtures).toHaveLength(1);
    expect(fixtures[0].name).toBe('workerPort');
    expect(fixtures[0].scope).toBe('worker');
    expect(fixtures[0].type).toBe('number');
  });

  it('detects auto and scope combined in options', () => {
    setup();
    const filePath = path.join(tmpDir, 'auto-worker.ts');
    fs.writeFileSync(filePath, `
import { test as base } from '@playwright/test';

export const test = base.extend<{}, { autoDb: Database }>({
  autoDb: [async ({}, use) => {
    const db = await connectDB();
    await use(db);
    await db.close();
  }, { auto: true, scope: 'worker' }],
});
`);

    const fixtures = parseFixtureFile(filePath);
    expect(fixtures).toHaveLength(1);
    expect(fixtures[0].name).toBe('autoDb');
    expect(fixtures[0].scope).toBe('worker');
    expect(fixtures[0].auto).toBe(true);
  });

  it('detects auto fixture without worker scope', () => {
    setup();
    const filePath = path.join(tmpDir, 'auto-test.ts');
    fs.writeFileSync(filePath, `
import { test as base } from '@playwright/test';

export const test = base.extend<{ autoSetup: void }>({
  autoSetup: [async ({}, use) => {
    console.log('auto setup');
    await use();
  }, { auto: true }],
});
`);

    const fixtures = parseFixtureFile(filePath);
    expect(fixtures).toHaveLength(1);
    expect(fixtures[0].name).toBe('autoSetup');
    expect(fixtures[0].auto).toBe(true);
    expect(fixtures[0].scope).toBeUndefined();
  });

  it('worker scope inferred from second type param even without explicit scope in options', () => {
    setup();
    const filePath = path.join(tmpDir, 'inferred-worker.ts');
    fs.writeFileSync(filePath, `
import { test as base } from '@playwright/test';

export const test = base.extend<{}, { workerStorage: string }>({
  workerStorage: async ({}, use) => {
    await use('storage-path');
  },
});
`);

    const fixtures = parseFixtureFile(filePath);
    expect(fixtures).toHaveLength(1);
    expect(fixtures[0].name).toBe('workerStorage');
    // Worker scope inferred from second type parameter
    expect(fixtures[0].scope).toBe('worker');
  });

  it('parses fixture file with interface type parameter', () => {
    setup();
    const filePath = path.join(tmpDir, 'interface-fixtures.ts');
    fs.writeFileSync(filePath, `
import { test as base } from '@playwright/test';

interface MyFixtures {
  todoPage: Page;
}

export const test = base.extend<MyFixtures>({
  todoPage: async ({ page }, use) => {
    await page.goto('/todos');
    await use(page);
  },
});
`);

    const fixtures = parseFixtureFile(filePath);
    expect(fixtures).toHaveLength(1);
    expect(fixtures[0].name).toBe('todoPage');
  });
});

describe('fixture dependencies', () => {
  it('extracts dependencies from destructured first parameter', () => {
    setup();
    const filePath = path.join(tmpDir, 'deps-fixtures.ts');
    fs.writeFileSync(filePath, `
import { test as base } from '@playwright/test';

export const test = base.extend<{ myPage: Page }>({
  myPage: async ({ page, context }, use) => {
    await page.goto('/setup');
    await use(page);
  },
});
`);

    const fixtures = parseFixtureFile(filePath);
    expect(fixtures).toHaveLength(1);
    expect(fixtures[0].dependencies).toEqual(['page', 'context']);
  });

  it('returns empty dependencies for empty destructuring', () => {
    setup();
    const filePath = path.join(tmpDir, 'no-deps-fixtures.ts');
    fs.writeFileSync(filePath, `
import { test as base } from '@playwright/test';

export const test = base.extend<{ db: Database }>({
  db: async ({}, use) => {
    const db = await connectDB();
    await use(db);
  },
});
`);

    const fixtures = parseFixtureFile(filePath);
    expect(fixtures).toHaveLength(1);
    expect(fixtures[0].dependencies).toEqual([]);
  });

  it('extracts dependencies from array-form fixtures', () => {
    setup();
    const filePath = path.join(tmpDir, 'array-deps-fixtures.ts');
    fs.writeFileSync(filePath, `
import { test as base } from '@playwright/test';

export const test = base.extend<{}, { workerDb: Database }>({
  workerDb: [async ({ browser }, use) => {
    const db = await connectDB();
    await use(db);
  }, { scope: 'worker' }],
});
`);

    const fixtures = parseFixtureFile(filePath);
    expect(fixtures).toHaveLength(1);
    expect(fixtures[0].dependencies).toEqual(['browser']);
    expect(fixtures[0].scope).toBe('worker');
  });

  it('extracts multiple dependencies from a chained fixture', () => {
    setup();
    const filePath = path.join(tmpDir, 'multi-deps.ts');
    fs.writeFileSync(filePath, `
import { test as base } from '@playwright/test';

export const test = base.extend<{ dashboard: Page }>({
  dashboard: async ({ page, request, browserName }, use) => {
    await use(page);
  },
});
`);

    const fixtures = parseFixtureFile(filePath);
    expect(fixtures).toHaveLength(1);
    expect(fixtures[0].dependencies).toEqual(['page', 'request', 'browserName']);
  });
});

describe('findFixtureFiles', () => {
  it('finds .ts files containing .extend but not spec/test files', () => {
    setup();
    const testDir = path.join(tmpDir, 'tests');
    fs.mkdirSync(testDir, { recursive: true });

    // Fixture file (should be found)
    fs.writeFileSync(path.join(testDir, 'fixtures.ts'), `
export const test = base.extend({});
`);

    // Test file (should NOT be found)
    fs.writeFileSync(path.join(testDir, 'login.spec.ts'), `
import { test } from './fixtures';
test('login', async ({ page }) => {});
`);

    // Regular TS file without extend (should NOT be found)
    fs.writeFileSync(path.join(testDir, 'utils.ts'), `
export function helper() {}
`);

    const files = findFixtureFiles(tmpDir, testDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toContain('fixtures.ts');
  });
});
