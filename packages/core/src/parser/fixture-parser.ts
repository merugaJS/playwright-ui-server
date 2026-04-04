import {
  Project,
  SyntaxKind,
  Node,
  SourceFile,
  CallExpression,
} from 'ts-morph';
import fs from 'node:fs';
import path from 'node:path';
import type { FixtureDefinition } from '../model/fixture.js';

/**
 * Built-in Playwright fixtures that are always available.
 */
const BUILT_IN_FIXTURES: FixtureDefinition[] = [
  { name: 'page', filePath: '@playwright/test', type: 'Page', isBuiltIn: true, dependencies: [] },
  { name: 'context', filePath: '@playwright/test', type: 'BrowserContext', isBuiltIn: true, dependencies: [] },
  { name: 'browser', filePath: '@playwright/test', type: 'Browser', isBuiltIn: true, dependencies: [] },
  { name: 'browserName', filePath: '@playwright/test', type: 'string', isBuiltIn: true, dependencies: [] },
  { name: 'request', filePath: '@playwright/test', type: 'APIRequestContext', isBuiltIn: true, dependencies: [] },
];

export function getBuiltInFixtures(): FixtureDefinition[] {
  return [...BUILT_IN_FIXTURES];
}

/**
 * Parse a fixture file that uses test.extend<T>({...}) pattern.
 * Returns an array of custom fixture definitions found in the file.
 */
export function parseFixtureFile(filePath: string): FixtureDefinition[] {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  const sourceFile = project.addSourceFileAtPath(filePath);

  return parseFixtureSource(sourceFile, filePath);
}

/**
 * Parse fixture definitions from an already-loaded SourceFile.
 * Useful when the caller already has a ts-morph Project/SourceFile.
 */
export function parseFixtureSource(sourceFile: SourceFile, filePath: string): FixtureDefinition[] {
  const fixtures: FixtureDefinition[] = [];

  // Find all .extend() calls
  const extendCalls = findExtendCalls(sourceFile);

  for (const call of extendCalls) {
    const args = call.getArguments();
    if (args.length === 0) continue;

    const firstArg = args[0];
    if (!Node.isObjectLiteralExpression(firstArg)) continue;

    // Extract type map from the type parameter: extend<{ name: Type; ... }>
    const typeMap = extractTypeMap(call);

    // Detect worker-scoped fixture names from the second type parameter:
    // extend<TestFixtures, WorkerFixtures>() — properties from W are worker-scoped
    const workerFixtureNames = extractWorkerTypeNames(call);

    // Detect scope from a second argument like { scope: 'worker' }
    const defaultScope = extractScopeFromOptions(call);

    // Each property in the object is a fixture definition
    for (const prop of firstArg.getProperties()) {
      if (Node.isPropertyAssignment(prop) || Node.isMethodDeclaration(prop)) {
        const name = prop.getName ? prop.getName() : '';
        if (!name) continue;

        // Get type from type map or fall back to full type parameter text
        const type = typeMap.get(name) ?? extractFixtureTypeFallback(call) ?? 'unknown';

        // Extract setup/teardown code, scope, and auto from the fixture function body
        const { setupCode, teardownCode, scope, auto } = extractFixtureBody(prop);

        // Extract dependencies from the fixture function's destructured parameter
        const dependencies = extractFixtureDependencies(prop);

        // Determine final scope: explicit scope in options > worker type param > default
        const resolvedScope = scope
          ?? (workerFixtureNames.has(name) ? 'worker' : null)
          ?? defaultScope
          ?? undefined;

        fixtures.push({
          name,
          filePath,
          type,
          isBuiltIn: false,
          setupCode: setupCode || undefined,
          teardownCode: teardownCode || undefined,
          scope: resolvedScope,
          auto: auto || undefined,
          dependencies,
        });
      }
    }
  }

  return fixtures;
}

/**
 * Scan a project directory for fixture files.
 * Looks for files containing .extend pattern (but not spec/test files).
 */
export function findFixtureFiles(rootDir: string, testDir: string): string[] {
  const files: string[] = [];

  function walk(dir: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        walk(fullPath);
      } else if (entry.isFile() && /\.(ts|js)$/.test(entry.name)) {
        // Skip spec/test files — we only want fixture definition files
        if (/\.(spec|test)\.(ts|js)$/.test(entry.name)) continue;
        // Quick check: read file content for .extend pattern
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          if (content.includes('.extend')) {
            files.push(fullPath);
          }
        } catch {
          // skip unreadable files
        }
      }
    }
  }

  walk(testDir);

  // Also check root-level fixtures/ directory
  const fixturesDir = path.join(rootDir, 'fixtures');
  if (fs.existsSync(fixturesDir) && !fixturesDir.startsWith(testDir)) {
    walk(fixturesDir);
  }

  return files;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function findExtendCalls(sourceFile: SourceFile): CallExpression[] {
  const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
  return calls.filter((call) => {
    const expr = call.getExpression();
    const text = expr.getText();
    // Match: test.extend, base.extend, baseTest.extend, etc.
    return /\w+\.extend/.test(text);
  });
}

/**
 * Extract a map of fixture name -> type from the type parameter of .extend<T>().
 * For example: extend<{ myPage: Page; apiClient: APIRequestContext }>
 * returns Map { 'myPage' => 'Page', 'apiClient' => 'APIRequestContext' }
 */
function extractTypeMap(call: CallExpression): Map<string, string> {
  const typeMap = new Map<string, string>();

  const typeArgs = call.getTypeArguments();
  if (typeArgs.length === 0) return typeMap;

  // Process both type parameters: extend<TestFixtures, WorkerFixtures>()
  for (const typeNode of typeArgs) {
    extractTypeMembersInto(typeNode, typeMap, call);
  }

  return typeMap;
}

/**
 * Extract property name -> type mappings from a type node into the given map.
 */
function extractTypeMembersInto(
  typeNode: Node,
  typeMap: Map<string, string>,
  call: CallExpression
): void {
  // Handle inline type literal: { name: Type; ... }
  if (Node.isTypeLiteral(typeNode)) {
    for (const member of typeNode.getMembers()) {
      if (Node.isPropertySignature(member)) {
        const name = member.getName();
        const typeAnnotation = member.getTypeNode();
        if (name && typeAnnotation) {
          typeMap.set(name, typeAnnotation.getText());
        }
      }
    }
  } else {
    // It might be a type reference like extend<MyFixtures> —
    // try to resolve the type's properties via the type checker
    const symbol = typeNode.getType().getProperties();
    if (symbol.length > 0) {
      for (const prop of symbol) {
        const declarations = prop.getDeclarations();
        if (declarations.length > 0) {
          const decl = declarations[0];
          if (Node.isPropertySignature(decl)) {
            const typeAnnotation = decl.getTypeNode();
            typeMap.set(prop.getName(), typeAnnotation?.getText() ?? 'unknown');
          } else {
            // Fall back to type checker
            const propType = prop.getTypeAtLocation(call);
            typeMap.set(prop.getName(), propType.getText());
          }
        }
      }
    }
  }
}

/**
 * Extract the set of fixture names declared in the second type parameter of extend<T, W>().
 * These are worker-scoped fixtures by convention in Playwright.
 */
function extractWorkerTypeNames(call: CallExpression): Set<string> {
  const names = new Set<string>();

  const typeArgs = call.getTypeArguments();
  if (typeArgs.length < 2) return names;

  const workerTypeNode = typeArgs[1];

  // Handle inline type literal: { name: Type; ... }
  if (Node.isTypeLiteral(workerTypeNode)) {
    for (const member of workerTypeNode.getMembers()) {
      if (Node.isPropertySignature(member)) {
        const name = member.getName();
        if (name) names.add(name);
      }
    }
  } else {
    // Try to resolve via type checker for type references
    const symbol = workerTypeNode.getType().getProperties();
    for (const prop of symbol) {
      names.add(prop.getName());
    }
  }

  return names;
}

/**
 * Fallback: return the full type parameter text when we can't resolve individual properties.
 */
function extractFixtureTypeFallback(call: CallExpression): string | null {
  const typeArgs = call.getTypeArguments();
  if (typeArgs.length > 0) {
    return typeArgs[0].getText();
  }
  return null;
}

/**
 * Extract the scope from a second options argument like [fn, { scope: 'worker' }].
 * In Playwright, fixtures can be defined as arrays: [async ({}, use) => {...}, { scope: 'worker' }].
 */
function extractScopeFromOptions(call: CallExpression): 'test' | 'worker' | null {
  // This checks for scope at the call level — individual fixture scopes
  // are handled in extractFixtureBody.
  return null;
}

/**
 * Extract setup code, teardown code, and scope from a fixture property.
 * Recognizes the pattern: async ({ deps }, use) => { setup; await use(value); teardown; }
 * Also recognizes array form: [async ({ deps }, use) => { ... }, { scope: 'worker' }]
 */
function extractFixtureBody(
  prop: Node
): { setupCode: string; teardownCode: string; scope: 'test' | 'worker' | null; auto: boolean } {
  let result = { setupCode: '', teardownCode: '', scope: null as 'test' | 'worker' | null, auto: false };

  // Get the initializer (the value assigned to the property)
  let initializer: Node | undefined;
  if (Node.isPropertyAssignment(prop)) {
    initializer = prop.getInitializer();
  }

  if (!initializer) return result;

  // Handle array form: [async (deps, use) => { ... }, { scope: 'worker', auto: true }]
  if (Node.isArrayLiteralExpression(initializer)) {
    const elements = initializer.getElements();
    if (elements.length >= 1) {
      // First element is the function
      const fnElement = elements[0];
      const fnResult = extractSetupTeardownFromFunction(fnElement);
      result.setupCode = fnResult.setupCode;
      result.teardownCode = fnResult.teardownCode;

      // Second element may contain options like { scope: 'worker', auto: true }
      if (elements.length >= 2) {
        const opts = elements[1];
        if (Node.isObjectLiteralExpression(opts)) {
          for (const optProp of opts.getProperties()) {
            if (!Node.isPropertyAssignment(optProp)) continue;
            const optName = optProp.getName();
            const optInit = optProp.getInitializer();
            if (!optInit) continue;

            if (optName === 'scope') {
              const scopeText = optInit.getText().replace(/['"]/g, '');
              if (scopeText === 'worker' || scopeText === 'test') {
                result.scope = scopeText;
              }
            } else if (optName === 'auto') {
              const autoText = optInit.getText().trim();
              if (autoText === 'true') {
                result.auto = true;
              }
            }
          }
        }
      }
    }
    return result;
  }

  // Handle direct function form: async ({ deps }, use) => { ... }
  const fnResult = extractSetupTeardownFromFunction(initializer);
  result.setupCode = fnResult.setupCode;
  result.teardownCode = fnResult.teardownCode;
  return result;
}

/**
 * Given a function node (arrow function or function expression),
 * split the body into setup (before `use()`) and teardown (after `use()`).
 */
function extractSetupTeardownFromFunction(
  fnNode: Node
): { setupCode: string; teardownCode: string; scope: 'test' | 'worker' | null } {
  const result = { setupCode: '', teardownCode: '', scope: null as 'test' | 'worker' | null };

  if (!Node.isArrowFunction(fnNode) && !Node.isFunctionExpression(fnNode)) {
    return result;
  }

  const body = fnNode.getBody();
  if (!body || !Node.isBlock(body)) return result;

  const statements = body.getStatements();
  const setupLines: string[] = [];
  const teardownLines: string[] = [];
  let foundUse = false;

  for (const stmt of statements) {
    const text = stmt.getText().trim();

    // Check if this statement contains a `use(` call (e.g., `await use(...)`)
    if (!foundUse && containsUseCall(stmt)) {
      foundUse = true;
      continue; // Skip the use() call itself
    }

    if (!foundUse) {
      setupLines.push(text);
    } else {
      teardownLines.push(text);
    }
  }

  result.setupCode = setupLines.join('\n');
  result.teardownCode = teardownLines.join('\n');
  return result;
}

/**
 * Extract dependency names from a fixture property's function parameter.
 * Recognizes: async ({ dep1, dep2 }, use) => {} and array form [async ({ dep1 }, use) => {}, opts]
 */
function extractFixtureDependencies(prop: Node): string[] {
  let initializer: Node | undefined;
  if (Node.isPropertyAssignment(prop)) {
    initializer = prop.getInitializer();
  }
  if (!initializer) return [];

  // Handle array form: [fn, options]
  let fnNode: Node | undefined;
  if (Node.isArrayLiteralExpression(initializer)) {
    const elements = initializer.getElements();
    if (elements.length >= 1) {
      fnNode = elements[0];
    }
  } else {
    fnNode = initializer;
  }

  if (!fnNode) return [];
  if (!Node.isArrowFunction(fnNode) && !Node.isFunctionExpression(fnNode)) return [];

  const params = fnNode.getParameters();
  if (params.length === 0) return [];

  const firstParam = params[0];
  // Check if it's a destructuring pattern: { dep1, dep2 }
  const nameNode = firstParam.getNameNode();
  if (Node.isObjectBindingPattern(nameNode)) {
    return nameNode.getElements().map(el => el.getName()).filter(n => n.length > 0);
  }

  return [];
}

/**
 * Check whether a statement contains a call to `use(...)`.
 */
function containsUseCall(node: Node): boolean {
  // Direct: `await use(value)` or `use(value)`
  const calls = node.getDescendantsOfKind(SyntaxKind.CallExpression);
  for (const call of calls) {
    const expr = call.getExpression();
    if (expr.getText() === 'use') return true;
  }
  return false;
}
