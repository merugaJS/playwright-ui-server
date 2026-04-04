import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseTestFile } from '../test-parser.js';
import { generateTestFile } from '../../generator/test-generator.js';

let tmpDir: string;

function setup(): string {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'response-assertions-'));
  return tmpDir;
}

function writeTestFile(name: string, content: string): string {
  const filePath = path.join(tmpDir, name);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

afterEach(() => {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

describe('Response Assertions', () => {
  it('parses expect(response).toBeOK()', () => {
    setup();
    const filePath = writeTestFile(
      'tobeok.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('API tests', () => {
  test('check response ok', async ({ request }) => {
    const response = await request.get('/api/users');
    expect(response).toBeOK();
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    const assertNode = tc.nodes.find(n => n.data.type === 'responseAssertion');
    expect(assertNode).toBeDefined();
    if (assertNode && assertNode.data.type === 'responseAssertion') {
      expect(assertNode.data.assertionType).toBe('toBeOK');
      expect(assertNode.data.responseVariable).toBe('response');
      expect(assertNode.data.negated).toBeUndefined();
    }
  });

  it('parses expect(response.status()).toBe(200)', () => {
    setup();
    const filePath = writeTestFile(
      'status.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('API tests', () => {
  test('check status code', async ({ request }) => {
    const response = await request.get('/api/users');
    expect(response.status()).toBe(200);
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    const assertNode = tc.nodes.find(n => n.data.type === 'responseAssertion');
    expect(assertNode).toBeDefined();
    if (assertNode && assertNode.data.type === 'responseAssertion') {
      expect(assertNode.data.assertionType).toBe('statusCode');
      expect(assertNode.data.expectedValue).toBe('200');
      expect(assertNode.data.responseVariable).toBe('response');
    }
  });

  it('parses expect(response.status()).not.toBe(404) with negation', () => {
    setup();
    const filePath = writeTestFile(
      'negated-status.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('API tests', () => {
  test('check not 404', async ({ request }) => {
    const response = await request.get('/api/users');
    expect(response.status()).not.toBe(404);
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    const assertNode = tc.nodes.find(n => n.data.type === 'responseAssertion');
    expect(assertNode).toBeDefined();
    if (assertNode && assertNode.data.type === 'responseAssertion') {
      expect(assertNode.data.assertionType).toBe('statusCode');
      expect(assertNode.data.negated).toBe(true);
      expect(assertNode.data.expectedValue).toBe('404');
    }
  });

  it('parses expect(await response.json()).toEqual({ id: 1 })', () => {
    setup();
    const filePath = writeTestFile(
      'json-body.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('API tests', () => {
  test('check json body', async ({ request }) => {
    const response = await request.get('/api/users/1');
    expect(await response.json()).toEqual({ id: 1 });
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    const assertNode = tc.nodes.find(n => n.data.type === 'responseAssertion');
    expect(assertNode).toBeDefined();
    if (assertNode && assertNode.data.type === 'responseAssertion') {
      expect(assertNode.data.assertionType).toBe('jsonBody');
      expect(assertNode.data.expectedValue).toBe('{ id: 1 }');
      expect(assertNode.data.responseVariable).toBe('response');
    }
  });

  it('parses expect(response.headers()[\'content-type\']).toContain(\'application/json\')', () => {
    setup();
    const filePath = writeTestFile(
      'header-value.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('API tests', () => {
  test('check header value', async ({ request }) => {
    const response = await request.get('/api/users');
    expect(response.headers()['content-type']).toContain('application/json');
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    const assertNode = tc.nodes.find(n => n.data.type === 'responseAssertion');
    expect(assertNode).toBeDefined();
    if (assertNode && assertNode.data.type === 'responseAssertion') {
      expect(assertNode.data.assertionType).toBe('headerValue');
      expect(assertNode.data.headerName).toBe('content-type');
      expect(assertNode.data.expectedValue).toBe('application/json');
      expect(assertNode.data.responseVariable).toBe('response');
    }
  });

  it('parses expect(await response.text()).toBe(...)', () => {
    setup();
    const filePath = writeTestFile(
      'text-body.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('API tests', () => {
  test('check text body', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(await response.text()).toBe('OK');
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const tc = flow.tests[0];
    const assertNode = tc.nodes.find(n => n.data.type === 'responseAssertion');
    expect(assertNode).toBeDefined();
    if (assertNode && assertNode.data.type === 'responseAssertion') {
      expect(assertNode.data.assertionType).toBe('text');
      expect(assertNode.data.expectedValue).toBe('OK');
      expect(assertNode.data.responseVariable).toBe('response');
    }
  });

  it('round-trip: parse and regenerate response assertions', () => {
    setup();
    const source = `import { test, expect } from '@playwright/test';

test.describe('API tests', () => {
  test('response assertions', async ({ request }) => {
    const response = await request.get('/api/users');
    expect(response).toBeOK();
    expect(response.status()).toBe(200);
    expect(response.status()).not.toBe(404);
    expect(response.headers()['content-type']).toContain('application/json');
    expect(await response.json()).toEqual({ id: 1 });
    expect(await response.text()).toBe('hello');
  });
});
`;
    const filePath = writeTestFile('roundtrip.spec.ts', source);

    const flow = parseTestFile(filePath);
    const generated = generateTestFile(flow);

    // Check that key assertion patterns survive the round trip
    expect(generated).toContain('expect(response).toBeOK()');
    expect(generated).toContain('expect(response.status()).toBe(200)');
    expect(generated).toContain('expect(response.status()).not.toBe(404)');
    expect(generated).toContain("expect(response.headers()['content-type']).toContain('application/json')");
    expect(generated).toContain('expect(await response.json()).toEqual({ id: 1 })');
    expect(generated).toContain("expect(await response.text()).toBe('hello')");
  });
});
