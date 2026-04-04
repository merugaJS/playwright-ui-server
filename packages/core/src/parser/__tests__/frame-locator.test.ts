import { describe, it, expect } from 'vitest';
import { parseTestFile } from '../../parser/test-parser';
import { generateTestFile } from '../../generator/test-generator';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-frame-'));
  return dir;
}

function writeAndParse(code: string) {
  const dir = setup();
  const file = path.join(dir, 'frame.spec.ts');
  fs.writeFileSync(file, code);
  return parseTestFile(file);
}

describe('Frame Locator parsing', () => {
  it('parses page.frameLocator().locator().click()', () => {
    const flow = writeAndParse(`
import { test, expect } from '@playwright/test';
test.describe('iframe tests', () => {
  test('click inside iframe', async ({ page }) => {
    await page.frameLocator('#iframe').locator('.btn').click();
  });
});
`);
    const nodes = flow.tests[0].nodes;
    const clickNode = nodes.find((n: any) => n.type === 'click');
    expect(clickNode).toBeDefined();
    expect(clickNode!.frameLocators).toEqual(['#iframe']);
    expect((clickNode as any).data.locator.kind).toBe('inline');
    expect((clickNode as any).data.locator.strategy).toBe('locator');
    expect((clickNode as any).data.locator.value).toBe('.btn');
  });

  it('parses nested frame locators', () => {
    const flow = writeAndParse(`
import { test, expect } from '@playwright/test';
test.describe('nested iframe tests', () => {
  test('fill inside nested iframe', async ({ page }) => {
    await page.frameLocator('#outer').frameLocator('#inner').locator('input').fill('text');
  });
});
`);
    const nodes = flow.tests[0].nodes;
    const fillNode = nodes.find((n: any) => n.type === 'fill');
    expect(fillNode).toBeDefined();
    expect(fillNode!.frameLocators).toEqual(['#outer', '#inner']);
    expect((fillNode as any).data.locator.kind).toBe('inline');
    expect((fillNode as any).data.locator.strategy).toBe('locator');
    expect((fillNode as any).data.locator.value).toBe('input');
    expect((fillNode as any).data.value).toBe('text');
  });

  it('parses frameLocator with getByRole', () => {
    const flow = writeAndParse(`
import { test, expect } from '@playwright/test';
test.describe('iframe tests', () => {
  test('click by role inside iframe', async ({ page }) => {
    await page.frameLocator('#iframe').getByRole('button', { name: 'Submit' }).click();
  });
});
`);
    const nodes = flow.tests[0].nodes;
    const clickNode = nodes.find((n: any) => n.type === 'click');
    expect(clickNode).toBeDefined();
    expect(clickNode!.frameLocators).toEqual(['#iframe']);
    expect((clickNode as any).data.locator.strategy).toBe('getByRole');
  });

  it('has no frameLocators for actions without frame context', () => {
    const flow = writeAndParse(`
import { test, expect } from '@playwright/test';
test.describe('no iframe tests', () => {
  test('normal click', async ({ page }) => {
    await page.locator('.btn').click();
  });
});
`);
    const nodes = flow.tests[0].nodes;
    const clickNode = nodes.find((n: any) => n.type === 'click');
    expect(clickNode).toBeDefined();
    expect(clickNode!.frameLocators).toBeUndefined();
  });

  it('parses frameLocator in expect assertions', () => {
    const flow = writeAndParse(`
import { test, expect } from '@playwright/test';
test.describe('iframe assert tests', () => {
  test('assert visible inside iframe', async ({ page }) => {
    await expect(page.frameLocator('#iframe').locator('.item')).toBeVisible();
  });
});
`);
    const nodes = flow.tests[0].nodes;
    const assertNode = nodes.find((n: any) => n.type === 'assertVisible');
    expect(assertNode).toBeDefined();
    expect(assertNode!.frameLocators).toEqual(['#iframe']);
    expect((assertNode as any).data.locator.strategy).toBe('locator');
    expect((assertNode as any).data.locator.value).toBe('.item');
  });
});

describe('Frame Locator generation', () => {
  it('round-trips single frame locator', () => {
    const code = `import { test, expect } from '@playwright/test';

test.describe('iframe tests', () => {
  test('click inside iframe', async ({ page }) => {
    await page.frameLocator('#iframe').locator('.btn').click();
  });
});
`;
    const dir = setup();
    const file = path.join(dir, 'frame-rt.spec.ts');
    fs.writeFileSync(file, code);
    const flow = parseTestFile(file);
    const generated = generateTestFile(flow);
    expect(generated).toContain("page.frameLocator('#iframe').locator('.btn').click()");
  });

  it('round-trips nested frame locators', () => {
    const code = `import { test, expect } from '@playwright/test';

test.describe('nested iframe tests', () => {
  test('fill inside nested iframe', async ({ page }) => {
    await page.frameLocator('#outer').frameLocator('#inner').locator('input').fill('text');
  });
});
`;
    const dir = setup();
    const file = path.join(dir, 'frame-rt2.spec.ts');
    fs.writeFileSync(file, code);
    const flow = parseTestFile(file);
    const generated = generateTestFile(flow);
    expect(generated).toContain("page.frameLocator('#outer').frameLocator('#inner').locator('input').fill('text')");
  });

  it('round-trips frameLocator with getByRole', () => {
    const code = `import { test, expect } from '@playwright/test';

test.describe('iframe tests', () => {
  test('click by role in iframe', async ({ page }) => {
    await page.frameLocator('#iframe').getByRole('button', { name: 'Submit' }).click();
  });
});
`;
    const dir = setup();
    const file = path.join(dir, 'frame-rt3.spec.ts');
    fs.writeFileSync(file, code);
    const flow = parseTestFile(file);
    const generated = generateTestFile(flow);
    expect(generated).toContain("page.frameLocator('#iframe').getByRole('button', { name: 'Submit' }).click()");
  });
});
