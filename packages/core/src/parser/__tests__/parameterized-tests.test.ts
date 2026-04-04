import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseTestFile } from '../test-parser.js';
import { generateTestFile } from '../../generator/test-generator.js';

let tmpDir: string;

function setup(): string {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parameterized-tests-'));
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

describe('Parameterized Test Parsing', () => {
  it('detects for...of loop wrapping a test() call with inline data', () => {
    setup();
    const filePath = writeTestFile(
      'for-of-inline.spec.ts',
      `
import { test, expect } from '@playwright/test';

const testData = [{name: 'Alice', role: 'admin'}, {name: 'Bob', role: 'user'}];

test.describe('User tests', () => {
  for (const d of testData) {
    test(d.name, async ({ page }) => {
      await page.goto('https://example.com');
    });
  }
});
`,
    );

    const flow = parseTestFile(filePath);

    // Should not appear as regular tests
    expect(flow.tests).toHaveLength(0);

    // Should appear as parameterized tests
    expect(flow.parameterizedTests).toBeDefined();
    expect(flow.parameterizedTests).toHaveLength(1);

    const pt = flow.parameterizedTests![0];
    expect(pt.loopPattern).toBe('for...of');
    expect(pt.iteratorVariable).toBe('d');
    expect(pt.dataSource).toBe('testData');
    expect(pt.testNameTemplate).toBe('d.name');

    // Data items should be resolved from the variable declaration
    expect(pt.dataItems).toBeDefined();
    expect(pt.dataItems).toHaveLength(2);
    expect(pt.dataItems![0]).toEqual({ name: 'Alice', role: 'admin' });
    expect(pt.dataItems![1]).toEqual({ name: 'Bob', role: 'user' });

    // Test body should have the navigate action
    expect(pt.testBody).toHaveLength(1);
    expect(pt.testBody[0].data.type).toBe('navigate');
  });

  it('detects forEach pattern with inline array', () => {
    setup();
    const filePath = writeTestFile(
      'foreach-inline.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('Data tests', () => {
  [{a: 1, b: 2}, {a: 3, b: 4}].forEach(data => {
    test('test with data', async ({ page }) => {
      await page.goto('https://example.com');
    });
  });
});
`,
    );

    const flow = parseTestFile(filePath);

    expect(flow.tests).toHaveLength(0);
    expect(flow.parameterizedTests).toBeDefined();
    expect(flow.parameterizedTests).toHaveLength(1);

    const pt = flow.parameterizedTests![0];
    expect(pt.loopPattern).toBe('forEach');
    expect(pt.iteratorVariable).toBe('data');
    expect(pt.dataSource).toBe('[{a: 1, b: 2}, {a: 3, b: 4}]');
    expect(pt.testNameTemplate).toBe('test with data');

    // Data items extracted from inline array
    expect(pt.dataItems).toBeDefined();
    expect(pt.dataItems).toHaveLength(2);
    expect(pt.dataItems![0]).toEqual({ a: 1, b: 2 });
    expect(pt.dataItems![1]).toEqual({ a: 3, b: 4 });
  });

  it('detects for...of loop with variable reference as data source', () => {
    setup();
    const filePath = writeTestFile(
      'for-of-var.spec.ts',
      `
import { test, expect } from '@playwright/test';

const users = [{name: 'Admin'}, {name: 'Guest'}];

test.describe('Variable ref tests', () => {
  for (const user of users) {
    test('login test', async ({ page }) => {
      await page.goto('https://example.com/login');
      await page.getByLabel('Username').fill('testuser');
    });
  }
});
`,
    );

    const flow = parseTestFile(filePath);

    expect(flow.tests).toHaveLength(0);
    expect(flow.parameterizedTests).toHaveLength(1);

    const pt = flow.parameterizedTests![0];
    expect(pt.loopPattern).toBe('for...of');
    expect(pt.iteratorVariable).toBe('user');
    expect(pt.dataSource).toBe('users');

    // Data resolved from variable declaration
    expect(pt.dataItems).toBeDefined();
    expect(pt.dataItems).toHaveLength(2);
    expect(pt.dataItems![0]).toEqual({ name: 'Admin' });

    // Test body should have navigate + fill
    expect(pt.testBody).toHaveLength(2);
    expect(pt.testBody[0].data.type).toBe('navigate');
    expect(pt.testBody[1].data.type).toBe('fill');
  });

  it('stores variable name when data source cannot be resolved', () => {
    setup();
    const filePath = writeTestFile(
      'for-of-unresolvable.spec.ts',
      `
import { test, expect } from '@playwright/test';
import { testData } from './fixtures';

test.describe('External data tests', () => {
  for (const item of testData) {
    test('external data test', async ({ page }) => {
      await page.goto('https://example.com');
    });
  }
});
`,
    );

    const flow = parseTestFile(filePath);

    expect(flow.parameterizedTests).toHaveLength(1);
    const pt = flow.parameterizedTests![0];
    expect(pt.dataSource).toBe('testData');
    expect(pt.dataItems).toBeUndefined();
  });

  it('detects forEach with variable reference', () => {
    setup();
    const filePath = writeTestFile(
      'foreach-var.spec.ts',
      `
import { test, expect } from '@playwright/test';

const scenarios = [{url: '/login'}, {url: '/dashboard'}];

test.describe('Scenario tests', () => {
  scenarios.forEach(s => {
    test('navigate test', async ({ page }) => {
      await page.goto('https://example.com');
    });
  });
});
`,
    );

    const flow = parseTestFile(filePath);

    expect(flow.tests).toHaveLength(0);
    expect(flow.parameterizedTests).toHaveLength(1);

    const pt = flow.parameterizedTests![0];
    expect(pt.loopPattern).toBe('forEach');
    expect(pt.iteratorVariable).toBe('s');
    expect(pt.dataSource).toBe('scenarios');
    expect(pt.dataItems).toBeDefined();
    expect(pt.dataItems).toHaveLength(2);
  });

  it('preserves template literal test names', () => {
    setup();
    const filePath = writeTestFile(
      'template-name.spec.ts',
      `
import { test, expect } from '@playwright/test';

const roles = [{role: 'admin'}, {role: 'user'}];

test.describe('Role tests', () => {
  for (const data of roles) {
    test(\`login as \${data.role}\`, async ({ page }) => {
      await page.goto('https://example.com');
    });
  }
});
`,
    );

    const flow = parseTestFile(filePath);

    expect(flow.parameterizedTests).toHaveLength(1);
    const pt = flow.parameterizedTests![0];
    // Template literal should be preserved in testNameTemplate
    expect(pt.testNameTemplate).toContain('`');
    expect(pt.testNameTemplate).toContain('data.role');
  });

  it('extracts fixture names from parameterized test callback', () => {
    setup();
    const filePath = writeTestFile(
      'fixtures-param.spec.ts',
      `
import { test, expect } from '@playwright/test';

const data = [{val: 1}];

test.describe('Fixture tests', () => {
  for (const d of data) {
    test('fixture test', async ({ page, request }) => {
      await page.goto('https://example.com');
    });
  }
});
`,
    );

    const flow = parseTestFile(filePath);

    expect(flow.parameterizedTests).toHaveLength(1);
    const pt = flow.parameterizedTests![0];
    expect(pt.fixtures).toBeDefined();
    expect(pt.fixtures).toContain('page');
    expect(pt.fixtures).toContain('request');
  });
});

describe('Parameterized Test Generation', () => {
  it('generates for...of loop with correct data array and test template', () => {
    setup();
    const filePath = writeTestFile(
      'gen-for-of.spec.ts',
      `
import { test, expect } from '@playwright/test';

const testData = [{name: 'Alice'}, {name: 'Bob'}];

test.describe('Gen tests', () => {
  for (const d of testData) {
    test(d.name, async ({ page }) => {
      await page.goto('https://example.com');
    });
  }
});
`,
    );

    const flow = parseTestFile(filePath);
    const generated = generateTestFile(flow);

    // Should contain the for...of loop
    expect(generated).toContain('for (const d of testData)');
    expect(generated).toContain("test(d.name, async ({ page }) => {");
    expect(generated).toContain("await page.goto('https://example.com');");
  });

  it('generates forEach pattern correctly', () => {
    setup();
    const filePath = writeTestFile(
      'gen-foreach.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('ForEach tests', () => {
  [{a: 1}, {a: 2}].forEach(item => {
    test('item test', async ({ page }) => {
      await page.goto('https://example.com');
    });
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const generated = generateTestFile(flow);

    // Should contain the forEach pattern
    expect(generated).toContain('.forEach(item => {');
    expect(generated).toContain("test('item test', async ({ page }) => {");
    expect(generated).toContain("await page.goto('https://example.com');");
  });
});

describe('Parameterized Test Round-trip', () => {
  it('round-trips a for...of parameterized test through parse and generate', () => {
    setup();
    const original = `import { test, expect } from '@playwright/test';

const testData = [{name: 'Alice'}, {name: 'Bob'}];

test.describe('Round-trip tests', () => {
  for (const d of testData) {
    test(d.name, async ({ page }) => {
      await page.goto('https://example.com');
    });
  }
});
`;

    const filePath = writeTestFile('roundtrip-for-of.spec.ts', original);
    const flow = parseTestFile(filePath);
    const generated = generateTestFile(flow);

    // Verify structural equivalence
    expect(generated).toContain('for (const d of testData)');
    expect(generated).toContain('test(d.name, async ({ page }) => {');
    expect(generated).toContain("await page.goto('https://example.com');");

    // Re-parse the generated output to verify it's valid
    const reParsePath = writeTestFile('roundtrip-for-of-regen.spec.ts', generated);
    const reFlow = parseTestFile(reParsePath);

    expect(reFlow.parameterizedTests).toHaveLength(1);
    expect(reFlow.parameterizedTests![0].loopPattern).toBe('for...of');
    expect(reFlow.parameterizedTests![0].iteratorVariable).toBe('d');
  });

  it('round-trips a forEach parameterized test through parse and generate', () => {
    setup();
    const filePath = writeTestFile(
      'roundtrip-foreach.spec.ts',
      `
import { test, expect } from '@playwright/test';

const items = [{url: '/a'}, {url: '/b'}];

test.describe('ForEach round-trip', () => {
  items.forEach(item => {
    test('nav test', async ({ page }) => {
      await page.goto('https://example.com');
    });
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    const generated = generateTestFile(flow);

    expect(generated).toContain('items.forEach(item => {');

    // Re-parse to verify round-trip
    const reParsePath = writeTestFile('roundtrip-foreach-regen.spec.ts', generated);
    const reFlow = parseTestFile(reParsePath);

    expect(reFlow.parameterizedTests).toHaveLength(1);
    expect(reFlow.parameterizedTests![0].loopPattern).toBe('forEach');
  });
});
