import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseTestFile } from '../test-parser.js';
import { generateTestFile } from '../../generator/test-generator.js';

let tmpDir: string;

function setup(): string {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'describe-mode-'));
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

describe('describe mode (serial / parallel)', () => {
  it('parses test.describe.serial() and sets mode to serial', () => {
    setup();
    const filePath = writeTestFile(
      'serial.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe.serial('ordered suite', () => {
  test('step one', async ({ page }) => {
    await page.goto('https://example.com');
  });

  test('step two', async ({ page }) => {
    await page.getByText('Hello').click();
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    expect(flow.describe).toBe('ordered suite');
    expect(flow.describeMode).toBe('serial');
    expect(flow.tests).toHaveLength(2);
    expect(flow.tests[0].name).toBe('step one');
    expect(flow.tests[1].name).toBe('step two');
  });

  it('parses a regular test.describe() with mode default (no describeMode field)', () => {
    setup();
    const filePath = writeTestFile(
      'default.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('normal suite', () => {
  test('a test', async ({ page }) => {
    await page.goto('https://example.com');
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    expect(flow.describe).toBe('normal suite');
    expect(flow.describeMode).toBeUndefined();
  });

  it('parses test.describe.parallel() and sets mode to parallel', () => {
    setup();
    const filePath = writeTestFile(
      'parallel.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe.parallel('parallel suite', () => {
  test('test a', async ({ page }) => {
    await page.goto('https://example.com/a');
  });

  test('test b', async ({ page }) => {
    await page.goto('https://example.com/b');
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    expect(flow.describe).toBe('parallel suite');
    expect(flow.describeMode).toBe('parallel');
  });

  it('parses nested describes with independent modes', () => {
    setup();
    const filePath = writeTestFile(
      'nested-modes.spec.ts',
      `
import { test, expect } from '@playwright/test';

test.describe('outer', () => {
  test.describe.serial('inner serial', () => {
    test('serial test 1', async ({ page }) => {
      await page.goto('https://example.com');
    });
  });

  test.describe.parallel('inner parallel', () => {
    test('parallel test 1', async ({ page }) => {
      await page.goto('https://example.com');
    });
  });

  test('outer test', async ({ page }) => {
    await page.goto('https://example.com');
  });
});
`,
    );

    const flow = parseTestFile(filePath);
    expect(flow.describe).toBe('outer');
    expect(flow.describeMode).toBeUndefined();

    expect(flow.children).toHaveLength(2);
    expect(flow.children![0].name).toBe('inner serial');
    expect(flow.children![0].mode).toBe('serial');
    expect(flow.children![1].name).toBe('inner parallel');
    expect(flow.children![1].mode).toBe('parallel');
  });

  it('generator emits test.describe.serial() when mode is serial', () => {
    const flow = parseTestFile(
      (() => {
        setup();
        return writeTestFile(
          'gen-serial.spec.ts',
          `
import { test, expect } from '@playwright/test';

test.describe.serial('serial suite', () => {
  test('first', async ({ page }) => {
    await page.goto('https://example.com');
  });
});
`,
        );
      })(),
    );

    const output = generateTestFile(flow);
    expect(output).toContain("test.describe.serial('serial suite'");
    expect(output).not.toContain("test.describe('serial suite'");
  });

  it('generator emits test.describe() when mode is default', () => {
    const flow = parseTestFile(
      (() => {
        setup();
        return writeTestFile(
          'gen-default.spec.ts',
          `
import { test, expect } from '@playwright/test';

test.describe('default suite', () => {
  test('a test', async ({ page }) => {
    await page.goto('https://example.com');
  });
});
`,
        );
      })(),
    );

    const output = generateTestFile(flow);
    expect(output).toContain("test.describe('default suite'");
    expect(output).not.toContain('test.describe.serial');
    expect(output).not.toContain('test.describe.parallel');
  });

  it('generator emits test.describe.parallel() for nested parallel blocks', () => {
    const flow = parseTestFile(
      (() => {
        setup();
        return writeTestFile(
          'gen-nested-parallel.spec.ts',
          `
import { test, expect } from '@playwright/test';

test.describe('wrapper', () => {
  test.describe.parallel('parallel inner', () => {
    test('p1', async ({ page }) => {
      await page.goto('https://example.com');
    });
  });
});
`,
        );
      })(),
    );

    const output = generateTestFile(flow);
    expect(output).toContain("test.describe.parallel('parallel inner'");
  });

  it('round-trip preserves test.describe.serial()', () => {
    setup();
    const original = `import { test, expect } from '@playwright/test';

test.describe.serial('serial round-trip', () => {
  test('first', async ({ page }) => {
    await page.goto('https://example.com');
  });

  test('second', async ({ page }) => {
    await page.getByText('Hello').click();
  });
});
`;
    const filePath = writeTestFile('roundtrip-serial.spec.ts', original);
    const flow = parseTestFile(filePath);
    const output = generateTestFile(flow);

    expect(output).toContain("test.describe.serial('serial round-trip'");
    expect(output).toContain("test('first'");
    expect(output).toContain("test('second'");
  });
});
