import { describe, it, expect } from 'vitest';
import {
  computeRequiredImports,
  resolveFlowImports,
  collectAllActions,
  extractReferencedSymbols,
  extractIdentifiersFromCode,
  computePlaywrightImports,
  mergeImportDeclarations,
} from '../import-resolver.js';
import type { SymbolRegistry } from '../import-resolver.js';
import type { TestFlow } from '../../model/test-flow.js';
import type { ActionNode } from '../../model/action-node.js';
import type { ImportDeclaration } from '../../model/test-flow.js';

function makeNode(id: string, data: ActionNode['data'], yPos = 0): ActionNode {
  return {
    id,
    type: data.type,
    position: { x: 250, y: yPos },
    data,
  };
}

function makeMinimalFlow(overrides: Partial<TestFlow> = {}): TestFlow {
  return {
    id: 'test-flow-1',
    filePath: 'test.spec.ts',
    describe: 'Test Suite',
    tests: [],
    imports: [{ moduleSpecifier: '@playwright/test', namedImports: ['test', 'expect'] }],
    fixtures: ['page'],
    metadata: {
      contentHash: 'abc123',
      lastParsedAt: Date.now(),
      parseWarnings: [],
    },
    ...overrides,
  };
}

describe('import-resolver', () => {
  describe('extractIdentifiersFromCode', () => {
    it('extracts PascalCase identifiers', () => {
      const result = extractIdentifiersFromCode('const loginPage = new LoginPage(page);');
      expect(result).toContain('LoginPage');
    });

    it('extracts utility function calls', () => {
      const result = extractIdentifiersFromCode('const data = generateTestData();');
      expect(result).toContain('generateTestData');
    });

    it('does not extract built-in names', () => {
      const result = extractIdentifiersFromCode('await page.goto(url); console.log("test");');
      expect(result).not.toContain('page');
      expect(result).not.toContain('console');
    });

    it('deduplicates identifiers', () => {
      const result = extractIdentifiersFromCode('LoginPage.foo(); LoginPage.bar();');
      const loginPageCount = result.filter(id => id === 'LoginPage').length;
      expect(loginPageCount).toBe(1);
    });
  });

  describe('computePlaywrightImports', () => {
    it('always includes test', () => {
      const result = computePlaywrightImports([], ['page']);
      expect(result.has('test')).toBe(true);
    });

    it('adds expect when assertions are present', () => {
      const actions = [
        makeNode('1', {
          type: 'assertVisible',
          locator: { kind: 'inline', strategy: 'getByText', value: 'Hello' },
        }),
      ];
      const result = computePlaywrightImports(actions, ['page']);
      expect(result.has('expect')).toBe(true);
    });

    it('does not add expect when no assertions', () => {
      const actions = [
        makeNode('1', { type: 'navigate', url: 'https://example.com' }),
      ];
      const result = computePlaywrightImports(actions, ['page']);
      expect(result.has('expect')).toBe(false);
    });

    it('adds expect for responseAssertion', () => {
      const actions = [
        makeNode('1', {
          type: 'responseAssertion',
          responseVariable: 'response',
          assertionType: 'toBeOK',
        }),
      ];
      const result = computePlaywrightImports(actions, ['page']);
      expect(result.has('expect')).toBe(true);
    });
  });

  describe('extractReferencedSymbols', () => {
    it('extracts pageObjectRef symbols', () => {
      const actions = [
        makeNode('1', {
          type: 'pageObjectRef',
          pageObjectId: 'LoginPage',
          method: 'login',
          args: ['user', 'pass'],
        }),
      ];
      const result = extractReferencedSymbols(actions);
      expect(result.has('LoginPage')).toBe(true);
    });

    it('extracts identifiers from codeBlock', () => {
      const actions = [
        makeNode('1', {
          type: 'codeBlock',
          code: 'const helper = new TestHelper(); await generateTestData();',
        }),
      ];
      const result = extractReferencedSymbols(actions);
      expect(result.has('TestHelper')).toBe(true);
      expect(result.has('generateTestData')).toBe(true);
    });
  });

  describe('collectAllActions', () => {
    it('collects actions from tests', () => {
      const flow = makeMinimalFlow({
        tests: [{
          id: 'tc1',
          name: 'test 1',
          nodes: [
            makeNode('1', { type: 'navigate', url: 'https://example.com' }),
            makeNode('2', { type: 'click', locator: { kind: 'inline', strategy: 'getByText', value: 'Submit' } }),
          ],
          edges: [],
        }],
      });
      const actions = collectAllActions(flow);
      expect(actions).toHaveLength(2);
    });

    it('collects actions from hooks', () => {
      const flow = makeMinimalFlow({
        beforeEach: [
          makeNode('1', { type: 'navigate', url: 'https://example.com' }),
        ],
        afterEach: [
          makeNode('2', { type: 'screenshot' }),
        ],
      });
      const actions = collectAllActions(flow);
      expect(actions).toHaveLength(2);
    });

    it('collects nested actions from loops', () => {
      const flow = makeMinimalFlow({
        tests: [{
          id: 'tc1',
          name: 'test 1',
          nodes: [
            makeNode('1', {
              type: 'loop',
              loopKind: 'for',
              initializer: 'let i = 0',
              condition: 'i < 3',
              incrementer: 'i++',
              body: [
                makeNode('inner1', { type: 'navigate', url: 'https://example.com' }),
              ],
            }),
          ],
          edges: [],
        }],
      });
      const actions = collectAllActions(flow);
      // The loop node itself + the inner navigate node
      expect(actions.length).toBeGreaterThanOrEqual(2);
    });

    it('collects actions from nested describe blocks', () => {
      const flow = makeMinimalFlow({
        children: [{
          name: 'Nested Suite',
          tests: [{
            id: 'tc2',
            name: 'nested test',
            nodes: [
              makeNode('n1', { type: 'navigate', url: 'https://nested.com' }),
            ],
            edges: [],
          }],
        }],
      });
      const actions = collectAllActions(flow);
      expect(actions).toHaveLength(1);
      expect((actions[0].data as { url: string }).url).toBe('https://nested.com');
    });
  });

  describe('computeRequiredImports', () => {
    it('adds Playwright test import with test always present', () => {
      const actions: ActionNode[] = [];
      const result = computeRequiredImports(actions, [], [], ['page']);
      const pwImport = result.find(i => i.moduleSpecifier === '@playwright/test');
      expect(pwImport).toBeDefined();
      expect(pwImport!.namedImports).toContain('test');
    });

    it('auto-adds expect when assertions are used', () => {
      const actions = [
        makeNode('1', {
          type: 'assertVisible',
          locator: { kind: 'inline', strategy: 'getByText', value: 'Hello' },
        }),
      ];
      const result = computeRequiredImports(actions, [], [], ['page']);
      const pwImport = result.find(i => i.moduleSpecifier === '@playwright/test');
      expect(pwImport!.namedImports).toContain('expect');
    });

    it('adds import for pageObjectRef from registry', () => {
      const actions = [
        makeNode('1', {
          type: 'pageObjectRef',
          pageObjectId: 'LoginPage',
          method: 'login',
          args: ['user', 'pass'],
        }),
      ];
      const registry: SymbolRegistry[] = [
        { symbol: 'LoginPage', moduleSpecifier: '../pages/login-page' },
      ];
      const result = computeRequiredImports(actions, registry, [], ['page']);
      const loginImport = result.find(i => i.moduleSpecifier === '../pages/login-page');
      expect(loginImport).toBeDefined();
      expect(loginImport!.namedImports).toContain('LoginPage');
    });

    it('removes import when no actions reference it', () => {
      // No actions reference LoginPage
      const actions = [
        makeNode('1', { type: 'navigate', url: 'https://example.com' }),
      ];
      const registry: SymbolRegistry[] = [
        { symbol: 'LoginPage', moduleSpecifier: '../pages/login-page' },
      ];
      const result = computeRequiredImports(actions, registry, [], ['page']);
      const loginImport = result.find(i => i.moduleSpecifier === '../pages/login-page');
      expect(loginImport).toBeUndefined();
    });

    it('merges named imports from the same module', () => {
      const actions = [
        makeNode('1', {
          type: 'pageObjectRef',
          pageObjectId: 'LoginPage',
          method: 'login',
          args: [],
        }),
        makeNode('2', {
          type: 'pageObjectRef',
          pageObjectId: 'DashboardPage',
          method: 'navigate',
          args: [],
        }),
      ];
      const registry: SymbolRegistry[] = [
        { symbol: 'LoginPage', moduleSpecifier: '../pages/pages' },
        { symbol: 'DashboardPage', moduleSpecifier: '../pages/pages' },
      ];
      const result = computeRequiredImports(actions, registry, [], ['page']);
      const pagesImport = result.find(i => i.moduleSpecifier === '../pages/pages');
      expect(pagesImport).toBeDefined();
      expect(pagesImport!.namedImports).toContain('LoginPage');
      expect(pagesImport!.namedImports).toContain('DashboardPage');
      // Alphabetically sorted
      expect(pagesImport!.namedImports[0]).toBe('DashboardPage');
      expect(pagesImport!.namedImports[1]).toBe('LoginPage');
    });

    it('prevents duplicate imports', () => {
      const actions = [
        makeNode('1', {
          type: 'pageObjectRef',
          pageObjectId: 'LoginPage',
          method: 'login',
          args: [],
        }),
        makeNode('2', {
          type: 'pageObjectRef',
          pageObjectId: 'LoginPage',
          method: 'logout',
          args: [],
        }),
      ];
      const registry: SymbolRegistry[] = [
        { symbol: 'LoginPage', moduleSpecifier: '../pages/login-page' },
      ];
      const result = computeRequiredImports(actions, registry, [], ['page']);
      const loginImport = result.find(i => i.moduleSpecifier === '../pages/login-page');
      expect(loginImport).toBeDefined();
      // Should appear exactly once
      const loginCount = loginImport!.namedImports.filter(n => n === 'LoginPage').length;
      expect(loginCount).toBe(1);
    });

    it('preserves manual imports even if no actions reference them', () => {
      const actions: ActionNode[] = [];
      const manualImports: ImportDeclaration[] = [
        { moduleSpecifier: '../utils/helpers', namedImports: ['helperFn'] },
      ];
      const result = computeRequiredImports(actions, [], manualImports, ['page']);
      const helperImport = result.find(i => i.moduleSpecifier === '../utils/helpers');
      expect(helperImport).toBeDefined();
      expect(helperImport!.namedImports).toContain('helperFn');
    });

    it('handles default imports separately from named imports', () => {
      const actions = [
        makeNode('1', {
          type: 'pageObjectRef',
          pageObjectId: 'LoginPage',
          method: 'login',
          args: [],
        }),
      ];
      const registry: SymbolRegistry[] = [
        { symbol: 'LoginPage', moduleSpecifier: '../pages/login-page', isDefault: true },
      ];
      const result = computeRequiredImports(actions, registry, [], ['page']);
      const loginImport = result.find(i => i.moduleSpecifier === '../pages/login-page');
      expect(loginImport).toBeDefined();
      expect(loginImport!.defaultImport).toBe('LoginPage');
      expect(loginImport!.namedImports).not.toContain('LoginPage');
    });

    it('sorts imports: @playwright/test first, then alphabetically', () => {
      const actions = [
        makeNode('1', {
          type: 'pageObjectRef',
          pageObjectId: 'LoginPage',
          method: 'login',
          args: [],
        }),
      ];
      const registry: SymbolRegistry[] = [
        { symbol: 'LoginPage', moduleSpecifier: '../pages/login-page' },
      ];
      const manualImports: ImportDeclaration[] = [
        { moduleSpecifier: '../utils/a-helpers', namedImports: ['fn'] },
      ];
      const result = computeRequiredImports(actions, registry, manualImports, ['page']);
      expect(result[0].moduleSpecifier).toBe('@playwright/test');
      expect(result[1].moduleSpecifier).toBe('../pages/login-page');
      expect(result[2].moduleSpecifier).toBe('../utils/a-helpers');
    });

    it('merges manual imports with auto-detected imports for same module', () => {
      const actions = [
        makeNode('1', {
          type: 'pageObjectRef',
          pageObjectId: 'LoginPage',
          method: 'login',
          args: [],
        }),
      ];
      const registry: SymbolRegistry[] = [
        { symbol: 'LoginPage', moduleSpecifier: '../pages/pages' },
      ];
      const manualImports: ImportDeclaration[] = [
        { moduleSpecifier: '../pages/pages', namedImports: ['BasePage'] },
      ];
      const result = computeRequiredImports(actions, registry, manualImports, ['page']);
      const pagesImport = result.find(i => i.moduleSpecifier === '../pages/pages');
      expect(pagesImport!.namedImports).toContain('LoginPage');
      expect(pagesImport!.namedImports).toContain('BasePage');
    });
  });

  describe('resolveFlowImports', () => {
    it('computes imports from a complete flow', () => {
      const flow = makeMinimalFlow({
        tests: [{
          id: 'tc1',
          name: 'test assertions',
          nodes: [
            makeNode('1', {
              type: 'assertVisible',
              locator: { kind: 'inline', strategy: 'getByText', value: 'Hello' },
            }),
          ],
          edges: [],
        }],
      });
      const result = resolveFlowImports(flow);
      const pwImport = result.find(i => i.moduleSpecifier === '@playwright/test');
      expect(pwImport).toBeDefined();
      expect(pwImport!.namedImports).toContain('test');
      expect(pwImport!.namedImports).toContain('expect');
    });

    it('auto-adds pageObjectRef imports from registry', () => {
      const flow = makeMinimalFlow({
        tests: [{
          id: 'tc1',
          name: 'test with page object',
          nodes: [
            makeNode('1', {
              type: 'pageObjectRef',
              pageObjectId: 'LoginPage',
              method: 'login',
              args: ['admin', 'password'],
            }),
          ],
          edges: [],
        }],
      });
      const registry: SymbolRegistry[] = [
        { symbol: 'LoginPage', moduleSpecifier: '../pages/login-page' },
      ];
      const result = resolveFlowImports(flow, registry);
      const loginImport = result.find(i => i.moduleSpecifier === '../pages/login-page');
      expect(loginImport).toBeDefined();
      expect(loginImport!.namedImports).toContain('LoginPage');
    });

    it('removes import when last referencing node is removed', () => {
      // Flow with no actions referencing LoginPage
      const flow = makeMinimalFlow({
        tests: [{
          id: 'tc1',
          name: 'simple test',
          nodes: [
            makeNode('1', { type: 'navigate', url: 'https://example.com' }),
          ],
          edges: [],
        }],
      });
      const registry: SymbolRegistry[] = [
        { symbol: 'LoginPage', moduleSpecifier: '../pages/login-page' },
      ];
      const result = resolveFlowImports(flow, registry);
      const loginImport = result.find(i => i.moduleSpecifier === '../pages/login-page');
      expect(loginImport).toBeUndefined();
    });
  });

  describe('mergeImportDeclarations', () => {
    it('merges named imports and deduplicates', () => {
      const a: ImportDeclaration = {
        moduleSpecifier: './module',
        namedImports: ['A', 'B'],
      };
      const b: ImportDeclaration = {
        moduleSpecifier: './module',
        namedImports: ['B', 'C'],
      };
      const result = mergeImportDeclarations(a, b);
      expect(result.namedImports).toEqual(['A', 'B', 'C']);
    });

    it('preserves default import from either side', () => {
      const a: ImportDeclaration = {
        moduleSpecifier: './module',
        namedImports: [],
        defaultImport: 'Default',
      };
      const b: ImportDeclaration = {
        moduleSpecifier: './module',
        namedImports: ['Named'],
      };
      const result = mergeImportDeclarations(a, b);
      expect(result.defaultImport).toBe('Default');
      expect(result.namedImports).toEqual(['Named']);
    });

    it('throws on different module specifiers', () => {
      const a: ImportDeclaration = { moduleSpecifier: './a', namedImports: [] };
      const b: ImportDeclaration = { moduleSpecifier: './b', namedImports: [] };
      expect(() => mergeImportDeclarations(a, b)).toThrow();
    });
  });

  describe('generateTestFile with autoImports', () => {
    // Integration: verify that generateTestFile produces correct imports
    // when autoImports option is enabled
    it('generates auto-imports in the output', async () => {
      // Dynamic import to avoid circular issues at test time
      const { generateTestFile } = await import('../../generator/test-generator.js');

      const flow = makeMinimalFlow({
        tests: [{
          id: 'tc1',
          name: 'login test',
          nodes: [
            makeNode('1', {
              type: 'pageObjectRef',
              pageObjectId: 'LoginPage',
              method: 'login',
              args: ['admin', 'pass'],
            }),
            makeNode('2', {
              type: 'assertVisible',
              locator: { kind: 'inline', strategy: 'getByText', value: 'Welcome' },
            }),
          ],
          edges: [{ id: 'e1', source: '1', target: '2' }],
        }],
      });

      const registry: SymbolRegistry[] = [
        { symbol: 'LoginPage', moduleSpecifier: '../pages/login-page' },
      ];

      const output = generateTestFile(flow, {
        autoImports: true,
        registry,
      });

      // Should have @playwright/test import with test and expect
      expect(output).toContain("import { expect, test } from '@playwright/test';");
      // Should have LoginPage import
      expect(output).toContain("import { LoginPage } from '../pages/login-page';");
    });

    it('does not duplicate imports when autoImports is false', async () => {
      const { generateTestFile } = await import('../../generator/test-generator.js');

      const flow = makeMinimalFlow({
        imports: [
          { moduleSpecifier: '@playwright/test', namedImports: ['test', 'expect'] },
          { moduleSpecifier: '../pages/login-page', namedImports: ['LoginPage'] },
        ],
        tests: [{
          id: 'tc1',
          name: 'test',
          nodes: [makeNode('1', { type: 'navigate', url: 'https://example.com' })],
          edges: [],
        }],
      });

      const output = generateTestFile(flow);
      // Without autoImports, should use the flow's imports as-is
      expect(output).toContain("import { test, expect } from '@playwright/test';");
      expect(output).toContain("import { LoginPage } from '../pages/login-page';");
    });
  });
});
