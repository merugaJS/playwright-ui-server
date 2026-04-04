import { describe, it, expect } from 'vitest';
import { scanEnvVarsInSource, scanEnvVars } from '../env-scanner.js';

describe('scanEnvVarsInSource', () => {
  it('finds process.env.VAR_NAME references', () => {
    const source = `
      const url = process.env.BASE_URL;
      const key = process.env.API_KEY;
    `;
    expect(scanEnvVarsInSource(source)).toEqual(['API_KEY', 'BASE_URL']);
  });

  it('finds bracket-notation references', () => {
    const source = `
      const url = process.env['BASE_URL'];
      const key = process.env["API_KEY"];
    `;
    expect(scanEnvVarsInSource(source)).toEqual(['API_KEY', 'BASE_URL']);
  });

  it('finds destructured access', () => {
    const source = `const { FOO, BAR } = process.env;`;
    expect(scanEnvVarsInSource(source)).toEqual(['BAR', 'FOO']);
  });

  it('finds destructured access with renaming', () => {
    const source = `const { FOO: myFoo, BAR } = process.env;`;
    expect(scanEnvVarsInSource(source)).toEqual(['BAR', 'FOO']);
  });

  it('handles let and var destructuring', () => {
    const source = `let { MY_VAR } = process.env;`;
    expect(scanEnvVarsInSource(source)).toEqual(['MY_VAR']);
  });

  it('deduplicates references', () => {
    const source = `
      const a = process.env.TOKEN;
      const b = process.env.TOKEN;
    `;
    expect(scanEnvVarsInSource(source)).toEqual(['TOKEN']);
  });

  it('returns empty array for source without env vars', () => {
    const source = `const x = 42; console.log('hello');`;
    expect(scanEnvVarsInSource(source)).toEqual([]);
  });

  it('handles mixed access patterns', () => {
    const source = `
      const a = process.env.FOO;
      const b = process.env['BAR'];
      const { BAZ } = process.env;
    `;
    expect(scanEnvVarsInSource(source)).toEqual(['BAR', 'BAZ', 'FOO']);
  });
});

describe('scanEnvVars', () => {
  it('aggregates references across multiple files', () => {
    const files = [
      { filePath: 'tests/login.spec.ts', content: 'const url = process.env.BASE_URL;' },
      { filePath: 'tests/api.spec.ts', content: 'const url = process.env.BASE_URL;\nconst key = process.env.API_KEY;' },
    ];
    const result = scanEnvVars(files);
    expect(result).toEqual([
      { name: 'API_KEY', referencedIn: ['tests/api.spec.ts'] },
      { name: 'BASE_URL', referencedIn: ['tests/api.spec.ts', 'tests/login.spec.ts'] },
    ]);
  });

  it('returns empty array when no files have env vars', () => {
    const files = [
      { filePath: 'tests/basic.spec.ts', content: 'test("hello", () => {});' },
    ];
    expect(scanEnvVars(files)).toEqual([]);
  });

  it('returns empty array for empty file list', () => {
    expect(scanEnvVars([])).toEqual([]);
  });
});
