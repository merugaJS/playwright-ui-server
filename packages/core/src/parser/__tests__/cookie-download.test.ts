import { describe, it, expect } from 'vitest';
import { parseTestFile } from '../../parser/test-parser';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-test-'));
  return dir;
}

describe('Cookie and Download parsing', () => {
  it('parses Promise.all download pattern', () => {
    const dir = setup();
    const file = path.join(dir, 'download.spec.ts');
    fs.writeFileSync(file, `
import { test, expect } from '@playwright/test';
test('download', async ({ page }) => {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#btn').click(),
  ]);
  await download.saveAs('/tmp/file.pdf');
});
`);
    const flow = parseTestFile(file);
    const nodes = flow.tests[0].nodes;
    const dlNode = nodes.find((n: any) => n.type === 'fileDownload');
    expect(dlNode).toBeDefined();
    expect((dlNode as any).data.savePath).toBe('/tmp/file.pdf');
  });

  it('parses context.addCookies', () => {
    const dir = setup();
    const file = path.join(dir, 'cookie.spec.ts');
    fs.writeFileSync(file, `
import { test, expect } from '@playwright/test';
test('cookies', async ({ context }) => {
  await context.addCookies([{ name: 'token', value: 'abc123', domain: '.example.com', path: '/' }]);
});
`);
    const flow = parseTestFile(file);
    const nodes = flow.tests[0].nodes;
    const cookieNode = nodes.find((n: any) => n.type === 'cookieAction');
    expect(cookieNode).toBeDefined();
    expect((cookieNode as any).data.operation).toBe('add');
  });

  it('parses context.clearCookies', () => {
    const dir = setup();
    const file = path.join(dir, 'clear-cookie.spec.ts');
    fs.writeFileSync(file, `
import { test, expect } from '@playwright/test';
test('clear cookies', async ({ context }) => {
  await context.clearCookies();
});
`);
    const flow = parseTestFile(file);
    const nodes = flow.tests[0].nodes;
    const cookieNode = nodes.find((n: any) => n.type === 'cookieAction');
    expect(cookieNode).toBeDefined();
    expect((cookieNode as any).data.operation).toBe('clear');
  });
});
