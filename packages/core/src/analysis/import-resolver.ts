import type { ActionNode, ActionData } from '../model/action-node.js';
import type { ImportDeclaration, TestFlow, TestCase, DescribeBlock, ParameterizedTest } from '../model/test-flow.js';

/**
 * Registry entry describing where an importable symbol comes from.
 */
export interface SymbolRegistry {
  /** Symbol name, e.g. 'LoginPage' */
  symbol: string;
  /** Module specifier, e.g. '../pages/login-page' */
  moduleSpecifier: string;
  /** Whether this is a default import rather than named */
  isDefault?: boolean;
}

/**
 * Collect all action nodes from a TestFlow, including nested structures
 * (describe blocks, loops, conditionals, groups, try-catch, parameterized tests, hooks).
 */
export function collectAllActions(flow: TestFlow): ActionNode[] {
  const actions: ActionNode[] = [];

  const collectFromNodes = (nodes: ActionNode[]) => {
    for (const node of nodes) {
      actions.push(node);
      collectNestedActions(node.data, actions);
    }
  };

  // Hooks
  if (flow.beforeAll) collectFromNodes(flow.beforeAll);
  if (flow.beforeEach) collectFromNodes(flow.beforeEach);
  if (flow.afterEach) collectFromNodes(flow.afterEach);
  if (flow.afterAll) collectFromNodes(flow.afterAll);

  // Tests
  for (const tc of flow.tests) {
    collectFromTestCase(tc, actions);
  }

  // Parameterized tests
  if (flow.parameterizedTests) {
    for (const pt of flow.parameterizedTests) {
      collectFromParameterizedTest(pt, actions);
    }
  }

  // Nested describe blocks
  if (flow.children) {
    for (const child of flow.children) {
      collectFromDescribeBlock(child, actions);
    }
  }

  return actions;
}

function collectFromTestCase(tc: TestCase, actions: ActionNode[]) {
  for (const node of tc.nodes) {
    actions.push(node);
    collectNestedActions(node.data, actions);
  }
}

function collectFromParameterizedTest(pt: ParameterizedTest, actions: ActionNode[]) {
  for (const node of pt.testBody) {
    actions.push(node);
    collectNestedActions(node.data, actions);
  }
}

function collectFromDescribeBlock(block: DescribeBlock, actions: ActionNode[]) {
  const collectFromNodes = (nodes: ActionNode[]) => {
    for (const node of nodes) {
      actions.push(node);
      collectNestedActions(node.data, actions);
    }
  };

  if (block.beforeAll) collectFromNodes(block.beforeAll);
  if (block.beforeEach) collectFromNodes(block.beforeEach);
  if (block.afterEach) collectFromNodes(block.afterEach);
  if (block.afterAll) collectFromNodes(block.afterAll);

  for (const tc of block.tests) {
    collectFromTestCase(tc, actions);
  }

  if (block.parameterizedTests) {
    for (const pt of block.parameterizedTests) {
      collectFromParameterizedTest(pt, actions);
    }
  }

  if (block.children) {
    for (const child of block.children) {
      collectFromDescribeBlock(child, actions);
    }
  }
}

/**
 * Recursively collect actions nested within compound action types
 * (loops, conditionals, groups, try-catch).
 */
function collectNestedActions(data: ActionData, actions: ActionNode[]) {
  switch (data.type) {
    case 'loop':
      for (const child of data.body) {
        actions.push(child);
        collectNestedActions(child.data, actions);
      }
      break;
    case 'conditional':
      for (const child of data.thenChildren) {
        actions.push(child);
        collectNestedActions(child.data, actions);
      }
      if (data.elseIfBranches) {
        for (const branch of data.elseIfBranches) {
          for (const child of branch.children) {
            actions.push(child);
            collectNestedActions(child.data, actions);
          }
        }
      }
      if (data.elseChildren) {
        for (const child of data.elseChildren) {
          actions.push(child);
          collectNestedActions(child.data, actions);
        }
      }
      break;
    case 'group':
      for (const child of data.children) {
        actions.push(child);
        collectNestedActions(child.data, actions);
      }
      break;
    case 'tryCatch':
      for (const child of data.tryChildren) {
        actions.push(child);
        collectNestedActions(child.data, actions);
      }
      if (data.catchChildren) {
        for (const child of data.catchChildren) {
          actions.push(child);
          collectNestedActions(child.data, actions);
        }
      }
      if (data.finallyChildren) {
        for (const child of data.finallyChildren) {
          actions.push(child);
          collectNestedActions(child.data, actions);
        }
      }
      break;
  }
}

/**
 * Extract symbol references from all actions in the flow.
 * Returns a Set of symbol names that are referenced by actions.
 */
export function extractReferencedSymbols(actions: ActionNode[]): Set<string> {
  const symbols = new Set<string>();

  for (const node of actions) {
    const d = node.data;

    // pageObjectRef actions reference the page object class
    if (d.type === 'pageObjectRef') {
      symbols.add(d.pageObjectId);
    }

    // codeBlock may reference arbitrary symbols — scan for identifiers
    // that match known registry entries (handled at merge time)
    if (d.type === 'codeBlock') {
      // We'll extract potential identifiers from code blocks.
      // The caller can match these against the registry.
      const identifiers = extractIdentifiersFromCode(d.code);
      for (const id of identifiers) {
        symbols.add(id);
      }
    }
  }

  return symbols;
}

/**
 * Extract potential identifiers from a code string.
 * This is a heuristic — it finds PascalCase identifiers (likely class names)
 * and known function-call patterns.
 */
export function extractIdentifiersFromCode(code: string): string[] {
  const identifiers: string[] = [];

  // Match PascalCase identifiers (class/type references like LoginPage, TestHelper)
  const pascalCaseRegex = /\b([A-Z][a-zA-Z0-9]+)\b/g;
  let match: RegExpExecArray | null;
  while ((match = pascalCaseRegex.exec(code)) !== null) {
    identifiers.push(match[1]);
  }

  // Match function calls that look like utility functions: camelCase followed by (
  const funcCallRegex = /\b([a-z][a-zA-Z0-9]*)\s*\(/g;
  while ((match = funcCallRegex.exec(code)) !== null) {
    // Skip common Playwright built-ins and JS keywords
    const builtins = new Set([
      'await', 'async', 'const', 'let', 'var', 'if', 'else', 'for', 'while',
      'return', 'throw', 'new', 'typeof', 'instanceof', 'delete', 'void',
      'page', 'expect', 'test', 'request', 'context', 'browser',
      'route', 'dialog', 'console', 'setTimeout', 'setInterval',
      'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent',
      'decodeURIComponent', 'encodeURI', 'decodeURI', 'JSON', 'Math',
      'Array', 'Object', 'String', 'Number', 'Boolean', 'Date', 'RegExp',
      'Promise', 'map', 'filter', 'reduce', 'forEach', 'find', 'some',
      'every', 'push', 'pop', 'shift', 'unshift', 'splice', 'slice',
      'join', 'split', 'replace', 'match', 'trim', 'includes',
      'indexOf', 'toString', 'valueOf', 'keys', 'values', 'entries',
    ]);
    if (!builtins.has(match[1])) {
      identifiers.push(match[1]);
    }
  }

  return [...new Set(identifiers)];
}

/**
 * Determine which Playwright built-in imports are needed based on action types.
 * Returns a set of named imports for '@playwright/test'.
 */
export function computePlaywrightImports(actions: ActionNode[], fixtures: string[]): Set<string> {
  const needed = new Set<string>();

  // 'test' is always needed (for test.describe, test(), etc.)
  needed.add('test');

  let hasAssertions = false;

  for (const node of actions) {
    const d = node.data;

    // Check if any action uses expect
    if (d.type.startsWith('assert') || d.type === 'responseAssertion') {
      hasAssertions = true;
    }
  }

  if (hasAssertions) {
    needed.add('expect');
  }

  // If fixtures include 'request', we may need APIRequestContext type
  // If fixtures include 'browser', we may need Browser type
  // These are typically auto-provided by Playwright's test runner,
  // but the import of 'test' and 'expect' covers the main cases.

  return needed;
}

/**
 * Compute required imports by scanning all actions against a symbol registry.
 * This is the main entry point for auto-import resolution.
 *
 * @param actions - All action nodes from the flow
 * @param registry - Available symbols and their module specifiers
 * @param manualImports - Manually added imports that should always be preserved
 * @param fixtures - Fixture names used in the test
 * @returns Merged, deduplicated array of ImportDeclarations
 */
export function computeRequiredImports(
  actions: ActionNode[],
  registry: SymbolRegistry[],
  manualImports: ImportDeclaration[],
  fixtures: string[],
): ImportDeclaration[] {
  // 1. Compute Playwright built-in imports
  const playwrightNamedImports = computePlaywrightImports(actions, fixtures);

  // 2. Extract referenced symbols from actions
  const referencedSymbols = extractReferencedSymbols(actions);

  // 3. Build a map from moduleSpecifier to import declaration
  const importMap = new Map<string, ImportDeclaration>();

  // Add Playwright base import
  importMap.set('@playwright/test', {
    moduleSpecifier: '@playwright/test',
    namedImports: [...playwrightNamedImports].sort(),
  });

  // 4. Match referenced symbols against the registry
  const registryMap = new Map<string, SymbolRegistry>();
  for (const entry of registry) {
    registryMap.set(entry.symbol, entry);
  }

  for (const symbol of referencedSymbols) {
    const entry = registryMap.get(symbol);
    if (!entry) continue;

    const existing = importMap.get(entry.moduleSpecifier);
    if (existing) {
      if (entry.isDefault) {
        existing.defaultImport = symbol;
      } else {
        if (!existing.namedImports.includes(symbol)) {
          existing.namedImports.push(symbol);
          existing.namedImports.sort();
        }
      }
    } else {
      importMap.set(entry.moduleSpecifier, {
        moduleSpecifier: entry.moduleSpecifier,
        namedImports: entry.isDefault ? [] : [symbol],
        defaultImport: entry.isDefault ? symbol : undefined,
      });
    }
  }

  // 5. Merge manual imports (always preserved)
  for (const manual of manualImports) {
    const existing = importMap.get(manual.moduleSpecifier);
    if (existing) {
      // Merge named imports
      for (const name of manual.namedImports) {
        if (!existing.namedImports.includes(name)) {
          existing.namedImports.push(name);
        }
      }
      existing.namedImports.sort();

      // Preserve default import
      if (manual.defaultImport && !existing.defaultImport) {
        existing.defaultImport = manual.defaultImport;
      }

      // Preserve namespace import
      if (manual.namespaceImport && !existing.namespaceImport) {
        existing.namespaceImport = manual.namespaceImport;
      }

      // Preserve side-effect flag
      if (manual.isSideEffect) {
        existing.isSideEffect = true;
      }
    } else {
      // Clone the manual import to avoid mutation
      importMap.set(manual.moduleSpecifier, { ...manual, namedImports: [...manual.namedImports] });
    }
  }

  // 6. Convert map to sorted array
  // Order: @playwright/test first, then alphabetically by moduleSpecifier
  const result = [...importMap.values()];
  result.sort((a, b) => {
    if (a.moduleSpecifier === '@playwright/test') return -1;
    if (b.moduleSpecifier === '@playwright/test') return 1;
    return a.moduleSpecifier.localeCompare(b.moduleSpecifier);
  });

  return result;
}

/**
 * Resolve imports for a TestFlow. This is a convenience function that:
 * 1. Collects all actions from the flow
 * 2. Computes required imports
 * 3. Returns the merged import list
 *
 * @param flow - The TestFlow to resolve imports for
 * @param registry - Available symbols and their module specifiers
 * @param manualImports - Manually added imports (override; always preserved)
 * @returns Array of ImportDeclarations
 */
export function resolveFlowImports(
  flow: TestFlow,
  registry: SymbolRegistry[] = [],
  manualImports: ImportDeclaration[] = [],
): ImportDeclaration[] {
  const allActions = collectAllActions(flow);
  return computeRequiredImports(allActions, registry, manualImports, flow.fixtures);
}

/**
 * Merge two import declarations for the same module specifier.
 * Returns a new ImportDeclaration with merged named imports (sorted, deduplicated).
 */
export function mergeImportDeclarations(a: ImportDeclaration, b: ImportDeclaration): ImportDeclaration {
  if (a.moduleSpecifier !== b.moduleSpecifier) {
    throw new Error(`Cannot merge imports from different modules: ${a.moduleSpecifier} vs ${b.moduleSpecifier}`);
  }

  const namedImports = [...new Set([...a.namedImports, ...b.namedImports])].sort();

  return {
    moduleSpecifier: a.moduleSpecifier,
    namedImports,
    defaultImport: a.defaultImport || b.defaultImport,
    namespaceImport: a.namespaceImport || b.namespaceImport,
    isSideEffect: a.isSideEffect || b.isSideEffect,
  };
}
