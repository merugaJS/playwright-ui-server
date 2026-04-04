import { describe, it, expect } from 'vitest';
import { parseTestFile } from '../../parser/test-parser';
import { generateTestFile } from '../../generator/test-generator';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-storage-'));
  return dir;
}

function writeAndParse(code: string) {
  const dir = setup();
  const file = path.join(dir, 'storage.spec.ts');
  fs.writeFileSync(file, code);
  return parseTestFile(file);
}

describe('Browser Storage parsing', () => {
  it('parses localStorage.setItem', () => {
    const flow = writeAndParse(`
import { test, expect } from '@playwright/test';
test('storage', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('token', 'abc'));
});
`);
    const nodes = flow.tests[0].nodes;
    const storageNode = nodes.find((n: any) => n.type === 'browserStorage');
    expect(storageNode).toBeDefined();
    expect((storageNode as any).data.storageType).toBe('localStorage');
    expect((storageNode as any).data.operation).toBe('setItem');
    expect((storageNode as any).data.key).toBe('token');
    expect((storageNode as any).data.value).toBe('abc');
  });

  it('parses sessionStorage.getItem', () => {
    const flow = writeAndParse(`
import { test, expect } from '@playwright/test';
test('storage', async ({ page }) => {
  await page.evaluate(() => sessionStorage.getItem('key'));
});
`);
    const nodes = flow.tests[0].nodes;
    const storageNode = nodes.find((n: any) => n.type === 'browserStorage');
    expect(storageNode).toBeDefined();
    expect((storageNode as any).data.storageType).toBe('sessionStorage');
    expect((storageNode as any).data.operation).toBe('getItem');
    expect((storageNode as any).data.key).toBe('key');
  });

  it('parses localStorage.removeItem', () => {
    const flow = writeAndParse(`
import { test, expect } from '@playwright/test';
test('storage', async ({ page }) => {
  await page.evaluate(() => localStorage.removeItem('key'));
});
`);
    const nodes = flow.tests[0].nodes;
    const storageNode = nodes.find((n: any) => n.type === 'browserStorage');
    expect(storageNode).toBeDefined();
    expect((storageNode as any).data.operation).toBe('removeItem');
    expect((storageNode as any).data.key).toBe('key');
  });

  it('parses localStorage.clear', () => {
    const flow = writeAndParse(`
import { test, expect } from '@playwright/test';
test('storage', async ({ page }) => {
  await page.evaluate(() => localStorage.clear());
});
`);
    const nodes = flow.tests[0].nodes;
    const storageNode = nodes.find((n: any) => n.type === 'browserStorage');
    expect(storageNode).toBeDefined();
    expect((storageNode as any).data.operation).toBe('clear');
  });

  it('parses variable declaration with localStorage.getItem', () => {
    const flow = writeAndParse(`
import { test, expect } from '@playwright/test';
test('storage', async ({ page }) => {
  const val = await page.evaluate(() => localStorage.getItem('key'));
});
`);
    const nodes = flow.tests[0].nodes;
    const storageNode = nodes.find((n: any) => n.type === 'browserStorage');
    expect(storageNode).toBeDefined();
    expect((storageNode as any).data.resultVariable).toBe('val');
    expect((storageNode as any).data.operation).toBe('getItem');
    expect((storageNode as any).data.key).toBe('key');
  });

  it('round-trips through generator', () => {
    const flow = writeAndParse(`
import { test, expect } from '@playwright/test';
test('storage', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('token', 'abc'));
  await page.evaluate(() => sessionStorage.getItem('key'));
  await page.evaluate(() => localStorage.removeItem('old'));
  await page.evaluate(() => localStorage.clear());
});
`);
    const generated = generateTestFile(flow);
    expect(generated).toContain("await page.evaluate(() => localStorage.setItem('token', 'abc'));");
    expect(generated).toContain("await page.evaluate(() => sessionStorage.getItem('key'));");
    expect(generated).toContain("await page.evaluate(() => localStorage.removeItem('old'));");
    expect(generated).toContain("await page.evaluate(() => localStorage.clear());");
  });

  it('non-storage evaluate calls become codeBlock', () => {
    const flow = writeAndParse(`
import { test, expect } from '@playwright/test';
test('eval', async ({ page }) => {
  await page.evaluate(() => document.title);
});
`);
    const nodes = flow.tests[0].nodes;
    const storageNode = nodes.find((n: any) => n.type === 'browserStorage');
    expect(storageNode).toBeUndefined();
    const codeNode = nodes.find((n: any) => n.type === 'codeBlock');
    expect(codeNode).toBeDefined();
  });
});
