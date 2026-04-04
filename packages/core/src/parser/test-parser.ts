import {
  Project,
  SyntaxKind,
  Node,
  CallExpression,
  SourceFile,
  Statement,
  ExpressionStatement,
  AwaitExpression,
  PropertyAccessExpression,
  ForStatement,
  ForOfStatement,
  ForInStatement,
  IfStatement,
  VariableStatement,
  TryStatement,
  WhileStatement,
  DoStatement,
  SwitchStatement,
} from 'ts-morph';
import crypto from 'node:crypto';
import type { ActionNode, ActionData, DeclaredVariable, LocatorRef, LocatorStep, LocatorModifier, NetworkRouteDataType, FulfillOptionsType, ContinueOverridesType, NewTabDataType, DialogHandlerDataType, FileUploadDataType, StorageStateDataType, CookieActionDataType, CookieObjectType, FileDownloadDataType, ParameterizedTestDataType, ResponseAssertionDataType, BrowserStorageDataType, NewContextDataType, UtilityCallDataType, IterationDataType, SwitchCaseType, InlineDataDataType } from '../model/action-node.js';
import type { TestFlow, TestCase, ImportDeclaration, FlowEdge, DescribeBlock, TestAnnotation, DescribeMode, FixtureOverrideValue, ParameterizedTest, ExternalDataSource } from '../model/test-flow.js';

let nodeCounter = 0;
function nextNodeId(): string {
  return `node_${++nodeCounter}`;
}

function resetNodeCounter(): void {
  nodeCounter = 0;
}

// Module-level utility map set during parseTestFile and read by parseStatement
let activeUtilityMap: Map<string, UtilityFunctionEntry> = new Map();

/**
 * Registry entry for a known utility function that can be parsed as a utilityCall node.
 */
export interface UtilityFunctionEntry {
  /** Function name as it appears in the source code */
  functionName: string;
  /** Module specifier from which the function is imported */
  modulePath: string;
  /** Parameter names (in order) for labeling arguments */
  parameterNames?: string[];
}

/**
 * Parse a Playwright test file into a TestFlow model.
 *
 * @param knownPageObjects Optional map of variable name -> page object class ID.
 *   e.g., `'loginPage' -> 'LoginPage'`. When provided, these are merged with
 *   auto-discovered mappings from fixtures and constructor calls in the file.
 * @param knownUtilities Optional array of utility function entries.
 *   When provided, calls to these functions are parsed as `utilityCall` nodes
 *   instead of falling through to `codeBlock`.
 */
export function parseTestFile(filePath: string, knownPageObjects?: Map<string, string>, knownUtilities?: UtilityFunctionEntry[]): TestFlow {
  resetNodeCounter();

  const project = new Project({ skipAddingFilesFromTsConfig: true });
  const sourceFile = project.addSourceFileAtPath(filePath);
  const content = sourceFile.getFullText();
  const contentHash = crypto.createHash('sha256').update(content).digest('hex');

  const imports = extractImports(sourceFile);
  const warnings: string[] = [];

  // Build page object map: start with auto-discovered, then merge caller-supplied
  const pageObjectMap = discoverPageObjects(sourceFile);
  if (knownPageObjects) {
    for (const [varName, classId] of knownPageObjects) {
      pageObjectMap.set(varName, classId);
    }
  }

  // Build utility function map from known utilities + auto-discovered imports
  const utilityMap = new Map<string, UtilityFunctionEntry>();
  if (knownUtilities) {
    for (const entry of knownUtilities) {
      utilityMap.set(entry.functionName, entry);
    }
  }
  // Auto-discover utility functions from imports (named imports from non-playwright modules)
  for (const imp of imports) {
    const mod = imp.moduleSpecifier;
    // Skip playwright, node built-ins, and side-effect imports
    if (mod.startsWith('@playwright') || mod.startsWith('node:') || imp.isSideEffect) continue;
    for (const name of imp.namedImports) {
      // Only add if not already known (caller-supplied takes priority)
      if (!utilityMap.has(name)) {
        // Skip PascalCase (likely classes/page objects) — utility functions are camelCase
        if (/^[A-Z]/.test(name)) continue;
        utilityMap.set(name, { functionName: name, modulePath: mod });
      }
    }
    // Default imports that are camelCase are also likely utility functions
    if (imp.defaultImport && !utilityMap.has(imp.defaultImport) && /^[a-z]/.test(imp.defaultImport)) {
      utilityMap.set(imp.defaultImport, { functionName: imp.defaultImport, modulePath: mod });
    }
  }
  activeUtilityMap = utilityMap;

  // Find test.describe blocks
  const describeInfo = findDescribeBlock(sourceFile);
  const describeName = describeInfo?.name ?? filePath.split('/').pop()?.replace(/\.(spec|test)\.ts$/, '') ?? 'Tests';

  // Find beforeAll / afterAll / beforeEach / afterEach
  const beforeAll = findAllHookStatements(sourceFile, 'beforeAll', pageObjectMap);
  const beforeEach = findHookStatements(sourceFile, 'beforeEach', pageObjectMap);
  const afterEach = findHookStatements(sourceFile, 'afterEach', pageObjectMap);
  const afterAll = findAllHookStatements(sourceFile, 'afterAll', pageObjectMap);

  // Find parameterized test patterns (for...of / forEach wrapping test() calls)
  const parameterizedTests = findParameterizedTests(sourceFile, warnings, pageObjectMap);

  // Find test() calls (excluding those inside parameterized loops)
  const tests = findTestCases(sourceFile, warnings, pageObjectMap);

  // Find nested describe blocks
  const children = describeInfo
    ? findNestedDescribes(describeInfo.callExpression, warnings, pageObjectMap)
    : [];

  // Extract fixture names from test callbacks
  const fixtures = extractFixtureNames(sourceFile);

  // Extract test.use() fixture overrides from the describe block body
  const fixtureOverrides = describeInfo
    ? extractFixtureOverridesFromDescribe(describeInfo.callExpression)
    : extractTopLevelFixtureOverrides(sourceFile);

  // Extract test.setTimeout() at the describe level
  const describeTimeout = describeInfo
    ? extractDescribeTimeout(describeInfo.callExpression)
    : extractTopLevelTimeout(sourceFile);

  // Extract external data file imports (JSON, CSV, etc.)
  const externalDataSources = extractExternalDataSources(sourceFile);

  const relativePath = filePath;
  const id = Buffer.from(relativePath).toString('base64url');

  const describeMode = describeInfo?.mode;

  return {
    id,
    filePath: relativePath,
    describe: describeName,
    ...(describeMode && describeMode !== 'default' ? { describeMode } : {}),
    ...(describeTimeout !== undefined ? { timeout: describeTimeout } : {}),
    tests,
    ...(parameterizedTests.length > 0 ? { parameterizedTests } : {}),
    beforeAll: beforeAll.length > 0 ? beforeAll : undefined,
    beforeEach: beforeEach.length > 0 ? beforeEach : undefined,
    afterEach: afterEach.length > 0 ? afterEach : undefined,
    afterAll: afterAll.length > 0 ? afterAll : undefined,
    children: children.length > 0 ? children : undefined,
    imports,
    fixtures,
    ...(fixtureOverrides && Object.keys(fixtureOverrides).length > 0 ? { fixtureOverrides } : {}),
    ...(externalDataSources.length > 0 ? { externalDataSources } : {}),
    metadata: {
      contentHash,
      lastParsedAt: Date.now(),
      parseWarnings: warnings,
    },
  };
}

function extractImports(sourceFile: SourceFile): ImportDeclaration[] {
  const imports: ImportDeclaration[] = [];

  for (const decl of sourceFile.getImportDeclarations()) {
    const moduleSpecifier = decl.getModuleSpecifierValue();
    const namedImports = decl.getNamedImports().map(n => n.getName());
    const defaultImport = decl.getDefaultImport()?.getText();
    const namespaceImport = decl.getNamespaceImport()?.getText();

    // Side-effect import: no default, no named, no namespace bindings
    const isSideEffect = !defaultImport && namedImports.length === 0 && !namespaceImport;

    imports.push({
      moduleSpecifier,
      namedImports,
      ...(defaultImport ? { defaultImport } : {}),
      ...(namespaceImport ? { namespaceImport } : {}),
      ...(isSideEffect ? { isSideEffect: true } : {}),
    });
  }

  return imports;
}

/**
 * Detect external data file imports/requires (JSON, CSV, module files).
 * Covers:
 *   import X from './path.json'
 *   import X from './path.csv'
 *   const X = require('./path.json')
 *   const X = require('./path.csv')
 */
function extractExternalDataSources(sourceFile: SourceFile): ExternalDataSource[] {
  const sources: ExternalDataSource[] = [];
  const dataExtensions: Record<string, 'json' | 'csv'> = {
    '.json': 'json',
    '.csv': 'csv',
  };

  // Check import declarations for data file imports
  for (const decl of sourceFile.getImportDeclarations()) {
    const moduleSpecifier = decl.getModuleSpecifierValue();
    const defaultImport = decl.getDefaultImport()?.getText();
    if (!defaultImport) continue;

    for (const [ext, fileType] of Object.entries(dataExtensions)) {
      if (moduleSpecifier.endsWith(ext)) {
        sources.push({
          variableName: defaultImport,
          filePath: moduleSpecifier,
          fileType,
        });
        break;
      }
    }
  }

  // Check variable declarations for require() calls with data file paths
  for (const stmt of sourceFile.getVariableStatements()) {
    for (const decl of stmt.getDeclarationList().getDeclarations()) {
      const initializer = decl.getInitializer();
      if (!initializer) continue;
      const initText = initializer.getText();
      const requireMatch = initText.match(/^require\(\s*['"](.+?)['"]\s*\)$/);
      if (!requireMatch) continue;
      const modulePath = requireMatch[1];
      for (const [ext, fileType] of Object.entries(dataExtensions)) {
        if (modulePath.endsWith(ext)) {
          sources.push({
            variableName: decl.getName(),
            filePath: modulePath,
            fileType,
          });
          break;
        }
      }
    }
  }

  return sources;
}

interface DescribeInfo {
  name: string;
  mode: DescribeMode;
  callExpression: CallExpression;
}

/**
 * Extract describe mode from a call expression text like 'test.describe', 'test.describe.serial', etc.
 */
function extractDescribeMode(callText: string): DescribeMode {
  if (callText.includes('.serial')) return 'serial';
  if (callText.includes('.parallel')) return 'parallel';
  return 'default';
}

function findDescribeBlock(sourceFile: SourceFile): DescribeInfo | undefined {
  const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);

  for (const call of calls) {
    const expr = call.getExpression();
    const text = expr.getText();

    // Match test.describe('name', ...) or test.describe.serial('name', ...) etc.
    if (text === 'test.describe' || text.startsWith('test.describe.')) {
      const args = call.getArguments();
      if (args.length >= 1 && Node.isStringLiteral(args[0])) {
        return {
          name: args[0].getLiteralValue(),
          mode: extractDescribeMode(text),
          callExpression: call,
        };
      }
    }
  }

  return undefined;
}

/**
 * Find nested test.describe() blocks inside a parent describe's callback body.
 * Recursively parses child describes to build a tree of DescribeBlock.
 */
function findNestedDescribes(parentCall: CallExpression, warnings: string[], pageObjectMap: Map<string, string>): DescribeBlock[] {
  const args = parentCall.getArguments();
  const callback = args.find(a => Node.isArrowFunction(a) || Node.isFunctionExpression(a));
  if (!callback) return [];

  const body = Node.isArrowFunction(callback)
    ? callback.getBody()
    : (callback as any).getBody();
  if (!Node.isBlock(body)) return [];

  const children: DescribeBlock[] = [];

  // Only look at direct children of the describe body (not deeply nested ones)
  for (const stmt of body.getStatements()) {
    if (!Node.isExpressionStatement(stmt)) continue;
    const expr = stmt.getExpression();
    if (!Node.isCallExpression(expr)) continue;

    const callText = expr.getExpression().getText();
    if (callText === 'test.describe' || callText.startsWith('test.describe.')) {
      const descArgs = expr.getArguments();
      if (descArgs.length >= 1 && Node.isStringLiteral(descArgs[0])) {
        const name = descArgs[0].getLiteralValue();
        const mode = extractDescribeMode(callText);

        // Find hooks and tests scoped to this nested describe
        const nestedCallback = descArgs.find(a => Node.isArrowFunction(a) || Node.isFunctionExpression(a));
        if (!nestedCallback) continue;

        const nestedBody = Node.isArrowFunction(nestedCallback)
          ? nestedCallback.getBody()
          : (nestedCallback as any).getBody();
        if (!Node.isBlock(nestedBody)) continue;

        const nestedTests: TestCase[] = [];
        const nestedBeforeAll: ActionNode[] = [];
        const nestedBeforeEach: ActionNode[] = [];
        const nestedAfterEach: ActionNode[] = [];
        const nestedAfterAll: ActionNode[] = [];

        for (const nestedStmt of nestedBody.getStatements()) {
          if (!Node.isExpressionStatement(nestedStmt)) continue;
          const nestedExpr = nestedStmt.getExpression();
          if (!Node.isCallExpression(nestedExpr)) continue;

          const nestedText = nestedExpr.getExpression().getText();

          if (nestedText === 'test' || nestedText === 'test.only' || nestedText === 'test.skip') {
            // It's a test case
            const testArgs = nestedExpr.getArguments();
            if (testArgs.length >= 2 && Node.isStringLiteral(testArgs[0])) {
              const testName = testArgs[0].getLiteralValue();
              const testCallback = testArgs.find(a => Node.isArrowFunction(a) || Node.isFunctionExpression(a));
              if (testCallback) {
                const testBody = Node.isArrowFunction(testCallback)
                  ? testCallback.getBody()
                  : (testCallback as any).getBody();
                if (Node.isBlock(testBody)) {
                  const allStmts = [...testBody.getStatements()];
                  const { annotations, timeout: testTimeout, remainingStatements } = extractAnnotationsFromBody(allStmts);
                  const nodes = parseStatements(remainingStatements, pageObjectMap);
                  const edges = generateLinearEdges(nodes);

                  const tags: string[] = [];
                  if (nestedText === 'test.only') tags.push('@only');
                  if (nestedText === 'test.skip') tags.push('@skip');
                  tags.push(...extractTagsFromOptions(testArgs));

                  nestedTests.push({
                    id: `test_${nextNodeId()}`,
                    name: testName,
                    nodes,
                    edges,
                    ...(tags.length > 0 ? { tags } : {}),
                    ...(annotations.length > 0 ? { annotations } : {}),
                    ...(testTimeout !== undefined ? { timeout: testTimeout } : {}),
                  });
                }
              }
            }
          } else if (nestedText === 'test.beforeAll') {
            const hookCallback = nestedExpr.getArguments().find(a => Node.isArrowFunction(a) || Node.isFunctionExpression(a));
            if (hookCallback) {
              const hookBody = Node.isArrowFunction(hookCallback) ? hookCallback.getBody() : (hookCallback as any).getBody();
              if (Node.isBlock(hookBody)) {
                nestedBeforeAll.push(...parseStatements(hookBody.getStatements(), pageObjectMap));
              }
            }
          } else if (nestedText === 'test.beforeEach') {
            const hookCallback = nestedExpr.getArguments().find(a => Node.isArrowFunction(a) || Node.isFunctionExpression(a));
            if (hookCallback) {
              const hookBody = Node.isArrowFunction(hookCallback) ? hookCallback.getBody() : (hookCallback as any).getBody();
              if (Node.isBlock(hookBody)) {
                nestedBeforeEach.push(...parseStatements(hookBody.getStatements(), pageObjectMap));
              }
            }
          } else if (nestedText === 'test.afterEach') {
            const hookCallback = nestedExpr.getArguments().find(a => Node.isArrowFunction(a) || Node.isFunctionExpression(a));
            if (hookCallback) {
              const hookBody = Node.isArrowFunction(hookCallback) ? hookCallback.getBody() : (hookCallback as any).getBody();
              if (Node.isBlock(hookBody)) {
                nestedAfterEach.push(...parseStatements(hookBody.getStatements(), pageObjectMap));
              }
            }
          } else if (nestedText === 'test.afterAll') {
            const hookCallback = nestedExpr.getArguments().find(a => Node.isArrowFunction(a) || Node.isFunctionExpression(a));
            if (hookCallback) {
              const hookBody = Node.isArrowFunction(hookCallback) ? hookCallback.getBody() : (hookCallback as any).getBody();
              if (Node.isBlock(hookBody)) {
                nestedAfterAll.push(...parseStatements(hookBody.getStatements(), pageObjectMap));
              }
            }
          }
        }

        // Recursively find nested describes inside this child describe
        const grandchildren = findNestedDescribes(expr, warnings, pageObjectMap);

        // Extract test.use() fixture overrides for this nested describe
        const nestedFixtureOverrides = extractFixtureOverridesFromDescribe(expr);
        const nestedTimeout = extractDescribeTimeout(expr);

        const child: DescribeBlock = {
          name,
          ...(mode !== 'default' ? { mode } : {}),
          ...(nestedTimeout !== undefined ? { timeout: nestedTimeout } : {}),
          tests: nestedTests,
          ...(nestedBeforeAll.length > 0 ? { beforeAll: nestedBeforeAll } : {}),
          ...(nestedBeforeEach.length > 0 ? { beforeEach: nestedBeforeEach } : {}),
          ...(nestedAfterEach.length > 0 ? { afterEach: nestedAfterEach } : {}),
          ...(nestedAfterAll.length > 0 ? { afterAll: nestedAfterAll } : {}),
          ...(grandchildren.length > 0 ? { children: grandchildren } : {}),
          ...(nestedFixtureOverrides && Object.keys(nestedFixtureOverrides).length > 0 ? { fixtureOverrides: nestedFixtureOverrides } : {}),
        };

        children.push(child);
      }
    }
  }

  return children;
}

function findHookStatements(sourceFile: SourceFile, hookName: string, pageObjectMap: Map<string, string>): ActionNode[] {
  const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);

  for (const call of calls) {
    if (isInsideNestedDescribe(call)) continue;
    const expr = call.getExpression();
    if (expr.getText() === `test.${hookName}`) {
      const args = call.getArguments();
      // The callback is usually the last argument
      const callback = args.find(a =>
        Node.isArrowFunction(a) || Node.isFunctionExpression(a)
      );
      if (callback) {
        const body = Node.isArrowFunction(callback)
          ? callback.getBody()
          : (callback as any).getBody();

        if (Node.isBlock(body)) {
          return parseStatements(body.getStatements(), pageObjectMap);
        }
      }
    }
  }

  return [];
}

/**
 * Find all hook instances of a given type and concatenate their action nodes.
 * Unlike findHookStatements which returns only the first match, this captures
 * all hooks of the same type (e.g., multiple test.beforeAll() calls).
 */
function findAllHookStatements(sourceFile: SourceFile, hookName: string, pageObjectMap: Map<string, string>): ActionNode[] {
  const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
  const allNodes: ActionNode[] = [];

  for (const call of calls) {
    if (isInsideNestedDescribe(call)) continue;
    const expr = call.getExpression();
    if (expr.getText() === `test.${hookName}`) {
      const args = call.getArguments();
      const callback = args.find(a =>
        Node.isArrowFunction(a) || Node.isFunctionExpression(a)
      );
      if (callback) {
        const body = Node.isArrowFunction(callback)
          ? callback.getBody()
          : (callback as any).getBody();

        if (Node.isBlock(body)) {
          const nodes = parseStatements(body.getStatements(), pageObjectMap);
          allNodes.push(...nodes);
        }
      }
    }
  }

  return allNodes;
}

/**
 * Check if a call expression is inside a nested test.describe() block.
 * Returns true if the call is inside a test.describe that is itself inside another test.describe.
 */
function isInsideNestedDescribe(call: CallExpression): boolean {
  let describeCount = 0;
  let ancestor = call.getParent();
  while (ancestor) {
    if (Node.isCallExpression(ancestor)) {
      const exprText = ancestor.getExpression().getText();
      if (exprText === 'test.describe' || exprText.startsWith('test.describe.')) {
        describeCount++;
        if (describeCount >= 2) return true;
      }
    }
    ancestor = ancestor.getParent();
  }
  return false;
}

/**
 * Check if a test() call is inside a for...of loop or forEach callback
 * that constitutes a data-driven (parameterized) test pattern.
 */
function isInsideParameterizedLoop(call: CallExpression): boolean {
  let ancestor = call.getParent();
  while (ancestor) {
    // Check for...of statement wrapping a test() call
    if (Node.isForOfStatement(ancestor)) {
      return true;
    }
    // Check forEach callback: the call is inside an arrow/function passed to .forEach()
    if ((Node.isArrowFunction(ancestor) || Node.isFunctionExpression(ancestor))) {
      const parent = ancestor.getParent();
      if (parent && Node.isCallExpression(parent)) {
        const calleeExpr = parent.getExpression();
        if (Node.isPropertyAccessExpression(calleeExpr) && calleeExpr.getName() === 'forEach') {
          return true;
        }
      }
    }
    // Stop searching at describe callback boundary
    if (Node.isCallExpression(ancestor)) {
      const exprText = ancestor.getExpression().getText();
      if (exprText === 'test.describe' || exprText.startsWith('test.describe.')) {
        break;
      }
    }
    ancestor = ancestor.getParent();
  }
  return false;
}

// ─── Parameterized Test Detection ─────────────────────────────────────

/**
 * Extract inline array data items from an array literal expression text.
 * Attempts to parse the array as JSON-compatible data.
 */
function tryExtractInlineDataItems(arrayText: string): Record<string, unknown>[] | undefined {
  try {
    // Convert JS object literal syntax to JSON-parseable format:
    // Replace single-quoted strings with double-quoted strings
    let jsonText = arrayText
      .replace(/'([^'\\]*(\\.[^'\\]*)*)'/g, '"$1"')
      // Add quotes around unquoted object keys
      .replace(/(\{|,)\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1 "$2":');

    const parsed = JSON.parse(jsonText);
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object') {
      return parsed;
    }
  } catch {
    // Not valid JSON-like — could be expressions, variables, etc.
  }
  return undefined;
}

/**
 * Find the test() call inside a block of statements.
 * Returns info about the test call if a test() call is found as a direct statement.
 */
function findTestCallInStatements(statements: Statement[], pageObjectMap: Map<string, string>): {
  testName: string;
  testNameIsExpression: boolean;
  testNodes: ActionNode[];
  testEdges: FlowEdge[];
  callText: string;
  tags: string[];
  annotations: TestAnnotation[];
  fixtures: string[];
  timeout?: number;
} | null {
  for (const stmt of statements) {
    if (!Node.isExpressionStatement(stmt)) continue;
    const expr = stmt.getExpression();
    if (!Node.isCallExpression(expr)) continue;

    const callText = expr.getExpression().getText();
    if (callText !== 'test' && callText !== 'test.only' && callText !== 'test.skip') continue;

    const args = expr.getArguments();
    if (args.length < 2) continue;

    // The test name can be a string literal, template literal, or expression
    const nameArg = args[0];
    let testName: string;
    let testNameIsExpression = false;
    if (Node.isStringLiteral(nameArg)) {
      testName = nameArg.getLiteralValue();
    } else if (Node.isTemplateExpression(nameArg) || Node.isNoSubstitutionTemplateLiteral(nameArg)) {
      testName = nameArg.getText();
      testNameIsExpression = true;
    } else {
      testName = nameArg.getText();
      testNameIsExpression = true;
    }

    const callback = args.find((a: Node) => Node.isArrowFunction(a) || Node.isFunctionExpression(a));
    if (!callback) continue;

    const body = Node.isArrowFunction(callback)
      ? callback.getBody()
      : (callback as any).getBody();
    if (!Node.isBlock(body)) continue;

    const allStmts = [...body.getStatements()];
    const { annotations, timeout: testTimeout, remainingStatements } = extractAnnotationsFromBody(allStmts);
    const testNodes = parseStatements(remainingStatements, pageObjectMap);
    const testEdges = generateLinearEdges(testNodes);

    const tags: string[] = [];
    if (callText === 'test.only') tags.push('@only');
    if (callText === 'test.skip') tags.push('@skip');
    tags.push(...extractTagsFromOptions(args));

    // Extract fixture names from callback params
    const fixtures: string[] = [];
    const params = Node.isArrowFunction(callback)
      ? callback.getParameters()
      : (callback as any).getParameters();
    for (const param of params) {
      const bindingPattern = param.getNameNode();
      if (Node.isObjectBindingPattern(bindingPattern)) {
        for (const element of bindingPattern.getElements()) {
          fixtures.push(element.getName());
        }
      }
    }

    return { testName, testNameIsExpression, testNodes, testEdges, callText, tags, annotations, fixtures, timeout: testTimeout };
  }
  return null;
}

/**
 * Resolve a variable name to its inline array initializer text, if declared in the source file.
 */
function resolveVariableArrayText(sourceFile: SourceFile, varName: string): string | undefined {
  const varDecls = sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration);
  for (const decl of varDecls) {
    if (decl.getName() === varName) {
      const init = decl.getInitializer();
      if (init && Node.isArrayLiteralExpression(init)) {
        return init.getText();
      }
    }
  }
  return undefined;
}

/**
 * Detect data-driven test patterns: for...of loops and forEach calls
 * that wrap test() declarations.
 */
function findParameterizedTests(sourceFile: SourceFile, warnings: string[], pageObjectMap: Map<string, string>): ParameterizedTest[] {
  const results: ParameterizedTest[] = [];

  // --- Pattern 1: for (const X of Y) { test(...) } ---
  const forOfStatements = sourceFile.getDescendantsOfKind(SyntaxKind.ForOfStatement);
  for (const forOf of forOfStatements) {
    // Skip if inside a nested describe
    if (isInsideNestedDescribe(forOf as unknown as CallExpression)) continue;

    const body = forOf.getStatement();
    if (!Node.isBlock(body)) continue;

    const testInfo = findTestCallInStatements(body.getStatements(), pageObjectMap);
    if (!testInfo) continue;

    const initializer = forOf.getInitializer();
    const iteratorVariable = initializer.getText().replace(/^(const|let|var)\s+/, '');
    const dataSourceExpr = forOf.getExpression();
    const dataSource = dataSourceExpr.getText();

    // Try to extract inline data items
    let dataItems: Record<string, unknown>[] | undefined;
    if (Node.isArrayLiteralExpression(dataSourceExpr)) {
      dataItems = tryExtractInlineDataItems(dataSource);
    } else {
      // Try to resolve variable reference
      const resolvedText = resolveVariableArrayText(sourceFile, dataSource);
      if (resolvedText) {
        dataItems = tryExtractInlineDataItems(resolvedText);
      }
    }

    results.push({
      id: `parameterized_${nextNodeId()}`,
      loopPattern: 'for...of',
      iteratorVariable,
      dataSource,
      ...(dataItems ? { dataItems } : {}),
      testNameTemplate: testInfo.testName,
      ...(testInfo.testNameIsExpression ? { testNameIsExpression: true } : {}),
      testBody: testInfo.testNodes,
      edges: testInfo.testEdges,
      ...(testInfo.fixtures.length > 0 ? { fixtures: testInfo.fixtures } : {}),
      ...(testInfo.tags.length > 0 ? { tags: testInfo.tags } : {}),
      ...(testInfo.annotations.length > 0 ? { annotations: testInfo.annotations } : {}),
    });
  }

  // --- Pattern 2: [...].forEach(X => { test(...) }) or Y.forEach(X => { test(...) }) ---
  const allCalls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
  for (const call of allCalls) {
    const calleeExpr = call.getExpression();
    if (!Node.isPropertyAccessExpression(calleeExpr)) continue;
    if ((calleeExpr as PropertyAccessExpression).getName() !== 'forEach') continue;

    // Skip if inside a nested describe
    if (isInsideNestedDescribe(call)) continue;

    const forEachArgs = call.getArguments();
    if (forEachArgs.length < 1) continue;
    const callback = forEachArgs[0];
    if (!Node.isArrowFunction(callback) && !Node.isFunctionExpression(callback)) continue;

    const cbBody = Node.isArrowFunction(callback)
      ? callback.getBody()
      : (callback as any).getBody();
    if (!Node.isBlock(cbBody)) continue;

    const testInfo = findTestCallInStatements(cbBody.getStatements(), pageObjectMap);
    if (!testInfo) continue;

    // Get the iterator variable name from the callback parameter
    const cbParams = Node.isArrowFunction(callback)
      ? callback.getParameters()
      : (callback as any).getParameters();
    const iteratorVariable = cbParams.length > 0 ? cbParams[0].getName() : '_data';

    // Get the data source (the object that forEach is called on)
    const dataSourceNode = (calleeExpr as PropertyAccessExpression).getExpression();
    const dataSource = dataSourceNode.getText();

    // Try to extract inline data items
    let dataItems: Record<string, unknown>[] | undefined;
    if (Node.isArrayLiteralExpression(dataSourceNode)) {
      dataItems = tryExtractInlineDataItems(dataSource);
    } else {
      // Try to resolve variable reference
      const resolvedText = resolveVariableArrayText(sourceFile, dataSource);
      if (resolvedText) {
        dataItems = tryExtractInlineDataItems(resolvedText);
      }
    }

    results.push({
      id: `parameterized_${nextNodeId()}`,
      loopPattern: 'forEach',
      iteratorVariable,
      dataSource,
      ...(dataItems ? { dataItems } : {}),
      testNameTemplate: testInfo.testName,
      ...(testInfo.testNameIsExpression ? { testNameIsExpression: true } : {}),
      testBody: testInfo.testNodes,
      edges: testInfo.testEdges,
      ...(testInfo.fixtures.length > 0 ? { fixtures: testInfo.fixtures } : {}),
      ...(testInfo.tags.length > 0 ? { tags: testInfo.tags } : {}),
      ...(testInfo.annotations.length > 0 ? { annotations: testInfo.annotations } : {}),
    });
  }

  return results;
}

function findTestCases(sourceFile: SourceFile, warnings: string[], pageObjectMap: Map<string, string>): TestCase[] {
  const tests: TestCase[] = [];
  const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);

  for (const call of calls) {
    const expr = call.getExpression();
    const text = expr.getText();

    // Match test('name', ...) or test.only('name', ...) or test.skip('name', ...)
    if (text === 'test' || text === 'test.only' || text === 'test.skip') {
      // Skip tests inside nested describes (they're handled by findNestedDescribes)
      if (isInsideNestedDescribe(call)) continue;
      // Skip tests inside parameterized loops (handled by findParameterizedTests)
      if (isInsideParameterizedLoop(call)) continue;
      const args = call.getArguments();
      if (args.length >= 2 && Node.isStringLiteral(args[0])) {
        const testName = args[0].getLiteralValue();
        const callback = args.find(a =>
          Node.isArrowFunction(a) || Node.isFunctionExpression(a)
        );

        if (callback) {
          const body = Node.isArrowFunction(callback)
            ? callback.getBody()
            : (callback as any).getBody();

          // Extract annotations from test body (test.slow(), test.fixme(), etc.)
          const annotations: TestAnnotation[] = [];
          let testTimeout: number | undefined;
          let bodyStatements: Statement[] = [];
          if (Node.isBlock(body)) {
            bodyStatements = [...body.getStatements()];
            const { annotations: bodyAnnotations, timeout: bodyTimeout, remainingStatements } = extractAnnotationsFromBody(bodyStatements);
            annotations.push(...bodyAnnotations);
            testTimeout = bodyTimeout;
            bodyStatements = remainingStatements;
          }

          let nodes: ActionNode[] = [];
          if (bodyStatements.length > 0) {
            nodes = parseStatements(bodyStatements, pageObjectMap);
          }

          // Generate edges: linear flow for now
          const edges = generateLinearEdges(nodes);

          // Extract tags from test name or annotations
          const tags: string[] = [];
          if (text === 'test.only') tags.push('@only');
          if (text === 'test.skip') tags.push('@skip');

          // Extract tags from options object: test('name', { tag: ['@smoke'] }, async () => { ... })
          const optionsTags = extractTagsFromOptions(args);
          tags.push(...optionsTags);

          tests.push({
            id: `test_${Buffer.from(testName).toString('base64url')}`,
            name: testName,
            nodes,
            edges,
            ...(tags.length > 0 ? { tags } : {}),
            ...(annotations.length > 0 ? { annotations } : {}),
            ...(testTimeout !== undefined ? { timeout: testTimeout } : {}),
          });
        } else {
          warnings.push(`Could not find callback for test: "${testName}"`);
        }
      }
    }
  }

  return tests;
}

/**
 * Extract annotation calls (test.slow(), test.fixme(), test.fail(), test.skip()) from
 * the beginning of a test body. Returns the annotations found and the remaining statements.
 */
function extractAnnotationsFromBody(statements: Statement[]): { annotations: TestAnnotation[]; timeout?: number; remainingStatements: Statement[] } {
  const annotations: TestAnnotation[] = [];
  const annotationNames = new Set(['slow', 'fixme', 'fail', 'skip']);
  let timeout: number | undefined;
  let i = 0;

  for (; i < statements.length; i++) {
    const stmt = statements[i];
    if (!Node.isExpressionStatement(stmt)) break;

    const expr = stmt.getExpression();
    if (!Node.isCallExpression(expr)) break;

    const callText = expr.getExpression().getText();
    // Match test.slow(), test.fixme(), test.fail(), test.skip() with no arguments
    if (callText.startsWith('test.')) {
      const annotationName = callText.slice(5); // strip 'test.'
      if (annotationNames.has(annotationName) && expr.getArguments().length === 0) {
        annotations.push(annotationName as TestAnnotation);
        continue;
      }
      // Match test.setTimeout(ms)
      if (annotationName === 'setTimeout' && expr.getArguments().length === 1) {
        const arg = expr.getArguments()[0];
        if (Node.isNumericLiteral(arg)) {
          timeout = Number(arg.getLiteralValue());
        } else {
          // Non-literal: try to parse the text as a number
          const val = Number(arg.getText());
          if (!isNaN(val)) timeout = val;
        }
        continue;
      }
    }
    break;
  }

  return { annotations, timeout, remainingStatements: statements.slice(i) };
}

/**
 * Extract tags from the options object in test call arguments.
 * Handles: test('name', { tag: ['@smoke', '@regression'] }, async () => { ... })
 * Also handles single string: test('name', { tag: '@smoke' }, async () => { ... })
 */
function extractTagsFromOptions(args: Node[]): string[] {
  const tags: string[] = [];

  for (const arg of args) {
    if (Node.isObjectLiteralExpression(arg)) {
      const tagProp = arg.getProperty('tag');
      if (tagProp && Node.isPropertyAssignment(tagProp)) {
        const initializer = tagProp.getInitializer();
        if (initializer) {
          if (Node.isArrayLiteralExpression(initializer)) {
            for (const element of initializer.getElements()) {
              if (Node.isStringLiteral(element)) {
                tags.push(element.getLiteralValue());
              }
            }
          } else if (Node.isStringLiteral(initializer)) {
            tags.push(initializer.getLiteralValue());
          }
        }
      }
    }
  }

  return tags;
}

function generateLinearEdges(nodes: ActionNode[]): FlowEdge[] {
  const edges: FlowEdge[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    edges.push({
      id: `edge_${nodes[i].id}_${nodes[i + 1].id}`,
      source: nodes[i].id,
      target: nodes[i + 1].id,
    });
  }
  return edges;
}

function extractFixtureNames(sourceFile: SourceFile): string[] {
  const fixtures = new Set<string>();
  const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);

  for (const call of calls) {
    const expr = call.getExpression();
    const text = expr.getText();

    if (text === 'test' || text === 'test.only' || text === 'test.skip' ||
        text === 'test.beforeEach' || text === 'test.afterEach') {
      const args = call.getArguments();
      const callback = args.find(a =>
        Node.isArrowFunction(a) || Node.isFunctionExpression(a)
      );
      if (callback) {
        const params = Node.isArrowFunction(callback)
          ? callback.getParameters()
          : (callback as any).getParameters();

        for (const param of params) {
          // Destructured param: async ({ page, myFixture }) => { ... }
          const bindingPattern = param.getNameNode();
          if (Node.isObjectBindingPattern(bindingPattern)) {
            for (const element of bindingPattern.getElements()) {
              fixtures.add(element.getName());
            }
          }
        }
      }
    }
  }

  return [...fixtures];
}

// ─── Statement Parsing ───────────────────────────────────────────────

function parseStatements(statements: Statement[], pageObjectMap: Map<string, string>): ActionNode[] {
  const nodes: ActionNode[] = [];
  const yStep = 150;
  // Track page variables created by newTab actions (e.g., newPage -> 'newPage')
  const pageVariables = new Set<string>();
  // Track download variables for follow-up statements (download.saveAs, etc.)
  const downloadVariables = new Map<string, ActionNode>();

  for (const stmt of statements) {
    // Check if this statement is a follow-up on a download variable (e.g., download.saveAs)
    if (matchDownloadFollowUp(stmt, downloadVariables)) {
      continue; // consumed by a previous fileDownload node
    }

    const node = parseStatement(stmt, nodes.length * yStep, pageObjectMap, pageVariables, downloadVariables);
    if (node) {
      attachVariableInfo(node, stmt);
      nodes.push(node);
    }
  }

  return nodes;
}

function parseStatement(stmt: Statement, yPos: number, pageObjectMap: Map<string, string>, pageVariables?: Set<string>, downloadVariables?: Map<string, ActionNode>): ActionNode | null {
  // Handle for loops
  if (Node.isForStatement(stmt)) {
    return parseForStatement(stmt as ForStatement, yPos, pageObjectMap);
  }
  if (Node.isForOfStatement(stmt)) {
    return parseForOfStatement(stmt as ForOfStatement, yPos, pageObjectMap);
  }
  if (Node.isForInStatement(stmt)) {
    return parseForInStatement(stmt as ForInStatement, yPos, pageObjectMap);
  }

  // Handle while loops
  if (Node.isWhileStatement(stmt)) {
    return parseWhileStatement(stmt as WhileStatement, yPos, pageObjectMap);
  }

  // Handle do...while loops
  if (Node.isDoStatement(stmt)) {
    return parseDoWhileStatement(stmt as DoStatement, yPos, pageObjectMap);
  }

  // Handle if/else conditionals
  if (Node.isIfStatement(stmt)) {
    return parseIfStatement(stmt as IfStatement, yPos, pageObjectMap);
  }

  // Handle try/catch/finally
  if (Node.isTryStatement(stmt)) {
    return parseTryStatement(stmt as TryStatement, yPos, pageObjectMap);
  }

  // Handle switch statements
  if (Node.isSwitchStatement(stmt)) {
    return parseSwitchStatement(stmt as SwitchStatement, yPos, pageObjectMap);
  }

  // Handle variable declarations
  if (Node.isVariableStatement(stmt)) {
    const varStmt = stmt as VariableStatement;
    const declarations = varStmt.getDeclarations();
    if (declarations.length === 1) {
      const decl = declarations[0];
      const nameNode = decl.getNameNode();

      // Check for Promise.all newTab pattern:
      // const [newPage] = await Promise.all([context.waitForEvent('page'), page.click(...)])
      if (Node.isArrayBindingPattern(nameNode)) {
        let initExpr = decl.getInitializer();
        if (initExpr && Node.isAwaitExpression(initExpr)) {
          initExpr = (initExpr as AwaitExpression).getExpression();
        }
        if (initExpr && Node.isCallExpression(initExpr)) {
          const callText = (initExpr as CallExpression).getExpression().getText();
          if (callText === 'Promise.all') {
            const newTabData = matchPromiseAllNewTab(initExpr as CallExpression, nameNode);
            if (newTabData) {
              if (pageVariables) {
                pageVariables.add(newTabData.pageVariable);
              }
              return {
                id: nextNodeId(),
                type: 'newTab',
                position: { x: 250, y: yPos },
                data: newTabData,
              };
            }

            // Check for Promise.all fileDownload pattern:
            // const [download] = await Promise.all([page.waitForEvent('download'), page.click(...)])
            const downloadData = matchPromiseAllDownload(initExpr as CallExpression, nameNode);
            if (downloadData) {
              const node: ActionNode = {
                id: nextNodeId(),
                type: 'fileDownload',
                position: { x: 250, y: yPos },
                data: downloadData,
              };
              if (downloadVariables) {
                downloadVariables.set(downloadData.downloadVariable, node);
              }
              return node;
            }
          }
        }
      }

      // Check for simpler popup pattern:
      // const popup = await page.waitForEvent('popup')
      const varName = decl.getName();
      let popupInit = decl.getInitializer();
      if (popupInit && Node.isAwaitExpression(popupInit)) {
        popupInit = (popupInit as AwaitExpression).getExpression();
      }
      if (popupInit && Node.isCallExpression(popupInit)) {
        const popupData = matchWaitForPopup(popupInit as CallExpression, varName);
        if (popupData) {
          if (pageVariables) {
            pageVariables.add(popupData.pageVariable);
          }
          return {
            id: nextNodeId(),
            type: 'newTab',
            position: { x: 250, y: yPos },
            data: popupData,
          };
        }
      }

      // Check for sequential download pattern:
      // const download = await page.waitForEvent('download')
      if (popupInit && Node.isCallExpression(popupInit)) {
        const seqDownloadData = matchWaitForDownload(popupInit as CallExpression, varName);
        if (seqDownloadData) {
          const node: ActionNode = {
            id: nextNodeId(),
            type: 'fileDownload',
            position: { x: 250, y: yPos },
            data: seqDownloadData,
          };
          if (downloadVariables) {
            downloadVariables.set(seqDownloadData.downloadVariable, node);
          }
          return node;
        }
      }

      // Check for API request calls (e.g., const response = await request.get(...))
      let initializer = decl.getInitializer();
      if (initializer && Node.isAwaitExpression(initializer)) {
        initializer = (initializer as AwaitExpression).getExpression();
      }
      if (initializer) {
        const apiData = matchApiRequestCall(initializer, varName);
        if (apiData) {
          return {
            id: nextNodeId(),
            type: apiData.type,
            position: { x: 250, y: yPos },
            data: apiData,
          };
        }

        // Check for browser.newContext({ storageState: '...' }) — storage state load
        const storageLoadData = matchNewContextStorageState(initializer);
        if (storageLoadData) {
          return {
            id: nextNodeId(),
            type: storageLoadData.type,
            position: { x: 250, y: yPos },
            data: storageLoadData,
          };
        }

        // Check for browser.newContext(...) — generic new context creation
        const newContextData = matchNewContext(initializer, varName);
        if (newContextData) {
          return {
            id: nextNodeId(),
            type: 'newContext',
            position: { x: 250, y: yPos },
            data: newContextData,
          };
        }

        // Check for context.newPage() — page from specific context
        const contextNewPageData = matchContextNewPage(initializer, varName);
        if (contextNewPageData) {
          if (pageVariables) {
            pageVariables.add(contextNewPageData.pageVariable);
          }
          return {
            id: nextNodeId(),
            type: 'newTab',
            position: { x: 250, y: yPos },
            data: contextNewPageData,
          };
        }

        // Check for const cookies = await context.cookies()
        const getCookiesData = matchGetCookies(initializer, varName);
        if (getCookiesData) {
          return {
            id: nextNodeId(),
            type: getCookiesData.type,
            position: { x: 250, y: yPos },
            data: getCookiesData,
          };
        }

        // Check for const val = await page.evaluate(() => localStorage.getItem('key'))
        if (Node.isCallExpression(initializer)) {
          const browserStorageData = matchBrowserStorage(initializer as CallExpression, varName);
          if (browserStorageData) {
            return {
              id: nextNodeId(),
              type: 'browserStorage',
              position: { x: 250, y: yPos },
              data: browserStorageData,
            };
          }
        }

      }

      // Check for iteration with variable assignment:
      // const result = arr.map(item => { ... }) or const result = arr.filter(item => ...)
      const iterVarData = matchIterationCall(decl.getInitializer(), pageObjectMap, varName);
      if (iterVarData) {
        return {
          id: nextNodeId(),
          type: 'iteration',
          position: { x: 250, y: yPos },
          data: iterVarData,
        };
      }

      // Check for utility function call with variable assignment:
      // const result = utilityFn(arg1, arg2) or const result = await utilityFn(...)
      const utilCallWithVar = matchUtilityCall(decl.getInitializer(), varName);
      if (utilCallWithVar) {
        return {
          id: nextNodeId(),
          type: 'utilityCall',
          position: { x: 250, y: yPos },
          data: utilCallWithVar,
        };
      }

      // Check for inline data declarations (arrays of objects/primitives, plain objects)
      const inlineDataResult = matchInlineData(decl);
      if (inlineDataResult) {
        return {
          id: nextNodeId(),
          type: 'inlineData',
          position: { x: 250, y: yPos },
          data: inlineDataResult,
        };
      }
    }
    // Fall through to code block for other variable declarations
    return makeCodeBlock(stmt.getText(), yPos);
  }

  if (!Node.isExpressionStatement(stmt)) {
    // Other non-expression statements become code blocks
    return makeCodeBlock(stmt.getText(), yPos);
  }

  const expr = (stmt as ExpressionStatement).getExpression();

  // Unwrap await
  let innerExpr = expr;
  if (Node.isAwaitExpression(expr)) {
    innerExpr = (expr as AwaitExpression).getExpression();
  }

  // Try to match test.use({ storageState: '...' }) for storage state load
  const testUseData = matchTestUseStorageState(innerExpr);
  if (testUseData) {
    return {
      id: nextNodeId(),
      type: testUseData.type,
      position: { x: 250, y: yPos },
      data: testUseData,
    };
  }

  // Try to match test.step() calls
  if (Node.isCallExpression(innerExpr)) {
    const callExprText = (innerExpr as CallExpression).getExpression().getText();
    if (callExprText === 'test.step') {
      const stepNode = parseTestStep(innerExpr as CallExpression, yPos, pageObjectMap);
      if (stepNode) return stepNode;
    }
  }

  // Try to match API request calls (without variable assignment)
  const apiRequestData = matchApiRequestCall(innerExpr);
  if (apiRequestData) {
    return {
      id: nextNodeId(),
      type: apiRequestData.type,
      position: { x: 250, y: yPos },
      data: apiRequestData,
    };
  }

  // Try to match known Playwright patterns
  const actionData = matchPlaywrightAction(innerExpr);
  if (actionData) {
    const node: ActionNode = {
      id: nextNodeId(),
      type: actionData.type,
      position: { x: 250, y: yPos },
      data: actionData,
    };
    return extractFrameLocatorsFromNode(node);
  }

  // Try to match expect assertions
  const assertData = matchExpectAssertion(innerExpr);
  if (assertData) {
    const node: ActionNode = {
      id: nextNodeId(),
      type: assertData.type,
      position: { x: 250, y: yPos },
      data: assertData,
    };
    return extractFrameLocatorsFromNode(node);
  }

  // Try to match page object method calls
  const pageObjData = matchPageObjectCall(innerExpr, pageObjectMap);
  if (pageObjData) {
    return {
      id: nextNodeId(),
      type: pageObjData.type,
      position: { x: 250, y: yPos },
      data: pageObjData,
    };
  }

  // Try to match array iteration calls (forEach/map/filter with callback)
  const iterData = matchIterationCall(expr, pageObjectMap);
  if (iterData) {
    return {
      id: nextNodeId(),
      type: 'iteration',
      position: { x: 250, y: yPos },
      data: iterData,
    };
  }

  // Try to match utility function calls (bare calls without assignment)
  const utilCallData = matchUtilityCall(expr);
  if (utilCallData) {
    return {
      id: nextNodeId(),
      type: 'utilityCall',
      position: { x: 250, y: yPos },
      data: utilCallData,
    };
  }

  // Fallback: code block
  return makeCodeBlock(stmt.getText(), yPos);
}

/**
 * Detect inline data declarations:
 * - Array of objects: const users = [{name: 'Alice', age: 30}, {name: 'Bob', age: 25}]
 * - Array of primitives: const values = [1, 2, 3, 4]
 * - Plain objects: const config = { retries: 3, timeout: 5000 }
 *
 * Heuristics:
 * - Arrays must have at least 2 items
 * - All values must be literals (no function calls, complex expressions)
 * - Variable name must not be a Playwright-specific object (page, browser, context, etc.)
 */
function matchInlineData(decl: import('ts-morph').VariableDeclaration): InlineDataDataType | null {
  const varName = decl.getName();

  // Skip Playwright-specific variable names
  const playwrightNames = new Set([
    'page', 'browser', 'context', 'request', 'expect', 'test',
    'browserType', 'chromium', 'firefox', 'webkit',
    'frame', 'worker', 'electron', 'androidDevice',
  ]);
  if (playwrightNames.has(varName)) return null;

  const init = decl.getInitializer();
  if (!init) return null;

  // Determine const vs let
  const declList = decl.getParent();
  const isConst = declList && Node.isVariableDeclarationList(declList)
    ? declList.getText().startsWith('const ')
    : undefined;

  // Check for array literal
  if (Node.isArrayLiteralExpression(init)) {
    const elements = init.getElements();
    if (elements.length < 2) return null;

    // Check if array of objects
    const allObjects = elements.every(el => Node.isObjectLiteralExpression(el));
    if (allObjects) {
      const values = extractArrayOfObjects(elements);
      if (values) {
        return {
          type: 'inlineData',
          variableName: varName,
          dataType: 'array-of-objects',
          values,
          code: decl.getParent()!.getParent()!.getText(),
          isConst: isConst ?? undefined,
        };
      }
    }

    // Check if array of primitives
    const allPrimitives = elements.every(el =>
      Node.isNumericLiteral(el) || Node.isStringLiteral(el) ||
      el.getKind() === SyntaxKind.TrueKeyword || el.getKind() === SyntaxKind.FalseKeyword ||
      el.getKind() === SyntaxKind.NullKeyword ||
      (Node.isPrefixUnaryExpression(el) && Node.isNumericLiteral(el.getOperand())),
    );
    if (allPrimitives) {
      const values = extractPrimitiveArray(elements);
      if (values) {
        return {
          type: 'inlineData',
          variableName: varName,
          dataType: 'array-of-primitives',
          values,
          code: decl.getParent()!.getParent()!.getText(),
          isConst: isConst ?? undefined,
        };
      }
    }

    return null;
  }

  // Check for object literal
  if (Node.isObjectLiteralExpression(init)) {
    const properties = init.getProperties();
    if (properties.length === 0) return null;

    // All properties must have literal values
    const allLiteral = properties.every(prop => {
      if (!Node.isPropertyAssignment(prop)) return false;
      const val = prop.getInitializer();
      if (!val) return false;
      return Node.isNumericLiteral(val) || Node.isStringLiteral(val) ||
        val.getKind() === SyntaxKind.TrueKeyword || val.getKind() === SyntaxKind.FalseKeyword ||
        val.getKind() === SyntaxKind.NullKeyword ||
        (Node.isPrefixUnaryExpression(val) && Node.isNumericLiteral(val.getOperand()));
    });
    if (!allLiteral) return null;

    const values = extractObjectLiteral(properties);
    if (values) {
      return {
        type: 'inlineData',
        variableName: varName,
        dataType: 'object',
        values,
        code: decl.getParent()!.getParent()!.getText(),
        isConst: isConst ?? undefined,
      };
    }
  }

  return null;
}

function extractLiteralValue(node: import('ts-morph').Node): unknown {
  if (Node.isNumericLiteral(node)) return Number(node.getText());
  if (Node.isStringLiteral(node)) return node.getLiteralValue();
  if (node.getKind() === SyntaxKind.TrueKeyword) return true;
  if (node.getKind() === SyntaxKind.FalseKeyword) return false;
  if (node.getKind() === SyntaxKind.NullKeyword) return null;
  if (Node.isPrefixUnaryExpression(node) && Node.isNumericLiteral(node.getOperand())) {
    return Number(node.getText());
  }
  return undefined;
}

function extractArrayOfObjects(elements: import('ts-morph').Node[]): Record<string, unknown>[] | null {
  const result: Record<string, unknown>[] = [];
  for (const el of elements) {
    if (!Node.isObjectLiteralExpression(el)) return null;
    const obj: Record<string, unknown> = {};
    for (const prop of el.getProperties()) {
      if (!Node.isPropertyAssignment(prop)) return null;
      const key = prop.getName();
      const val = prop.getInitializer();
      if (!val) return null;
      const extracted = extractLiteralValue(val);
      if (extracted === undefined) return null;
      obj[key] = extracted;
    }
    result.push(obj);
  }
  return result;
}

function extractPrimitiveArray(elements: import('ts-morph').Node[]): unknown[] | null {
  const result: unknown[] = [];
  for (const el of elements) {
    const val = extractLiteralValue(el);
    if (val === undefined) return null;
    result.push(val);
  }
  return result;
}

function extractObjectLiteral(properties: import('ts-morph').Node[]): Record<string, unknown> | null {
  const result: Record<string, unknown> = {};
  for (const prop of properties) {
    if (!Node.isPropertyAssignment(prop)) return null;
    const key = prop.getName();
    const val = prop.getInitializer();
    if (!val) return null;
    const extracted = extractLiteralValue(val);
    if (extracted === undefined) return null;
    result[key] = extracted;
  }
  return result;
}

/**
 * Match a utility function call expression against the active utility registry.
 * Handles both bare calls `utilityFn(a, b)` and awaited calls `await utilityFn(a, b)`.
 * @param expr The expression node (may be AwaitExpression or CallExpression)
 * @param returnVariable Optional variable name when the call is part of a variable declaration
 */
function matchUtilityCall(expr: Node | undefined, returnVariable?: string): UtilityCallDataType | null {
  if (!expr || activeUtilityMap.size === 0) return null;

  let isAwaited = false;
  let callExpr: Node = expr;

  // Unwrap await
  if (Node.isAwaitExpression(expr)) {
    isAwaited = true;
    callExpr = (expr as AwaitExpression).getExpression();
  }

  if (!Node.isCallExpression(callExpr)) return null;

  const callee = (callExpr as CallExpression).getExpression();
  // Only match simple identifiers (not member expressions like obj.method())
  if (!Node.isIdentifier(callee)) return null;

  const functionName = callee.getText();
  const entry = activeUtilityMap.get(functionName);
  if (!entry) return null;

  // Extract arguments
  const callArgs = (callExpr as CallExpression).getArguments();
  const paramNames = entry.parameterNames ?? [];
  const args = callArgs.map((arg, i) => ({
    name: paramNames[i] ?? `arg${i}`,
    value: arg.getText(),
  }));

  return {
    type: 'utilityCall',
    functionName: entry.functionName,
    modulePath: entry.modulePath,
    arguments: args,
    awaitExpression: isAwaited,
    ...(returnVariable ? { returnVariable } : {}),
  };
}

/**
 * Match an array iteration call expression: arr.forEach/map/filter((item) => { ... })
 * Returns IterationDataType if matched, null otherwise.
 * Skips Playwright locator .filter() calls (e.g., page.locator().filter(...)).
 */
function matchIterationCall(expr: Node | undefined, pageObjectMap: Map<string, string>, resultVariable?: string): IterationDataType | null {
  if (!expr) return null;

  // Unwrap await if present
  let innerExpr = expr;
  let isAsync = false;
  if (Node.isAwaitExpression(expr)) {
    innerExpr = (expr as AwaitExpression).getExpression();
  }

  if (!Node.isCallExpression(innerExpr)) return null;

  const callExpr = innerExpr as CallExpression;
  const callee = callExpr.getExpression();

  // Must be a property access: something.forEach / something.map / something.filter
  if (!Node.isPropertyAccessExpression(callee)) return null;

  const propAccess = callee as PropertyAccessExpression;
  const methodName = propAccess.getName();

  if (methodName !== 'forEach' && methodName !== 'map' && methodName !== 'filter') return null;

  const arrayExpressionText = propAccess.getExpression().getText();

  // Skip Playwright locator .filter() calls: anything that starts with page.locator, page.getBy*, etc.
  if (methodName === 'filter') {
    const arrExprText = arrayExpressionText;
    if (/\bpage\b/.test(arrExprText) && /\b(locator|getBy|frameLocator)\b/.test(arrExprText)) {
      return null;
    }
    if (/\.locator\(/.test(arrExprText) || /\.getBy/.test(arrExprText)) {
      return null;
    }
  }

  // The first argument must be an arrow function or function expression
  const args = callExpr.getArguments();
  if (args.length === 0) return null;

  const callbackArg = args[0];
  if (!Node.isArrowFunction(callbackArg) && !Node.isFunctionExpression(callbackArg)) return null;

  // Extract callback parameters
  const params = callbackArg.getParameters?.() ?? [];
  const callbackParams = params.map((p: { getName: () => string }) => p.getName());

  // Detect async callback
  if (Node.isArrowFunction(callbackArg) || Node.isFunctionExpression(callbackArg)) {
    isAsync = callbackArg.isAsync?.() ?? false;
  }

  // Extract callback body as child nodes
  const body = callbackArg.getBody?.();
  let children: ActionNode[] = [];

  if (body && Node.isBlock(body)) {
    children = parseStatements(body.getStatements(), pageObjectMap);
  }

  const code = expr.getText();

  return {
    type: 'iteration',
    method: methodName as 'forEach' | 'map' | 'filter',
    arrayExpression: arrayExpressionText,
    callbackParams,
    children,
    code,
    ...(resultVariable ? { resultVariable } : {}),
    ...(isAsync ? { isAsync: true } : {}),
  };
}

function makeCodeBlock(code: string, yPos: number): ActionNode {
  return {
    id: nextNodeId(),
    type: 'codeBlock',
    position: { x: 250, y: yPos },
    data: {
      type: 'codeBlock',
      code: code.trim(),
    },
  };
}

// ─── Loop Parsing ────────────────────────────────────────────────────

function parseForStatement(stmt: ForStatement, yPos: number, pageObjectMap: Map<string, string>): ActionNode {
  const initializer = stmt.getInitializer()?.getText() ?? '';
  const condition = stmt.getCondition()?.getText() ?? '';
  const incrementer = stmt.getIncrementor()?.getText() ?? '';

  const body = stmt.getStatement();
  let bodyNodes: ActionNode[] = [];
  if (Node.isBlock(body)) {
    bodyNodes = parseStatements(body.getStatements(), pageObjectMap);
  }

  return {
    id: nextNodeId(),
    type: 'loop',
    position: { x: 250, y: yPos },
    data: {
      type: 'loop',
      loopKind: 'for',
      initializer,
      condition,
      incrementer,
      code: stmt.getText(),
      body: bodyNodes,
    },
  };
}

function parseForOfStatement(stmt: ForOfStatement, yPos: number, pageObjectMap: Map<string, string>): ActionNode {
  const initializer = stmt.getInitializer();
  const variableName = initializer.getText().replace(/^(const|let|var)\s+/, '');
  const iterable = stmt.getExpression().getText();

  const body = stmt.getStatement();
  let bodyNodes: ActionNode[] = [];
  if (Node.isBlock(body)) {
    bodyNodes = parseStatements(body.getStatements(), pageObjectMap);
  }

  return {
    id: nextNodeId(),
    type: 'loop',
    position: { x: 250, y: yPos },
    data: {
      type: 'loop',
      loopKind: 'for...of',
      variableName,
      iterable,
      code: stmt.getText(),
      body: bodyNodes,
    },
  };
}

function parseForInStatement(stmt: ForInStatement, yPos: number, pageObjectMap: Map<string, string>): ActionNode {
  const initializer = stmt.getInitializer();
  const variableName = initializer.getText().replace(/^(const|let|var)\s+/, '');
  const iterable = stmt.getExpression().getText();

  const body = stmt.getStatement();
  let bodyNodes: ActionNode[] = [];
  if (Node.isBlock(body)) {
    bodyNodes = parseStatements(body.getStatements(), pageObjectMap);
  }

  return {
    id: nextNodeId(),
    type: 'loop',
    position: { x: 250, y: yPos },
    data: {
      type: 'loop',
      loopKind: 'for...in',
      variableName,
      iterable,
      code: stmt.getText(),
      body: bodyNodes,
    },
  };
}

function parseWhileStatement(stmt: WhileStatement, yPos: number, pageObjectMap: Map<string, string>): ActionNode {
  const condition = stmt.getExpression().getText();

  const body = stmt.getStatement();
  let bodyNodes: ActionNode[] = [];
  if (Node.isBlock(body)) {
    bodyNodes = parseStatements(body.getStatements(), pageObjectMap);
  }

  return {
    id: nextNodeId(),
    type: 'loop',
    position: { x: 250, y: yPos },
    data: {
      type: 'loop',
      loopKind: 'while',
      condition,
      code: stmt.getText(),
      body: bodyNodes,
    },
  };
}

function parseDoWhileStatement(stmt: DoStatement, yPos: number, pageObjectMap: Map<string, string>): ActionNode {
  const condition = stmt.getExpression().getText();

  const body = stmt.getStatement();
  let bodyNodes: ActionNode[] = [];
  if (Node.isBlock(body)) {
    bodyNodes = parseStatements(body.getStatements(), pageObjectMap);
  }

  return {
    id: nextNodeId(),
    type: 'loop',
    position: { x: 250, y: yPos },
    data: {
      type: 'loop',
      loopKind: 'do...while',
      condition,
      code: stmt.getText(),
      body: bodyNodes,
    },
  };
}

// ─── Conditional Parsing ─────────────────────────────────────────────

function parseIfStatement(stmt: IfStatement, yPos: number, pageObjectMap: Map<string, string>): ActionNode {
  const condition = stmt.getExpression().getText();

  // Parse then block
  const thenStmt = stmt.getThenStatement();
  let thenChildren: ActionNode[] = [];
  if (Node.isBlock(thenStmt)) {
    thenChildren = parseStatements(thenStmt.getStatements(), pageObjectMap);
  }

  // Parse else-if branches and else block
  const elseIfBranches: { condition: string; children: ActionNode[] }[] = [];
  let elseChildren: ActionNode[] | undefined;

  let elseStmt = stmt.getElseStatement();
  while (elseStmt) {
    if (Node.isIfStatement(elseStmt)) {
      // else-if branch
      const elseIfStmt = elseStmt as IfStatement;
      const branchCondition = elseIfStmt.getExpression().getText();
      const branchThen = elseIfStmt.getThenStatement();
      let branchChildren: ActionNode[] = [];
      if (Node.isBlock(branchThen)) {
        branchChildren = parseStatements(branchThen.getStatements(), pageObjectMap);
      }
      elseIfBranches.push({ condition: branchCondition, children: branchChildren });
      elseStmt = elseIfStmt.getElseStatement();
    } else if (Node.isBlock(elseStmt)) {
      // else block
      elseChildren = parseStatements(elseStmt.getStatements(), pageObjectMap);
      elseStmt = undefined;
    } else {
      elseStmt = undefined;
    }
  }

  return {
    id: nextNodeId(),
    type: 'conditional',
    position: { x: 250, y: yPos },
    data: {
      type: 'conditional',
      condition,
      thenChildren,
      ...(elseIfBranches.length > 0 ? { elseIfBranches } : {}),
      ...(elseChildren ? { elseChildren } : {}),
      code: stmt.getText(),
    },
  };
}

// ─── Try/Catch/Finally Parsing ────────────────────────────────────────

function parseTryStatement(stmt: TryStatement, yPos: number, pageObjectMap: Map<string, string>): ActionNode {
  // Parse try block
  const tryBlock = stmt.getTryBlock();
  const tryChildren = parseStatements(tryBlock.getStatements(), pageObjectMap);

  // Parse catch clause
  let catchVariable: string | undefined;
  let catchChildren: ActionNode[] | undefined;
  const catchClause = stmt.getCatchClause();
  if (catchClause) {
    const varDecl = catchClause.getVariableDeclaration();
    catchVariable = varDecl?.getName();
    catchChildren = parseStatements(catchClause.getBlock().getStatements(), pageObjectMap);
  }

  // Parse finally block
  let finallyChildren: ActionNode[] | undefined;
  const finallyBlock = stmt.getFinallyBlock();
  if (finallyBlock) {
    finallyChildren = parseStatements(finallyBlock.getStatements(), pageObjectMap);
  }

  return {
    id: nextNodeId(),
    type: 'tryCatch',
    position: { x: 250, y: yPos },
    data: {
      type: 'tryCatch',
      tryChildren,
      ...(catchVariable !== undefined ? { catchVariable } : {}),
      ...(catchChildren ? { catchChildren } : {}),
      ...(finallyChildren ? { finallyChildren } : {}),
      code: stmt.getText(),
    },
  };
}

// ─── Switch Statement Parsing ─────────────────────────────────────────

function parseSwitchStatement(stmt: SwitchStatement, yPos: number, pageObjectMap: Map<string, string>): ActionNode {
  const expression = stmt.getExpression().getText();
  const caseBlock = stmt.getCaseBlock();
  const clauses = caseBlock.getClauses();

  const cases: SwitchCaseType[] = [];
  // Track grouped case values (case 'a': case 'b': ... body)
  let pendingValues: string[] = [];

  for (let i = 0; i < clauses.length; i++) {
    const clause = clauses[i];
    const statements = clause.getStatements();

    if (Node.isCaseClause(clause)) {
      const caseValue = clause.getExpression().getText();

      // If this clause has no statements, it is a grouped case that falls through
      if (statements.length === 0) {
        pendingValues.push(caseValue);
        continue;
      }

      // Combine pending grouped values with this case
      const allValues = [...pendingValues, caseValue];
      pendingValues = [];

      // Determine if case falls through (no break at end)
      const lastStatement = statements[statements.length - 1];
      const hasBreak = Node.isBreakStatement(lastStatement);

      // Parse child statements (exclude trailing break)
      const bodyStatements = hasBreak ? statements.slice(0, -1) : statements;
      const children = parseStatements(bodyStatements as Statement[], pageObjectMap);

      // For grouped cases, emit one entry per value sharing children
      for (let v = 0; v < allValues.length; v++) {
        if (v < allValues.length - 1) {
          // Earlier grouped values fall through to the last
          cases.push({
            value: allValues[v],
            children: [],
            fallsThrough: true,
          });
        } else {
          cases.push({
            value: allValues[v],
            children,
            fallsThrough: !hasBreak,
          });
        }
      }
    } else {
      // DefaultClause
      // Flush any pending values (unusual but possible)
      for (const v of pendingValues) {
        cases.push({ value: v, children: [], fallsThrough: true });
      }
      pendingValues = [];

      const lastStatement = statements.length > 0 ? statements[statements.length - 1] : undefined;
      const hasBreak = lastStatement ? Node.isBreakStatement(lastStatement) : false;
      const bodyStatements = hasBreak ? statements.slice(0, -1) : statements;
      const children = parseStatements(bodyStatements as Statement[], pageObjectMap);

      cases.push({
        value: null,
        children,
        fallsThrough: !hasBreak,
      });
    }
  }

  // Flush any remaining pending values
  for (const v of pendingValues) {
    cases.push({ value: v, children: [], fallsThrough: true });
  }

  return {
    id: nextNodeId(),
    type: 'switch',
    position: { x: 250, y: yPos },
    data: {
      type: 'switch',
      expression,
      cases,
      code: stmt.getText(),
    },
  };
}

// ─── test.step() Parsing ─────────────────────────────────────────────

function parseTestStep(call: CallExpression, yPos: number, pageObjectMap: Map<string, string>): ActionNode | null {
  const args = call.getArguments();
  if (args.length < 2) return null;

  // First argument: step name (string literal)
  const nameArg = args[0];
  if (!Node.isStringLiteral(nameArg)) return null;
  const stepName = nameArg.getLiteralValue();

  // Second argument: callback (arrow function or function expression)
  const callback = args[1];
  if (!Node.isArrowFunction(callback) && !Node.isFunctionExpression(callback)) return null;

  const body = Node.isArrowFunction(callback)
    ? callback.getBody()
    : (callback as any).getBody();

  let children: ActionNode[] = [];
  if (Node.isBlock(body)) {
    children = parseStatements(body.getStatements(), pageObjectMap);
  }

  return {
    id: nextNodeId(),
    type: 'group',
    position: { x: 250, y: yPos },
    data: {
      type: 'group',
      stepName,
      children,
    },
  };
}

// ─── Page Object Discovery ───────────────────────────────────────────

/** Standard Playwright page/locator methods that should NOT be treated as page object calls. */
const STANDARD_PLAYWRIGHT_METHODS = new Set([
  'goto', 'click', 'fill', 'hover', 'selectOption', 'screenshot',
  'waitForTimeout', 'waitForSelector', 'waitForLoadState', 'waitForURL',
  'waitForNavigation', 'waitForEvent', 'waitForFunction', 'waitForResponse',
  'waitForRequest', 'reload', 'goBack', 'goForward', 'close',
  'locator', 'getByRole', 'getByText', 'getByLabel', 'getByPlaceholder',
  'getByTestId', 'getByAltText', 'getByTitle', 'frameLocator',
  'evaluate', 'evaluateHandle', 'setViewportSize', 'keyboard', 'mouse',
  'type', 'press', 'check', 'uncheck', 'dblclick', 'tap',
  'textContent', 'innerText', 'innerHTML', 'getAttribute', 'inputValue',
  'isVisible', 'isEnabled', 'isDisabled', 'isChecked', 'isHidden',
  'focus', 'blur', 'dispatchEvent', 'scrollIntoViewIfNeeded',
  'setInputFiles', 'selectText', 'dragTo',
]);

/**
 * Auto-discover page object variable-to-class mappings from the source file.
 *
 * Detects two patterns:
 * 1. Destructured fixtures: `async ({ page, loginPage, dashboardPage }) => {`
 *    — if the fixture name contains "page"/"Page" (but isn't exactly "page"), it's
 *    likely a page object. The class ID is derived by capitalizing the first letter.
 * 2. Constructor calls: `const loginPage = new LoginPage(page)`
 *    — maps `loginPage` to `LoginPage`.
 */
function discoverPageObjects(sourceFile: SourceFile): Map<string, string> {
  const map = new Map<string, string>();

  // 1. Fixture destructuring in test/hook callbacks
  const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
  for (const call of calls) {
    const exprText = call.getExpression().getText();
    if (
      exprText === 'test' || exprText === 'test.only' || exprText === 'test.skip' ||
      exprText === 'test.beforeEach' || exprText === 'test.afterEach'
    ) {
      const args = call.getArguments();
      const callback = args.find(a => Node.isArrowFunction(a) || Node.isFunctionExpression(a));
      if (callback) {
        const params = Node.isArrowFunction(callback)
          ? callback.getParameters()
          : (callback as any).getParameters();
        for (const param of params) {
          const bindingPattern = param.getNameNode();
          if (Node.isObjectBindingPattern(bindingPattern)) {
            for (const element of bindingPattern.getElements()) {
              const name = element.getName();
              // Must contain "page"/"Page" but not be exactly "page"
              if (name !== 'page' && /[pP]age/.test(name)) {
                // Derive class ID: capitalize first letter
                const classId = name.charAt(0).toUpperCase() + name.slice(1);
                map.set(name, classId);
              }
            }
          }
        }
      }
    }
  }

  // 2. Constructor calls: const loginPage = new LoginPage(...)
  const variableStatements = sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration);
  for (const decl of variableStatements) {
    const varName = decl.getName();
    const initializer = decl.getInitializer();
    if (initializer && Node.isNewExpression(initializer)) {
      const className = initializer.getExpression().getText();
      map.set(varName, className);
    }
  }

  return map;
}

// ─── New Tab / Multi-Page Matching ───────────────────────────────────

/**
 * Match the Promise.all pattern for opening a new tab:
 *   const [newPage] = await Promise.all([
 *     context.waitForEvent('page'),
 *     page.click('a[target=_blank]')
 *   ]);
 */
function matchPromiseAllNewTab(callExpr: CallExpression, nameNode: Node): NewTabDataType | null {
  const args = callExpr.getArguments();
  if (args.length !== 1) return null;

  const arrayArg = args[0];
  if (!Node.isArrayLiteralExpression(arrayArg)) return null;

  const elements = arrayArg.getElements();
  if (elements.length < 2) return null;

  // First element should be context.waitForEvent('page') or similar
  const waitElement = elements[0];
  const waitText = waitElement.getText();
  const isWaitForPage = /\.waitForEvent\s*\(\s*['"]page['"]\s*\)/.test(waitText);
  if (!isWaitForPage) return null;

  // Extract context variable from the wait expression (e.g., 'context' from context.waitForEvent)
  let contextVariable: string | undefined;
  const contextMatch = waitText.match(/^(\w+)\.waitForEvent/);
  if (contextMatch && contextMatch[1] !== 'context') {
    contextVariable = contextMatch[1];
  }

  // Second element is the trigger action
  const triggerElement = elements[1];
  const triggerAction = triggerElement.getText();

  // Try to extract selector from the trigger action
  let triggerSelector: string | undefined;
  const selectorMatch = triggerAction.match(/\.(?:click|press|dblclick)\s*\(\s*['"]([^'"]+)['"]/);
  if (selectorMatch) {
    triggerSelector = selectorMatch[1];
  }

  // Extract page variable from the array destructuring pattern
  const bindingElements = nameNode.getDescendantsOfKind(SyntaxKind.BindingElement);
  if (bindingElements.length === 0) return null;
  const pageVariable = bindingElements[0].getName();

  return {
    type: 'newTab',
    pageVariable,
    triggerAction,
    ...(triggerSelector ? { triggerSelector } : {}),
    ...(contextVariable ? { contextVariable } : {}),
  };
}

/**
 * Match the simpler popup pattern:
 *   const popup = await page.waitForEvent('popup')
 */
function matchWaitForPopup(callExpr: CallExpression, varName: string): NewTabDataType | null {
  const calleeExpr = callExpr.getExpression();
  if (!Node.isPropertyAccessExpression(calleeExpr)) return null;

  const methodName = (calleeExpr as PropertyAccessExpression).getName();
  if (methodName !== 'waitForEvent') return null;

  const args = callExpr.getArguments();
  if (args.length < 1) return null;

  const eventArg = args[0];
  if (!Node.isStringLiteral(eventArg)) return null;

  const eventName = eventArg.getLiteralValue();
  if (eventName !== 'popup') return null;

  // Extract the object that waitForEvent is called on (e.g., 'page')
  const obj = (calleeExpr as PropertyAccessExpression).getExpression();
  const contextVariable = obj.getText();

  return {
    type: 'newTab',
    pageVariable: varName,
    triggerAction: `${contextVariable}.waitForEvent('popup')`,
    ...(contextVariable !== 'page' ? { contextVariable } : {}),
  };
}

// ─── File Download Matching ──────────────────────────────────────────

/**
 * Match the Promise.all pattern for file download:
 *   const [download] = await Promise.all([
 *     page.waitForEvent('download'),
 *     page.click('#download-btn')
 *   ]);
 */
function matchPromiseAllDownload(callExpr: CallExpression, nameNode: Node): FileDownloadDataType | null {
  const args = callExpr.getArguments();
  if (args.length !== 1) return null;

  const arrayArg = args[0];
  if (!Node.isArrayLiteralExpression(arrayArg)) return null;

  const elements = arrayArg.getElements();
  if (elements.length < 2) return null;

  // First element should be page.waitForEvent('download') or similar
  const waitElement = elements[0];
  const waitText = waitElement.getText();
  const isWaitForDownload = /\.waitForEvent\s*\(\s*['"]download['"]\s*\)/.test(waitText);
  if (!isWaitForDownload) return null;

  // Second element is the trigger action
  const triggerElement = elements[1];
  const triggerAction = triggerElement.getText();

  // Try to extract selector from the trigger action
  let triggerSelector: string | undefined;
  const selectorMatch = triggerAction.match(/\.(?:click|press|dblclick)\s*\(\s*['"]([^'"]+)['"]/);
  if (selectorMatch) {
    triggerSelector = selectorMatch[1];
  }

  // Extract download variable from the array destructuring pattern
  const bindingElements = nameNode.getDescendantsOfKind(SyntaxKind.BindingElement);
  if (bindingElements.length === 0) return null;
  const downloadVariable = bindingElements[0].getName();

  return {
    type: 'fileDownload',
    downloadVariable,
    triggerAction,
    ...(triggerSelector ? { triggerSelector } : {}),
  };
}

/**
 * Match the simpler sequential download pattern:
 *   const download = await page.waitForEvent('download')
 */
function matchWaitForDownload(callExpr: CallExpression, varName: string): FileDownloadDataType | null {
  const calleeExpr = callExpr.getExpression();
  if (!Node.isPropertyAccessExpression(calleeExpr)) return null;

  const methodName = (calleeExpr as PropertyAccessExpression).getName();
  if (methodName !== 'waitForEvent') return null;

  const args = callExpr.getArguments();
  if (args.length < 1) return null;

  const eventArg = args[0];
  if (!Node.isStringLiteral(eventArg)) return null;

  const eventName = eventArg.getLiteralValue();
  if (eventName !== 'download') return null;

  // Extract the object that waitForEvent is called on (e.g., 'page')
  const obj = (calleeExpr as PropertyAccessExpression).getExpression();
  const contextVariable = obj.getText();

  return {
    type: 'fileDownload',
    downloadVariable: varName,
    triggerAction: `${contextVariable}.waitForEvent('download')`,
  };
}

/**
 * Match follow-up statements on a download variable:
 *   await download.saveAs('/tmp/file.pdf')
 *   const path = await download.path()
 *   const filename = await download.suggestedFilename()
 *
 * When matched, updates the download node data in-place and returns true.
 */
function matchDownloadFollowUp(stmt: Statement, downloadVariables: Map<string, ActionNode>): boolean {
  if (downloadVariables.size === 0) return false;

  const text = stmt.getText();

  // Check for download.saveAs('path')
  for (const [varName, node] of downloadVariables) {
    const saveAsMatch = text.match(new RegExp(`${varName}\\.saveAs\\s*\\(\\s*['\`"]([^'\`"]+)['\`"]\\s*\\)`));
    if (saveAsMatch) {
      const data = node.data as FileDownloadDataType;
      data.savePath = saveAsMatch[1];
      return true;
    }

    // Check for download.suggestedFilename()
    const suggestedMatch = text.match(new RegExp(`${varName}\\.suggestedFilename\\s*\\(`));
    if (suggestedMatch) {
      const data = node.data as FileDownloadDataType;
      data.suggestedFilename = true;
      // If saveAs uses suggestedFilename in the expression, try to capture the full save path
      const saveAsWithSuggested = text.match(new RegExp(`${varName}\\.saveAs\\s*\\(([^)]+)\\)`));
      if (saveAsWithSuggested) {
        data.savePath = saveAsWithSuggested[1].trim();
      }
      return true;
    }

    // Check for download.path()
    const pathMatch = text.match(new RegExp(`${varName}\\.path\\s*\\(`));
    if (pathMatch) {
      // path() is just a read operation, no data to store; skip the statement
      return true;
    }
  }

  return false;
}

/**
 * Match a page object method call expression like `loginPage.login('user', 'pass')`.
 *
 * Returns a `pageObjectRef` ActionData if the object is a known page object,
 * or if the variable name heuristically looks like a page object (ends with
 * Page/page) and the method isn't a standard Playwright method.
 */
function matchPageObjectCall(expr: Node, pageObjectMap: Map<string, string>): ActionData | null {
  if (!Node.isCallExpression(expr)) return null;

  const callExpr = expr as CallExpression;
  const calleeExpr = callExpr.getExpression();

  if (!Node.isPropertyAccessExpression(calleeExpr)) return null;

  const propAccess = calleeExpr as PropertyAccessExpression;
  const methodName = propAccess.getName();
  const objectExpr = propAccess.getExpression();

  // We only handle simple `variable.method(...)` calls (not chained calls)
  const objectName = objectExpr.getText();

  // Skip if the method is a standard Playwright method — those are handled elsewhere
  if (STANDARD_PLAYWRIGHT_METHODS.has(methodName)) return null;

  // Check explicit map first
  let pageObjectId = pageObjectMap.get(objectName);

  // Heuristic fallback: variable name ends with Page or page (but isn't just "page")
  if (!pageObjectId && objectName !== 'page' && /[Pp]age$/.test(objectName)) {
    pageObjectId = objectName.charAt(0).toUpperCase() + objectName.slice(1);
  }

  if (!pageObjectId) return null;

  // Extract arguments as string representations
  const args = callExpr.getArguments().map(arg => {
    if (Node.isStringLiteral(arg)) {
      return arg.getLiteralValue();
    }
    return arg.getText();
  });

  return {
    type: 'pageObjectRef',
    pageObjectId,
    method: methodName,
    args,
  };
}

// ─── Playwright Action Matching ──────────────────────────────────────

function matchPlaywrightAction(expr: Node): ActionData | null {
  if (!Node.isCallExpression(expr)) return null;

  const callExpr = expr as CallExpression;
  const fullText = callExpr.getText();

  // page.goto(url)
  if (isMethodCall(callExpr, 'goto')) {
    const args = callExpr.getArguments();
    if (args.length >= 1) {
      return {
        type: 'navigate',
        url: extractStringValue(args[0]),
      };
    }
  }

  // page.locator(...).click() / page.getByRole(...).click() etc.
  if (isMethodCall(callExpr, 'click')) {
    const locator = extractLocatorFromChain(callExpr);
    if (locator) {
      return { type: 'click', locator };
    }
  }

  // page.locator(...).fill(value)
  if (isMethodCall(callExpr, 'fill')) {
    const locator = extractLocatorFromChain(callExpr);
    const args = callExpr.getArguments();
    if (locator && args.length >= 1) {
      return {
        type: 'fill',
        locator,
        value: extractStringValue(args[0]),
      };
    }
  }

  // page.locator(...).hover()
  if (isMethodCall(callExpr, 'hover')) {
    const locator = extractLocatorFromChain(callExpr);
    if (locator) {
      return { type: 'hover', locator };
    }
  }

  // page.locator(...).selectOption(value)
  if (isMethodCall(callExpr, 'selectOption')) {
    const locator = extractLocatorFromChain(callExpr);
    const args = callExpr.getArguments();
    if (locator && args.length >= 1) {
      return {
        type: 'selectOption',
        locator,
        value: extractStringValue(args[0]),
      };
    }
  }

  // page.screenshot(options)
  if (isMethodCall(callExpr, 'screenshot')) {
    const args = callExpr.getArguments();
    const options: { name?: string; fullPage?: boolean } = {};
    if (args.length >= 1 && Node.isObjectLiteralExpression(args[0])) {
      const obj = args[0];
      const pathProp = obj.getProperty('path');
      if (pathProp && Node.isPropertyAssignment(pathProp)) {
        const init = pathProp.getInitializer();
        if (init && Node.isStringLiteral(init)) {
          options.name = init.getLiteralValue();
        }
      }
      const fullPageProp = obj.getProperty('fullPage');
      if (fullPageProp && Node.isPropertyAssignment(fullPageProp)) {
        const init = fullPageProp.getInitializer();
        if (init) options.fullPage = init.getText() === 'true';
      }
    }
    return { type: 'screenshot', ...options };
  }

  // page.waitForTimeout(ms)
  if (isMethodCall(callExpr, 'waitForTimeout')) {
    const args = callExpr.getArguments();
    if (args.length >= 1 && Node.isNumericLiteral(args[0])) {
      return {
        type: 'wait',
        duration: args[0].getLiteralValue(),
      };
    }
  }

  // page.route(pattern, handler)
  if (isMethodCall(callExpr, 'route')) {
    const routeData = matchRouteCall(callExpr);
    if (routeData) return routeData;
  }

  // page.routeFromHAR(path, options?)
  if (isMethodCall(callExpr, 'routeFromHAR')) {
    const harData = matchRouteFromHAR(callExpr);
    if (harData) return harData;
  }

  // page.on('dialog', ...) or page.once('dialog', ...)
  if (isMethodCall(callExpr, 'on') || isMethodCall(callExpr, 'once')) {
    const dialogData = matchDialogHandler(callExpr);
    if (dialogData) return dialogData;
  }

  // page.setInputFiles(selector, files) or locator.setInputFiles(files)
  if (isMethodCall(callExpr, 'setInputFiles')) {
    const fileUploadData = matchFileUpload(callExpr);
    if (fileUploadData) return fileUploadData;
  }

  // context.storageState({ path: '...' }) or page.context().storageState({ path: '...' })
  if (isMethodCall(callExpr, 'storageState')) {
    const storageData = matchStorageStateSave(callExpr);
    if (storageData) return storageData;
  }

  // context.addCookies([...])
  if (isMethodCall(callExpr, 'addCookies')) {
    const cookieData = matchAddCookies(callExpr);
    if (cookieData) return cookieData;
  }

  // context.clearCookies()
  if (isMethodCall(callExpr, 'clearCookies')) {
    const cookieData = matchClearCookies(callExpr);
    if (cookieData) return cookieData;
  }

  // page.evaluate(() => localStorage.setItem(...)) / sessionStorage.*
  if (isMethodCall(callExpr, 'evaluate')) {
    const storageData = matchBrowserStorage(callExpr);
    if (storageData) return storageData;
  }

  return null;
}

// ─── File Upload Matching ───────────────────────────────────────────

/**
 * Match `page.setInputFiles(selector, files)` or `locator.setInputFiles(files)`.
 *
 * Supported forms:
 *   - `page.setInputFiles('#upload', 'file.pdf')`
 *   - `page.setInputFiles('#upload', ['file1.pdf', 'file2.pdf'])`
 *   - `page.setInputFiles('#upload', [])`
 *   - `page.locator('#upload').setInputFiles('file.pdf')`
 *   - `page.locator('#upload').setInputFiles(['file1.pdf', 'file2.pdf'])`
 *   - `page.locator('#upload').setInputFiles([])`
 */
function matchFileUpload(callExpr: CallExpression): FileUploadDataType | null {
  const callee = callExpr.getExpression();
  if (!Node.isPropertyAccessExpression(callee)) return null;

  const objectExpr = (callee as PropertyAccessExpression).getExpression();
  const args = callExpr.getArguments();

  // Form 1: page.setInputFiles(selector, files)
  if (objectExpr.getText() === 'page' && args.length >= 2) {
    const selector = extractStringValue(args[0]);
    const files = extractFilePathsArg(args[1]);
    return {
      type: 'fileUpload',
      selector,
      files,
    };
  }

  // Form 2: page.locator(selector).setInputFiles(files)
  // The object before .setInputFiles() is a locator chain
  if (args.length >= 1) {
    const locator = extractLocatorFromExpression(objectExpr);
    if (locator && locator.kind === 'inline') {
      const files = extractFilePathsArg(args[0]);
      return {
        type: 'fileUpload',
        selector: locator.value,
        files,
        locatorMethod: locator.strategy,
      };
    }
  }

  return null;
}

/**
 * Extract file paths from a setInputFiles argument.
 * Handles string literals, array literals of strings, and empty arrays.
 */
function extractFilePathsArg(node: Node): string[] {
  // Single string: 'file.pdf'
  if (Node.isStringLiteral(node)) {
    return [node.getLiteralValue()];
  }

  // Array literal: ['file1.pdf', 'file2.pdf'] or []
  if (Node.isArrayLiteralExpression(node)) {
    const elements = node.getElements();
    return elements
      .filter(el => Node.isStringLiteral(el))
      .map(el => (el as any).getLiteralValue() as string);
  }

  // Fallback: treat as single string
  const text = node.getText().replace(/^['"]|['"]$/g, '');
  return text ? [text] : [];
}

// ─── API Request Matching ───────────────────────────────────────────

const API_REQUEST_METHODS: Record<string, 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'> = {
  get: 'GET',
  post: 'POST',
  put: 'PUT',
  delete: 'DELETE',
  patch: 'PATCH',
};

/**
 * Match a `request.get(url, options?)`, `request.post(url, options?)`, etc. call.
 *
 * Supports:
 *   - `request.get('/api/users')`
 *   - `request.post('/api/users', { data: { name: 'John' } })`
 *   - `request.put('/api/users/1', { headers: { 'X-Token': 'abc' }, data: { name: 'Jane' } })`
 *   - `request.delete('/api/users/1')`
 *   - `request.patch('/api/users/1', { data: { status: 'active' } })`
 *
 * @param resultVariable Optional variable name if the call is part of a variable declaration.
 */
function matchApiRequestCall(expr: Node, resultVariable?: string): ActionData | null {
  if (!Node.isCallExpression(expr)) return null;

  const callExpr = expr as CallExpression;
  const calleeExpr = callExpr.getExpression();

  if (!Node.isPropertyAccessExpression(calleeExpr)) return null;

  const propAccess = calleeExpr as PropertyAccessExpression;
  const methodName = propAccess.getName();
  const objectExpr = propAccess.getExpression();

  // Check that the object is `request`
  if (objectExpr.getText() !== 'request') return null;

  // Check that the method is a known HTTP method
  const httpMethod = API_REQUEST_METHODS[methodName];
  if (!httpMethod) return null;

  const args = callExpr.getArguments();
  if (args.length < 1) return null;

  // Extract URL from first argument
  const url = extractStringValue(args[0]);

  // Extract options from second argument (if present)
  let headers: Record<string, string> | undefined;
  let body: string | undefined;
  let params: Record<string, string> | undefined;

  if (args.length >= 2 && Node.isObjectLiteralExpression(args[1])) {
    const optionsObj = args[1];

    // Extract headers
    const headersProp = optionsObj.getProperty('headers');
    if (headersProp && Node.isPropertyAssignment(headersProp)) {
      const init = headersProp.getInitializer();
      if (init && Node.isObjectLiteralExpression(init)) {
        headers = {};
        for (const prop of init.getProperties()) {
          if (Node.isPropertyAssignment(prop)) {
            const key = prop.getName().replace(/^['"]|['"]$/g, '');
            const val = prop.getInitializer();
            if (val) {
              headers[key] = Node.isStringLiteral(val) ? val.getLiteralValue() : val.getText();
            }
          }
        }
      }
    }

    // Extract body from `data` or `form` property
    const dataProp = optionsObj.getProperty('data') ?? optionsObj.getProperty('form');
    if (dataProp && Node.isPropertyAssignment(dataProp)) {
      const init = dataProp.getInitializer();
      if (init) {
        body = init.getText();
      }
    }

    // Extract params
    const paramsProp = optionsObj.getProperty('params');
    if (paramsProp && Node.isPropertyAssignment(paramsProp)) {
      const init = paramsProp.getInitializer();
      if (init && Node.isObjectLiteralExpression(init)) {
        params = {};
        for (const prop of init.getProperties()) {
          if (Node.isPropertyAssignment(prop)) {
            const key = prop.getName().replace(/^['"]|['"]$/g, '');
            const val = prop.getInitializer();
            if (val) {
              params[key] = Node.isStringLiteral(val) ? val.getLiteralValue() : val.getText();
            }
          }
        }
      }
    }
  }

  return {
    type: 'apiRequest',
    method: httpMethod,
    url,
    ...(headers ? { headers } : {}),
    ...(body ? { body } : {}),
    ...(resultVariable ? { resultVariable } : {}),
    ...(params ? { params } : {}),
  };
}

// ─── Route Matching ──────────────────────────────────────────────────

/**
 * Match a `page.route(pattern, handler)` call and extract route interception data.
 *
 * Supports common single-expression handler patterns:
 *   - `route => route.fulfill({ ... })`
 *   - `route => route.abort(reason?)`
 *   - `route => route.continue({ ... })`
 *
 * Also handles block-body arrow functions with a single route.* call.
 */
function matchRouteCall(callExpr: CallExpression): NetworkRouteDataType | null {
  const args = callExpr.getArguments();
  if (args.length < 2) return null;

  // Extract URL pattern (string literal or regex literal)
  const patternArg = args[0];
  let urlPattern: string;
  if (Node.isStringLiteral(patternArg)) {
    urlPattern = patternArg.getLiteralValue();
  } else if (Node.isRegularExpressionLiteral(patternArg)) {
    urlPattern = patternArg.getText();
  } else {
    urlPattern = patternArg.getText();
  }

  // Extract handler callback
  const handlerArg = args[1];
  if (!Node.isArrowFunction(handlerArg) && !Node.isFunctionExpression(handlerArg)) {
    return null;
  }

  // Find the route.fulfill/abort/continue call inside the handler body
  const body = Node.isArrowFunction(handlerArg) ? handlerArg.getBody() : (handlerArg as any).getBody();

  let routeCall: CallExpression | null = null;

  if (Node.isCallExpression(body)) {
    // Concise arrow: route => route.fulfill(...)
    routeCall = body as CallExpression;
  } else if (Node.isBlock(body)) {
    // Block arrow: route => { route.fulfill(...); }
    const stmts = body.getStatements();
    // Look for the first expression statement with a route.* call
    for (const s of stmts) {
      if (Node.isExpressionStatement(s)) {
        let inner = s.getExpression();
        if (Node.isAwaitExpression(inner)) {
          inner = (inner as AwaitExpression).getExpression();
        }
        if (Node.isCallExpression(inner)) {
          const callee = inner.getExpression();
          if (Node.isPropertyAccessExpression(callee)) {
            const methodName = (callee as PropertyAccessExpression).getName();
            if (['fulfill', 'abort', 'continue'].includes(methodName)) {
              routeCall = inner as CallExpression;
              break;
            }
          }
        }
      }
    }
  }

  if (!routeCall) return null;

  const routeCallee = routeCall.getExpression();
  if (!Node.isPropertyAccessExpression(routeCallee)) return null;

  const handlerMethodName = (routeCallee as PropertyAccessExpression).getName();

  if (handlerMethodName === 'fulfill') {
    const fulfillOptions = extractFulfillOptions(routeCall);
    return {
      type: 'networkRoute',
      urlPattern,
      handlerAction: 'fulfill',
      ...(fulfillOptions ? { fulfillOptions } : {}),
    };
  }

  if (handlerMethodName === 'abort') {
    const routeArgs = routeCall.getArguments();
    let abortReason: string | undefined;
    if (routeArgs.length >= 1 && Node.isStringLiteral(routeArgs[0])) {
      abortReason = routeArgs[0].getLiteralValue();
    }
    return {
      type: 'networkRoute',
      urlPattern,
      handlerAction: 'abort',
      ...(abortReason ? { abortReason } : {}),
    };
  }

  if (handlerMethodName === 'continue') {
    const continueOverrides = extractContinueOverrides(routeCall);
    return {
      type: 'networkRoute',
      urlPattern,
      handlerAction: 'continue',
      ...(continueOverrides ? { continueOverrides } : {}),
    };
  }

  return null;
}

/**
 * Match a `page.routeFromHAR(path, options?)` call and extract HAR route data.
 */
function matchRouteFromHAR(callExpr: CallExpression): ActionData | null {
  const args = callExpr.getArguments();
  if (args.length < 1) return null;

  // Extract HAR file path from first argument
  const pathArg = args[0];
  let harFilePath: string;
  if (Node.isStringLiteral(pathArg)) {
    harFilePath = pathArg.getLiteralValue();
  } else {
    harFilePath = pathArg.getText();
  }

  // Default to playback mode
  let mode: 'playback' | 'record' = 'playback';
  let url: string | undefined;
  let notFound: 'abort' | 'fallback' | undefined;

  // Extract options from second argument
  if (args.length >= 2 && Node.isObjectLiteralExpression(args[1])) {
    const optionsObj = args[1];
    for (const prop of (optionsObj as any).getProperties()) {
      if (!Node.isPropertyAssignment(prop)) continue;
      const name = prop.getName();
      const init = prop.getInitializer();
      if (!init) continue;

      if (name === 'update' && init.getText() === 'true') {
        mode = 'record';
      } else if (name === 'url' && Node.isStringLiteral(init)) {
        url = init.getLiteralValue();
      } else if (name === 'notFound' && Node.isStringLiteral(init)) {
        const val = init.getLiteralValue();
        if (val === 'abort' || val === 'fallback') {
          notFound = val;
        }
      }
    }
  }

  return {
    type: 'harRoute' as const,
    harFilePath,
    mode,
    ...(url ? { url } : {}),
    ...(notFound ? { notFound } : {}),
  };
}

/**
 * Extract fulfill options from a `route.fulfill({ ... })` call.
 */
function extractFulfillOptions(callExpr: CallExpression): FulfillOptionsType | undefined {
  const args = callExpr.getArguments();
  if (args.length === 0) return undefined;

  const arg = args[0];
  if (!Node.isObjectLiteralExpression(arg)) return undefined;

  const options: FulfillOptionsType = {};

  const statusProp = arg.getProperty('status');
  if (statusProp && Node.isPropertyAssignment(statusProp)) {
    const init = statusProp.getInitializer();
    if (init && Node.isNumericLiteral(init)) {
      options.status = init.getLiteralValue();
    }
  }

  const contentTypeProp = arg.getProperty('contentType');
  if (contentTypeProp && Node.isPropertyAssignment(contentTypeProp)) {
    const init = contentTypeProp.getInitializer();
    if (init && Node.isStringLiteral(init)) {
      options.contentType = init.getLiteralValue();
    }
  }

  const bodyProp = arg.getProperty('body');
  if (bodyProp && Node.isPropertyAssignment(bodyProp)) {
    const init = bodyProp.getInitializer();
    if (init) {
      if (Node.isStringLiteral(init)) {
        options.body = init.getLiteralValue();
      } else {
        options.body = init.getText();
      }
    }
  }

  const jsonProp = arg.getProperty('json');
  if (jsonProp && Node.isPropertyAssignment(jsonProp)) {
    const init = jsonProp.getInitializer();
    if (init) {
      options.json = init.getText();
    }
  }

  const headersProp = arg.getProperty('headers');
  if (headersProp && Node.isPropertyAssignment(headersProp)) {
    const init = headersProp.getInitializer();
    if (init && Node.isObjectLiteralExpression(init)) {
      const headers: Record<string, string> = {};
      for (const prop of init.getProperties()) {
        if (Node.isPropertyAssignment(prop)) {
          const key = prop.getName().replace(/^['"]|['"]$/g, '');
          const val = prop.getInitializer();
          if (val && Node.isStringLiteral(val)) {
            headers[key] = val.getLiteralValue();
          }
        }
      }
      options.headers = headers;
    }
  }

  // Only return if we extracted something
  if (Object.keys(options).length === 0) return undefined;
  return options;
}

/**
 * Extract continue overrides from a `route.continue({ ... })` call.
 */
function extractContinueOverrides(callExpr: CallExpression): ContinueOverridesType | undefined {
  const args = callExpr.getArguments();
  if (args.length === 0) return undefined;

  const arg = args[0];
  if (!Node.isObjectLiteralExpression(arg)) return undefined;

  const overrides: ContinueOverridesType = {};

  const urlProp = arg.getProperty('url');
  if (urlProp && Node.isPropertyAssignment(urlProp)) {
    const init = urlProp.getInitializer();
    if (init && Node.isStringLiteral(init)) {
      overrides.url = init.getLiteralValue();
    }
  }

  const methodProp = arg.getProperty('method');
  if (methodProp && Node.isPropertyAssignment(methodProp)) {
    const init = methodProp.getInitializer();
    if (init && Node.isStringLiteral(init)) {
      overrides.method = init.getLiteralValue();
    }
  }

  const postDataProp = arg.getProperty('postData');
  if (postDataProp && Node.isPropertyAssignment(postDataProp)) {
    const init = postDataProp.getInitializer();
    if (init && Node.isStringLiteral(init)) {
      overrides.postData = init.getLiteralValue();
    }
  }

  const headersProp = arg.getProperty('headers');
  if (headersProp && Node.isPropertyAssignment(headersProp)) {
    const init = headersProp.getInitializer();
    if (init && Node.isObjectLiteralExpression(init)) {
      const headers: Record<string, string> = {};
      for (const prop of init.getProperties()) {
        if (Node.isPropertyAssignment(prop)) {
          const key = prop.getName().replace(/^['"]|['"]$/g, '');
          const val = prop.getInitializer();
          if (val && Node.isStringLiteral(val)) {
            headers[key] = val.getLiteralValue();
          }
        }
      }
      overrides.headers = headers;
    }
  }

  if (Object.keys(overrides).length === 0) return undefined;
  return overrides;
}

// ─── Dialog Handler Matching ─────────────────────────────────────────

function matchDialogHandler(callExpr: CallExpression): DialogHandlerDataType | null {
  const args = callExpr.getArguments();
  if (args.length < 2) return null;

  const eventArg = args[0];
  if (!Node.isStringLiteral(eventArg)) return null;
  if (eventArg.getLiteralValue() !== 'dialog') return null;

  const callee = callExpr.getExpression();
  if (!Node.isPropertyAccessExpression(callee)) return null;
  const methodName = (callee as PropertyAccessExpression).getName();
  const once = methodName === 'once';

  const objectExpr = (callee as PropertyAccessExpression).getExpression();
  if (objectExpr.getText() !== 'page') return null;

  const handlerArg = args[1];
  if (!Node.isArrowFunction(handlerArg) && !Node.isFunctionExpression(handlerArg)) return null;

  const body = Node.isArrowFunction(handlerArg) ? handlerArg.getBody() : (handlerArg as any).getBody();

  let dialogCall: CallExpression | null = null;

  if (Node.isCallExpression(body)) {
    dialogCall = body as CallExpression;
  } else if (Node.isBlock(body)) {
    const stmts = body.getStatements();
    for (const s of stmts) {
      if (Node.isExpressionStatement(s)) {
        let inner = s.getExpression();
        if (Node.isAwaitExpression(inner)) {
          inner = (inner as AwaitExpression).getExpression();
        }
        if (Node.isCallExpression(inner)) {
          const innerCallee = inner.getExpression();
          if (Node.isPropertyAccessExpression(innerCallee)) {
            const innerMethodName = (innerCallee as PropertyAccessExpression).getName();
            if (innerMethodName === 'accept' || innerMethodName === 'dismiss') {
              dialogCall = inner as CallExpression;
              break;
            }
          }
        }
      }
    }
  }

  if (!dialogCall) return null;

  const dialogCallee = dialogCall.getExpression();
  if (!Node.isPropertyAccessExpression(dialogCallee)) return null;

  const dialogMethodName = (dialogCallee as PropertyAccessExpression).getName();

  if (dialogMethodName === 'accept') {
    const dialogArgs = dialogCall.getArguments();
    let inputText: string | undefined;
    if (dialogArgs.length >= 1 && Node.isStringLiteral(dialogArgs[0])) {
      inputText = dialogArgs[0].getLiteralValue();
    }
    return {
      type: 'dialogHandler',
      action: 'accept',
      once,
      ...(inputText !== undefined ? { inputText } : {}),
    };
  }

  if (dialogMethodName === 'dismiss') {
    return {
      type: 'dialogHandler',
      action: 'dismiss',
      once,
    };
  }

  return null;
}

// ─── Expect Assertion Matching ───────────────────────────────────────

function matchExpectAssertion(expr: Node): ActionData | null {
  if (!Node.isCallExpression(expr)) return null;

  const callExpr = expr as CallExpression;
  const fullText = callExpr.getText();

  // Detect negation: check if the call chain contains `.not.`
  const negated = isNegatedExpect(callExpr);
  const negatedField = negated ? { negated: true as const } : {};

  // Detect soft assertion: check if the call chain uses `expect.soft(...)`
  const soft = isSoftExpect(callExpr);
  const softField = soft ? { soft: true as const } : {};

  // Extract custom failure message: expect(locator, 'message')
  const expectMessage = extractExpectMessage(callExpr);
  const messageField = expectMessage ? { message: expectMessage } : {};

  // expect(locator).toBeVisible() or expect(locator).not.toBeVisible()
  if (isMethodCall(callExpr, 'toBeVisible')) {
    const locator = extractLocatorFromExpect(callExpr);
    if (locator) {
      return { type: 'assertVisible', locator, ...negatedField, ...softField, ...messageField };
    }
  }

  // expect(locator).toHaveText(text) or toContainText(text), with optional .not.
  if (isMethodCall(callExpr, 'toHaveText') || isMethodCall(callExpr, 'toContainText')) {
    const locator = extractLocatorFromExpect(callExpr);
    const args = callExpr.getArguments();
    if (locator && args.length >= 1) {
      return {
        type: 'assertText',
        locator,
        expected: extractStringValue(args[0]),
        exact: isMethodCall(callExpr, 'toHaveText') ? true : undefined,
        ...negatedField,
        ...softField, ...messageField,
      };
    }
  }

  // expect(locator).toHaveCount(n)
  if (isMethodCall(callExpr, 'toHaveCount')) {
    const locator = extractLocatorFromExpect(callExpr);
    const args = callExpr.getArguments();
    if (locator && args.length >= 1) {
      return {
        type: 'assertCount',
        locator,
        expected: extractNumericValue(args[0]),
        ...negatedField,
        ...softField, ...messageField,
      };
    }
  }

  // expect(page).toHaveURL(url) — supports string and regex patterns
  if (isMethodCall(callExpr, 'toHaveURL')) {
    const expectSubject = extractExpectSubject(callExpr);
    if (expectSubject) {
      const args = callExpr.getArguments();
      if (args.length >= 1) {
        const arg = args[0];
        const isRegex = Node.isRegularExpressionLiteral(arg);
        return {
          type: 'assertURL',
          expected: isRegex ? arg.getText() : extractStringValue(arg),
          ...(isRegex ? { isRegex: true as const } : {}),
          ...negatedField,
          ...softField, ...messageField,
        };
      }
    }
  }

  // expect(page).toHaveTitle(title) — supports string and regex patterns
  if (isMethodCall(callExpr, 'toHaveTitle')) {
    const expectSubject = extractExpectSubject(callExpr);
    if (expectSubject) {
      const args = callExpr.getArguments();
      if (args.length >= 1) {
        const arg = args[0];
        const isRegex = Node.isRegularExpressionLiteral(arg);
        return {
          type: 'assertTitle',
          expected: isRegex ? arg.getText() : extractStringValue(arg),
          ...(isRegex ? { isRegex: true as const } : {}),
          ...negatedField,
          ...softField, ...messageField,
        };
      }
    }
  }

  // expect(page).toHaveScreenshot() — visual comparison assertion
  if (isMethodCall(callExpr, 'toHaveScreenshot')) {
    const expectSubject = extractExpectSubject(callExpr);
    if (expectSubject) {
      const args = callExpr.getArguments();
      const result: Record<string, unknown> = {
        type: 'assertScreenshot',
        ...negatedField,
        ...softField, ...messageField,
      };
      // First argument can be a screenshot name (string)
      if (args.length >= 1 && Node.isStringLiteral(args[0])) {
        result.name = args[0].getLiteralValue();
      }
      // Check for options object (could be first or second arg)
      const optionsArg = args.length >= 2 ? args[1] :
        (args.length >= 1 && Node.isObjectLiteralExpression(args[0]) ? args[0] : null);
      if (optionsArg && Node.isObjectLiteralExpression(optionsArg)) {
        const fullPageProp = optionsArg.getProperty('fullPage');
        if (fullPageProp && Node.isPropertyAssignment(fullPageProp)) {
          const init = fullPageProp.getInitializer();
          if (init && init.getText() === 'true') {
            result.fullPage = true;
          }
        }
      }
      return result as ActionData;
    }
  }

  // expect(locator).toHaveAttribute(name, value)
  if (isMethodCall(callExpr, 'toHaveAttribute')) {
    const locator = extractLocatorFromExpect(callExpr);
    const args = callExpr.getArguments();
    if (locator && args.length >= 2) {
      return {
        type: 'assertAttribute',
        locator,
        attributeName: extractStringValue(args[0]),
        expected: extractStringValue(args[1]),
        ...negatedField,
        ...softField, ...messageField,
      };
    }
  }

  // expect(locator).toHaveValue(val)
  if (isMethodCall(callExpr, 'toHaveValue')) {
    const locator = extractLocatorFromExpect(callExpr);
    const args = callExpr.getArguments();
    if (locator && args.length >= 1) {
      return {
        type: 'assertValue',
        locator,
        expected: extractStringValue(args[0]),
        ...negatedField,
        ...softField, ...messageField,
      };
    }
  }

  // expect(locator).toHaveClass(cls)
  if (isMethodCall(callExpr, 'toHaveClass')) {
    const locator = extractLocatorFromExpect(callExpr);
    const args = callExpr.getArguments();
    if (locator && args.length >= 1) {
      return {
        type: 'assertClass',
        locator,
        expected: extractStringValue(args[0]),
        ...negatedField,
        ...softField, ...messageField,
      };
    }
  }

  // State assertions (no expected value)
  if (isMethodCall(callExpr, 'toBeEnabled')) {
    const locator = extractLocatorFromExpect(callExpr);
    if (locator) {
      return { type: 'assertEnabled', locator, ...negatedField, ...softField, ...messageField };
    }
  }

  if (isMethodCall(callExpr, 'toBeDisabled')) {
    const locator = extractLocatorFromExpect(callExpr);
    if (locator) {
      return { type: 'assertDisabled', locator, ...negatedField, ...softField, ...messageField };
    }
  }

  if (isMethodCall(callExpr, 'toBeChecked')) {
    const locator = extractLocatorFromExpect(callExpr);
    if (locator) {
      return { type: 'assertChecked', locator, ...negatedField, ...softField, ...messageField };
    }
  }

  if (isMethodCall(callExpr, 'toBeHidden')) {
    const locator = extractLocatorFromExpect(callExpr);
    if (locator) {
      return { type: 'assertHidden', locator, ...negatedField, ...softField, ...messageField };
    }
  }

  // ─── Response Assertions ───────────────────────────────────────────
  const responseAssertion = matchResponseAssertion(callExpr, negated);
  if (responseAssertion) {
    return responseAssertion;
  }

  return null;
}

// ─── Response Assertion Matching ──────────────────────────────────────

function matchResponseAssertion(callExpr: CallExpression, negated: boolean): ResponseAssertionDataType | null {
  const subjectText = extractExpectSubjectText(callExpr);
  if (!subjectText) return null;
  const assertionMethodName = getAssertionMethodName(callExpr);
  if (!assertionMethodName) return null;
  const assertionArgs = callExpr.getArguments();

  if (assertionMethodName === 'toBeOK') {
    const responseVar = extractResponseVariable(subjectText);
    if (responseVar) {
      return { type: 'responseAssertion', responseVariable: responseVar, assertionType: 'toBeOK', ...(negated ? { negated: true } : {}) };
    }
  }

  const statusMatch = subjectText.match(/^(\w+)\.status\(\)$/);
  if (statusMatch && (assertionMethodName === 'toBe' || assertionMethodName === 'toEqual')) {
    if (assertionArgs.length >= 1) {
      return { type: 'responseAssertion', responseVariable: statusMatch[1], assertionType: 'statusCode', expectedValue: assertionArgs[0].getText(), ...(negated ? { negated: true } : {}) };
    }
  }

  const jsonMatch = subjectText.match(/^(?:await\s+)?(\w+)\.json\(\)$/);
  if (jsonMatch && (assertionMethodName === 'toEqual' || assertionMethodName === 'toMatchObject' || assertionMethodName === 'toStrictEqual')) {
    if (assertionArgs.length >= 1) {
      return { type: 'responseAssertion', responseVariable: jsonMatch[1], assertionType: 'jsonBody', expectedValue: assertionArgs[0].getText(), ...(negated ? { negated: true } : {}) };
    }
  }

  const headerMatch = subjectText.match(/^(\w+)\.headers\(\)\[['"]([^'"]+)['"]\]$/);
  if (headerMatch && (assertionMethodName === 'toContain' || assertionMethodName === 'toBe' || assertionMethodName === 'toEqual')) {
    if (assertionArgs.length >= 1) {
      return { type: 'responseAssertion', responseVariable: headerMatch[1], assertionType: 'headerValue', headerName: headerMatch[2], expectedValue: extractStringValue(assertionArgs[0]), ...(negated ? { negated: true } : {}) };
    }
  }

  const textMatch = subjectText.match(/^(?:await\s+)?(\w+)\.text\(\)$/);
  if (textMatch && (assertionMethodName === 'toBe' || assertionMethodName === 'toContain' || assertionMethodName === 'toEqual')) {
    if (assertionArgs.length >= 1) {
      return { type: 'responseAssertion', responseVariable: textMatch[1], assertionType: 'text', expectedValue: extractStringValue(assertionArgs[0]), ...(negated ? { negated: true } : {}) };
    }
  }

  return null;
}

function extractExpectSubjectText(callExpr: CallExpression): string | null {
  const expr = callExpr.getExpression();
  if (!Node.isPropertyAccessExpression(expr)) return null;
  let objectExpr = (expr as PropertyAccessExpression).getExpression();
  if (Node.isPropertyAccessExpression(objectExpr) && (objectExpr as PropertyAccessExpression).getName() === 'not') {
    objectExpr = (objectExpr as PropertyAccessExpression).getExpression();
  }
  if (Node.isPropertyAccessExpression(objectExpr) && (objectExpr as PropertyAccessExpression).getName() === 'resolves') {
    objectExpr = (objectExpr as PropertyAccessExpression).getExpression();
  }
  if (Node.isCallExpression(objectExpr) && isExpectCall(objectExpr)) {
    const args = objectExpr.getArguments();
    if (args.length >= 1) return args[0].getText();
  }
  return null;
}

function extractResponseVariable(text: string): string | null {
  if (/^\w+$/.test(text) && text !== 'page') return text;
  return null;
}

function getAssertionMethodName(callExpr: CallExpression): string | null {
  const expr = callExpr.getExpression();
  if (Node.isPropertyAccessExpression(expr)) return (expr as PropertyAccessExpression).getName();
  return null;
}

/**
 * Extract the subject of an expect() call (the expression passed to expect).
 * Returns the text of the subject, or null if this is not an expect() call.
 * Used for page-level assertions like expect(page).toHaveURL().
 */
function extractExpectSubject(callExpr: CallExpression): string | null {
  const expr = callExpr.getExpression();
  if (!Node.isPropertyAccessExpression(expr)) return null;

  let objectExpr = (expr as PropertyAccessExpression).getExpression();

  // If negated, unwrap .not
  if (Node.isPropertyAccessExpression(objectExpr) &&
      (objectExpr as PropertyAccessExpression).getName() === 'not') {
    objectExpr = (objectExpr as PropertyAccessExpression).getExpression();
  }

  // Match expect(...) or expect.soft(...)
  if (Node.isCallExpression(objectExpr) && isExpectCall(objectExpr)) {
    const args = objectExpr.getArguments();
    if (args.length >= 1) {
      return args[0].getText();
    }
  }

  return null;
}

function extractNumericValue(node: Node): number {
  if (Node.isNumericLiteral(node)) {
    return node.getLiteralValue();
  }
  // Fallback: try to parse the text
  const num = Number(node.getText());
  return isNaN(num) ? 0 : num;
}

/**
 * Detect whether an expect assertion call is negated via `.not`.
 *
 * The AST for `expect(locator).not.toBeVisible()` is:
 *   CallExpression
 *     callee: PropertyAccessExpression (.toBeVisible)
 *       object: PropertyAccessExpression (.not)
 *         object: CallExpression (expect(...))
 *
 * We check if there is a `.not` PropertyAccessExpression between
 * the assertion method and the expect() call.
 */
function isNegatedExpect(callExpr: CallExpression): boolean {
  const callee = callExpr.getExpression();
  if (!Node.isPropertyAccessExpression(callee)) return false;

  // The object of .toBeVisible() / .toHaveText() etc.
  const objectOfMethod = (callee as PropertyAccessExpression).getExpression();

  // If it's expect(locator).not.toBeVisible(), objectOfMethod is `expect(locator).not`
  // which is a PropertyAccessExpression with name 'not'
  if (Node.isPropertyAccessExpression(objectOfMethod)) {
    return (objectOfMethod as PropertyAccessExpression).getName() === 'not';
  }

  return false;
}

/**
 * Detect whether an expect assertion uses `expect.soft(...)`.
 *
 * The AST for `expect.soft(locator).toBeVisible()` is:
 *   CallExpression (.toBeVisible())
 *     callee: PropertyAccessExpression (.toBeVisible)
 *       object: CallExpression (expect.soft(locator))
 *         callee: PropertyAccessExpression (.soft)
 *           object: Identifier (expect)
 *
 * For `expect.soft(locator).not.toBeVisible()`, we also need to unwrap `.not`.
 */
function isSoftExpect(callExpr: CallExpression): boolean {
  const callee = callExpr.getExpression();
  if (!Node.isPropertyAccessExpression(callee)) return false;

  let objectOfMethod = (callee as PropertyAccessExpression).getExpression();

  // Unwrap .not if present
  if (Node.isPropertyAccessExpression(objectOfMethod) &&
      (objectOfMethod as PropertyAccessExpression).getName() === 'not') {
    objectOfMethod = (objectOfMethod as PropertyAccessExpression).getExpression();
  }

  // objectOfMethod should be the expect.soft(...) or expect(...) CallExpression
  if (Node.isCallExpression(objectOfMethod)) {
    const expectExpr = objectOfMethod.getExpression();
    // Check if callee is `expect.soft`
    if (Node.isPropertyAccessExpression(expectExpr) &&
        (expectExpr as PropertyAccessExpression).getName() === 'soft') {
      const expectObj = (expectExpr as PropertyAccessExpression).getExpression();
      return expectObj.getText() === 'expect';
    }
  }

  return false;
}

/**
 * Extract the custom failure message from an expect() call.
 * Playwright supports `expect(locator, 'custom message')` where the second
 * argument to `expect()` / `expect.soft()` is a string message.
 * Returns the message string if present, or undefined.
 */
function extractExpectMessage(callExpr: CallExpression): string | undefined {
  const callee = callExpr.getExpression();
  if (!Node.isPropertyAccessExpression(callee)) return undefined;

  let objectOfMethod = (callee as PropertyAccessExpression).getExpression();

  // Unwrap .not if present
  if (Node.isPropertyAccessExpression(objectOfMethod) &&
      (objectOfMethod as PropertyAccessExpression).getName() === 'not') {
    objectOfMethod = (objectOfMethod as PropertyAccessExpression).getExpression();
  }

  // objectOfMethod should be the expect(...) or expect.soft(...) CallExpression
  if (Node.isCallExpression(objectOfMethod)) {
    const args = objectOfMethod.getArguments();
    if (args.length >= 2 && Node.isStringLiteral(args[1])) {
      return args[1].getLiteralValue();
    }
  }

  return undefined;
}

/**
 * Check whether a CallExpression is an `expect(...)` or `expect.soft(...)` call.
 * Returns true if so.
 */
function isExpectCall(callExpr: CallExpression): boolean {
  const expr = callExpr.getExpression();
  // expect(...)
  if (expr.getText() === 'expect') return true;
  // expect.soft(...)
  if (Node.isPropertyAccessExpression(expr) &&
      (expr as PropertyAccessExpression).getName() === 'soft') {
    const obj = (expr as PropertyAccessExpression).getExpression();
    return obj.getText() === 'expect';
  }
  return false;
}

// ─── Browser Storage Matching ────────────────────────────────────────

/**
 * Match `page.evaluate(() => localStorage.setItem('key', 'value'))` and similar
 * patterns for localStorage and sessionStorage.
 */
function matchBrowserStorage(callExpr: CallExpression, resultVariable?: string): BrowserStorageDataType | null {
  if (!isMethodCall(callExpr, 'evaluate')) return null;

  const args = callExpr.getArguments();
  if (args.length < 1) return null;

  const arg = args[0];
  if (!Node.isArrowFunction(arg) && !Node.isFunctionExpression(arg)) return null;

  const body = arg.getBody();
  let bodyText: string;
  if (Node.isBlock(body)) {
    const stmts = body.getStatements();
    if (stmts.length !== 1) return null;
    bodyText = stmts[0].getText().replace(/;$/, '');
    if (bodyText.startsWith('return ')) {
      bodyText = bodyText.slice(7);
    }
  } else {
    bodyText = body.getText();
  }

  const storageMatch = bodyText.match(/^(localStorage|sessionStorage)\.(setItem|getItem|removeItem|clear)\((.*)\)$/s);
  if (!storageMatch) return null;

  const storageType = storageMatch[1] as 'localStorage' | 'sessionStorage';
  const operation = storageMatch[2] as 'setItem' | 'getItem' | 'removeItem' | 'clear';
  const argsStr = storageMatch[3].trim();

  const result: BrowserStorageDataType = {
    type: 'browserStorage',
    storageType,
    operation,
  };

  if (resultVariable) {
    result.resultVariable = resultVariable;
  }

  if (operation === 'setItem') {
    const setItemMatch = argsStr.match(/^['"](.+?)['"],\s*['"](.+?)['"]$/);
    if (setItemMatch) {
      result.key = setItemMatch[1];
      result.value = setItemMatch[2];
    }
  } else if (operation === 'getItem' || operation === 'removeItem') {
    const keyMatch = argsStr.match(/^['"](.+?)['"]$/);
    if (keyMatch) {
      result.key = keyMatch[1];
    }
  }

  return result;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function isMethodCall(callExpr: CallExpression, methodName: string): boolean {
  const expr = callExpr.getExpression();
  if (Node.isPropertyAccessExpression(expr)) {
    return expr.getName() === methodName;
  }
  return false;
}

/**
 * Walk up the call chain to find a locator method.
 * e.g., page.getByRole('button', { name: 'Submit' }).click()
 *       -> extracts getByRole('button', { name: 'Submit' })
 */
function extractLocatorFromChain(callExpr: CallExpression): LocatorRef | null {
  const expr = callExpr.getExpression();
  if (!Node.isPropertyAccessExpression(expr)) return null;

  // The object part before .click() / .fill() etc.
  const objectExpr = (expr as PropertyAccessExpression).getExpression();
  return extractLocatorFromExpression(objectExpr);
}

/**
 * Walk up the chain from expect(locator).toBeVisible() or expect(locator).not.toBeVisible()
 * to extract the locator from inside expect()
 */
function extractLocatorFromExpect(callExpr: CallExpression): LocatorRef | null {
  const expr = callExpr.getExpression();
  if (!Node.isPropertyAccessExpression(expr)) return null;

  let objectExpr = (expr as PropertyAccessExpression).getExpression();

  // If negated, objectExpr is `expect(locator).not` — unwrap the `.not` PropertyAccessExpression
  if (Node.isPropertyAccessExpression(objectExpr) &&
      (objectExpr as PropertyAccessExpression).getName() === 'not') {
    objectExpr = (objectExpr as PropertyAccessExpression).getExpression();
  }

  // This should be expect(...) or expect.soft(...)
  if (Node.isCallExpression(objectExpr) && isExpectCall(objectExpr)) {
    const args = objectExpr.getArguments();
    if (args.length >= 1) {
      return extractLocatorFromExpression(args[0]);
    }
  }

  return null;
}

/** Map of Playwright locator method names to our LocatorStrategy */
const LOCATOR_STRATEGY_MAP: Record<string, string> = {
  getByRole: 'getByRole',
  getByText: 'getByText',
  getByLabel: 'getByLabel',
  getByPlaceholder: 'getByPlaceholder',
  getByTestId: 'getByTestId',
  getByAltText: 'getByAltText',
  getByTitle: 'getByTitle',
  locator: 'locator',
  frameLocator: 'frameLocator',
};

/**
 * Extract a single locator step from a call expression node.
 * Returns null if the call is not a recognized locator method.
 */
function extractSingleStep(call: CallExpression): LocatorStep | null {
  const calleeExpr = call.getExpression();
  if (!Node.isPropertyAccessExpression(calleeExpr)) return null;

  const methodName = (calleeExpr as PropertyAccessExpression).getName();
  const args = call.getArguments();

  const strategy = LOCATOR_STRATEGY_MAP[methodName];
  if (strategy && args.length >= 1) {
    let value: string;
    let dynamic: boolean | undefined;

    if (args.length === 1) {
      const arg = args[0];
      if (Node.isStringLiteral(arg)) {
        // Static string literal — current behavior
        value = arg.getLiteralValue();
      } else if (Node.isTemplateExpression(arg) || Node.isNoSubstitutionTemplateLiteral(arg)) {
        // Template literal — dynamic, preserve with backticks
        value = arg.getText();
        dynamic = true;
      } else if (Node.isIdentifier(arg)) {
        // Variable reference — dynamic
        value = arg.getText();
        dynamic = true;
      } else {
        // PropertyAccessExpression or other complex expression — dynamic
        value = arg.getText();
        dynamic = true;
      }
    } else {
      // Multiple args (e.g., getByRole('button', { name: 'Submit' }))
      // Check if the first arg is dynamic
      const firstArg = args[0];
      if (!Node.isStringLiteral(firstArg) && !Node.isNoSubstitutionTemplateLiteral(firstArg)) {
        value = args.map(a => a.getText()).join(', ');
        dynamic = true;
      } else {
        value = args.map(a => a.getText()).join(', ');
      }
    }
    const step: LocatorStep = { strategy: strategy as any, value };
    if (dynamic) step.dynamic = true;
    return step;
  }

  return null;
}

const MODIFIER_METHODS = new Set(['filter', 'nth', 'first', 'last']);

/**
 * Extract a modifier from a call expression (.filter, .nth, .first, .last).
 * Returns null if the call is not a recognized modifier.
 */
function extractModifier(call: CallExpression, methodName: string): LocatorModifier | null {
  const args = call.getArguments();

  switch (methodName) {
    case 'filter': {
      if (args.length === 0) return null;
      const argText = args[0].getText();
      const modifier: LocatorModifier = { kind: 'filter' };
      // Extract hasText from object literal { hasText: 'foo' }
      const hasTextMatch = argText.match(/hasText:\s*['"]([^'"]*)['"]/);
      if (hasTextMatch) {
        modifier.hasText = hasTextMatch[1];
      }
      // Extract has from object literal { has: page.locator('.icon') }
      const hasMatch = argText.match(/has:\s*(page\.\w+\([^)]*\))/);
      if (hasMatch) {
        // Parse the nested locator
        // For simplicity, store as a basic inline locator
        const nestedText = hasMatch[1];
        const locatorMatch = nestedText.match(/page\.(\w+)\(['"]([^'"]*)['"]\)/);
        if (locatorMatch) {
          const nestedStrategy = LOCATOR_STRATEGY_MAP[locatorMatch[1]] ?? 'locator';
          modifier.has = { kind: 'inline', strategy: nestedStrategy as any, value: locatorMatch[2] };
        }
      }
      return modifier;
    }
    case 'nth': {
      if (args.length === 0) return null;
      const indexVal = parseInt(args[0].getText(), 10);
      if (isNaN(indexVal)) return null;
      return { kind: 'nth', index: indexVal };
    }
    case 'first':
      return { kind: 'first' };
    case 'last':
      return { kind: 'last' };
    default:
      return null;
  }
}

/**
 * Recursively walk a locator expression to collect all chained steps and modifiers.
 *
 * For `page.locator('.parent').locator('.child')`, this produces:
 *   [{ strategy: 'locator', value: '.parent' }, { strategy: 'locator', value: '.child' }]
 *
 * For `page.locator('li').nth(2)`, this produces:
 *   [{ strategy: 'locator', value: 'li', modifiers: [{ kind: 'nth', index: 2 }] }]
 */
function collectLocatorSteps(expr: Node): LocatorStep[] {
  if (!Node.isCallExpression(expr)) return [];

  const call = expr as CallExpression;
  const calleeExpr = call.getExpression();
  if (!Node.isPropertyAccessExpression(calleeExpr)) return [];

  const methodName = (calleeExpr as PropertyAccessExpression).getName();

  // Check if this is a modifier call (filter, nth, first, last)
  if (MODIFIER_METHODS.has(methodName)) {
    const modifier = extractModifier(call, methodName);
    const objectExpr = (calleeExpr as PropertyAccessExpression).getExpression();
    const parentSteps = collectLocatorSteps(objectExpr);
    if (parentSteps.length > 0 && modifier) {
      // Attach modifier to the last step
      const lastStep = { ...parentSteps[parentSteps.length - 1] };
      lastStep.modifiers = [...(lastStep.modifiers ?? []), modifier];
      return [...parentSteps.slice(0, -1), lastStep];
    }
    return parentSteps;
  }

  // Check if this is a locator step
  const step = extractSingleStep(call);
  if (!step) return [];

  // The object that the method is called on (e.g., `page` or another locator call)
  const objectExpr = (calleeExpr as PropertyAccessExpression).getExpression();

  // If the object is `page` (or similar root), this is the first step
  if (!Node.isCallExpression(objectExpr)) {
    return [step];
  }

  // Check if the object is itself a locator call (chaining)
  const parentSteps = collectLocatorSteps(objectExpr);
  if (parentSteps.length > 0) {
    return [...parentSteps, step];
  }

  // The parent call is not a locator method (e.g., it could be `page.something()`)
  // — treat this step as the only step
  return [step];
}

function extractLocatorFromExpression(expr: Node): LocatorRef | null {
  const steps = collectLocatorSteps(expr);
  if (steps.length === 0) return null;

  // Always set strategy/value to the first step for backward compat
  const first = steps[0];
  if (steps.length === 1) {
    const ref: LocatorRef = {
      kind: 'inline',
      strategy: first.strategy,
      value: first.value,
    };
    if (first.dynamic) {
      ref.dynamic = true;
    }
    if (first.modifiers && first.modifiers.length > 0) {
      ref.modifiers = first.modifiers;
    }
    return ref;
  }

  // Multiple steps — include the chain array
  const ref: LocatorRef = {
    kind: 'inline',
    strategy: first.strategy,
    value: first.value,
    chain: steps,
  };
  if (first.dynamic) {
    ref.dynamic = true;
  }
  return ref;
}

/**
 * Extract frameLocators from an ActionNode's locator data (if any),
 * separating them into a top-level frameLocators array on the node.
 */
function extractFrameLocatorsFromNode(node: ActionNode): ActionNode {
  const data = node.data;
  // Only process action types that have a locator
  if ('locator' in data && data.locator && data.locator.kind === 'inline') {
    const { frameLocators, locator } = separateFrameLocators(data.locator);
    if (frameLocators.length > 0) {
      return {
        ...node,
        data: { ...data, locator } as ActionData,
        frameLocators,
      };
    }
  }
  return node;
}

/**
 * Separate frameLocator steps from a locator chain.
 * Returns { frameLocators, locator } where frameLocators is an array of frame selector strings
 * and locator is the remaining locator ref without the frameLocator steps.
 */
function separateFrameLocators(locator: LocatorRef): { frameLocators: string[]; locator: LocatorRef } {
  if (locator.kind !== 'inline') return { frameLocators: [], locator };

  // If there's a chain, check for frameLocator steps
  if (locator.chain && locator.chain.length > 0) {
    const frameLocators: string[] = [];
    const remainingSteps: LocatorStep[] = [];

    // frameLocator steps are always leading (before the actual locator steps)
    let inFramePrefix = true;
    for (const step of locator.chain) {
      if (inFramePrefix && step.strategy === 'frameLocator') {
        frameLocators.push(step.value);
      } else {
        inFramePrefix = false;
        remainingSteps.push(step);
      }
    }

    if (frameLocators.length === 0) return { frameLocators: [], locator };

    // Rebuild the locator from remaining steps
    if (remainingSteps.length === 0) {
      // Edge case: only frameLocator steps, no actual locator
      return { frameLocators, locator };
    }

    const first = remainingSteps[0];
    if (remainingSteps.length === 1) {
      const newLocator: LocatorRef = {
        kind: 'inline',
        strategy: first.strategy,
        value: first.value,
      };
      if (first.dynamic) newLocator.dynamic = true;
      if (first.modifiers && first.modifiers.length > 0) newLocator.modifiers = first.modifiers;
      return { frameLocators, locator: newLocator };
    }

    const newLocator: LocatorRef = {
      kind: 'inline',
      strategy: first.strategy,
      value: first.value,
      chain: remainingSteps,
    };
    if (first.dynamic) newLocator.dynamic = true;
    return { frameLocators, locator: newLocator };
  }

  // Single step — check if it's a frameLocator
  if (locator.strategy === 'frameLocator') {
    return { frameLocators: [locator.value], locator };
  }

  return { frameLocators: [], locator };
}

function extractStringValue(node: Node): string {
  if (Node.isStringLiteral(node)) {
    return node.getLiteralValue();
  }
  if (Node.isTemplateExpression(node) || Node.isNoSubstitutionTemplateLiteral(node)) {
    return node.getText().replace(/^`|`$/g, '');
  }
  // Fallback: return the raw text
  return node.getText().replace(/^['"]|['"]$/g, '');
}

// ─── Storage State Matching ─────────────────────────────────────────

/**
 * Match `context.storageState({ path: '...' })` or `page.context().storageState({ path: '...' })`.
 */
function matchStorageStateSave(callExpr: CallExpression): StorageStateDataType | null {
  const callerExpr = callExpr.getExpression();
  if (!Node.isPropertyAccessExpression(callerExpr)) return null;

  const methodName = callerExpr.getName();
  if (methodName !== 'storageState') return null;

  const args = callExpr.getArguments();
  if (args.length < 1) return null;

  const optionsArg = args[0];
  if (!Node.isObjectLiteralExpression(optionsArg)) return null;

  const pathProp = optionsArg.getProperty('path');
  if (!pathProp || !Node.isPropertyAssignment(pathProp)) return null;

  const pathInit = pathProp.getInitializer();
  if (!pathInit || !Node.isStringLiteral(pathInit)) return null;

  const filePath = pathInit.getLiteralValue();

  // Determine context variable: page.context().storageState or context.storageState
  const caller = callerExpr.getExpression();
  let contextVariable: string | undefined;
  if (Node.isCallExpression(caller)) {
    // page.context().storageState(...)
    contextVariable = undefined;
  } else {
    const callerText = caller.getText();
    if (callerText !== 'context') {
      contextVariable = callerText;
    }
  }

  return {
    type: 'storageState',
    operation: 'save',
    filePath,
    contextVariable,
  };
}

/**
 * Match `test.use({ storageState: '...' })`.
 */
function matchTestUseStorageState(expr: Node): StorageStateDataType | null {
  if (!Node.isCallExpression(expr)) return null;
  const callExpr = expr as CallExpression;
  const callerText = callExpr.getExpression().getText();
  if (callerText !== 'test.use') return null;

  const args = callExpr.getArguments();
  if (args.length < 1) return null;

  const optionsArg = args[0];
  if (!Node.isObjectLiteralExpression(optionsArg)) return null;

  const storageProp = optionsArg.getProperty('storageState');
  if (!storageProp || !Node.isPropertyAssignment(storageProp)) return null;

  const init = storageProp.getInitializer();
  if (!init || !Node.isStringLiteral(init)) return null;

  return {
    type: 'storageState',
    operation: 'load',
    filePath: init.getLiteralValue(),
  };
}

/**
 * Match `browser.newContext({ storageState: '...' })` in a variable declaration initializer.
 */
function matchNewContextStorageState(expr: Node): StorageStateDataType | null {
  if (!Node.isCallExpression(expr)) {
    // Unwrap await
    if (Node.isAwaitExpression(expr)) {
      return matchNewContextStorageState((expr as AwaitExpression).getExpression());
    }
    return null;
  }

  const callExpr = expr as CallExpression;
  const callerExpr = callExpr.getExpression();
  if (!Node.isPropertyAccessExpression(callerExpr)) return null;

  const methodName = callerExpr.getName();
  if (methodName !== 'newContext') return null;

  const args = callExpr.getArguments();
  if (args.length < 1) return null;

  const optionsArg = args[0];
  if (!Node.isObjectLiteralExpression(optionsArg)) return null;

  const storageProp = optionsArg.getProperty('storageState');
  if (!storageProp || !Node.isPropertyAssignment(storageProp)) return null;

  const init = storageProp.getInitializer();
  if (!init || !Node.isStringLiteral(init)) return null;

  return {
    type: 'storageState',
    operation: 'load',
    filePath: init.getLiteralValue(),
  };
}

// ─── New Context Matching ────────────────────────────────────────────

/**
 * Match `browser.newContext(...)` calls (generic, not the storageState-specific one).
 * e.g., `const context1 = await browser.newContext()`
 *        `const ctx = await browser.newContext({ storageState: 'auth.json' })`
 */
function matchNewContext(expr: Node, varName: string): NewContextDataType | null {
  // Unwrap await
  if (Node.isAwaitExpression(expr)) {
    return matchNewContext((expr as AwaitExpression).getExpression(), varName);
  }

  if (!Node.isCallExpression(expr)) return null;

  const callExpr = expr as CallExpression;
  const callerExpr = callExpr.getExpression();
  if (!Node.isPropertyAccessExpression(callerExpr)) return null;

  const methodName = (callerExpr as PropertyAccessExpression).getName();
  if (methodName !== 'newContext') return null;

  const args = callExpr.getArguments();
  const options = args.length > 0 ? args[0].getText() : undefined;

  return {
    type: 'newContext',
    contextVariable: varName,
    ...(options ? { options } : {}),
  };
}

/**
 * Match `context.newPage()` calls that create a page from a specific context.
 * e.g., `const page1 = await context1.newPage()`
 */
function matchContextNewPage(expr: Node, varName: string): NewTabDataType | null {
  // Unwrap await
  if (Node.isAwaitExpression(expr)) {
    return matchContextNewPage((expr as AwaitExpression).getExpression(), varName);
  }

  if (!Node.isCallExpression(expr)) return null;

  const callExpr = expr as CallExpression;
  const callerExpr = callExpr.getExpression();
  if (!Node.isPropertyAccessExpression(callerExpr)) return null;

  const methodName = (callerExpr as PropertyAccessExpression).getName();
  if (methodName !== 'newPage') return null;

  const objectExpr = (callerExpr as PropertyAccessExpression).getExpression();
  const contextVar = objectExpr.getText();

  // Skip the default `context.newPage()` / `page = ...` patterns that are handled by fixtures
  // Only match when the caller is not the default fixture variables
  if (contextVar === 'browser' || contextVar === 'page') return null;

  return {
    type: 'newTab',
    pageVariable: varName,
    triggerAction: `${contextVar}.newPage()`,
    contextVariable: contextVar,
  };
}

// ─── Cookie Action Matching ──────────────────────────────────────────

/**
 * Match `context.addCookies([{ name, value, ... }])`.
 */
function matchAddCookies(callExpr: CallExpression): CookieActionDataType | null {
  const callee = callExpr.getExpression();
  if (!Node.isPropertyAccessExpression(callee)) return null;

  const methodName = (callee as PropertyAccessExpression).getName();
  if (methodName !== 'addCookies') return null;

  const objectExpr = (callee as PropertyAccessExpression).getExpression();
  const contextVar = objectExpr.getText();

  const args = callExpr.getArguments();
  if (args.length < 1) return null;

  const arrayArg = args[0];
  const cookies: CookieObjectType[] = [];

  if (Node.isArrayLiteralExpression(arrayArg)) {
    for (const element of arrayArg.getElements()) {
      if (Node.isObjectLiteralExpression(element)) {
        const cookie = extractCookieObject(element);
        cookies.push(cookie);
      }
    }
  }

  return {
    type: 'cookieAction',
    operation: 'add',
    cookies: cookies.length > 0 ? cookies : undefined,
    ...(contextVar !== 'context' ? { contextVariable: contextVar } : {}),
  };
}

/**
 * Extract a cookie object from an ObjectLiteralExpression.
 */
function extractCookieObject(obj: Node): CookieObjectType {
  const cookie: CookieObjectType = { name: '', value: '' };

  if (!Node.isObjectLiteralExpression(obj)) return cookie;

  for (const prop of obj.getProperties()) {
    if (!Node.isPropertyAssignment(prop)) continue;
    const key = prop.getName();
    const init = prop.getInitializer();
    if (!init) continue;

    switch (key) {
      case 'name':
        cookie.name = extractStringValue(init);
        break;
      case 'value':
        cookie.value = extractStringValue(init);
        break;
      case 'domain':
        cookie.domain = extractStringValue(init);
        break;
      case 'path':
        cookie.path = extractStringValue(init);
        break;
      case 'url':
        cookie.url = extractStringValue(init);
        break;
      case 'expires':
        if (Node.isNumericLiteral(init)) {
          cookie.expires = init.getLiteralValue();
        } else {
          cookie.expires = Number(init.getText()) || undefined;
        }
        break;
      case 'httpOnly':
        cookie.httpOnly = init.getText() === 'true';
        break;
      case 'secure':
        cookie.secure = init.getText() === 'true';
        break;
      case 'sameSite':
        cookie.sameSite = extractStringValue(init) as 'Strict' | 'Lax' | 'None';
        break;
    }
  }

  return cookie;
}

/**
 * Match `context.cookies()` or `context.cookies(['url1', 'url2'])`.
 * Used within variable declarations: `const cookies = await context.cookies()`.
 */
function matchGetCookies(expr: Node, resultVariable?: string): CookieActionDataType | null {
  if (!Node.isCallExpression(expr)) return null;

  const callExpr = expr as CallExpression;
  const callee = callExpr.getExpression();
  if (!Node.isPropertyAccessExpression(callee)) return null;

  const methodName = (callee as PropertyAccessExpression).getName();
  if (methodName !== 'cookies') return null;

  const objectExpr = (callee as PropertyAccessExpression).getExpression();
  const contextVar = objectExpr.getText();

  // Extract optional URL filter argument
  const args = callExpr.getArguments();
  let urls: string[] | undefined;
  if (args.length >= 1) {
    if (Node.isArrayLiteralExpression(args[0])) {
      urls = [];
      for (const element of args[0].getElements()) {
        if (Node.isStringLiteral(element)) {
          urls.push(element.getLiteralValue());
        }
      }
    } else if (Node.isStringLiteral(args[0])) {
      urls = [args[0].getLiteralValue()];
    }
  }

  return {
    type: 'cookieAction',
    operation: 'get',
    ...(urls && urls.length > 0 ? { urls } : {}),
    ...(resultVariable ? { resultVariable } : {}),
    ...(contextVar !== 'context' ? { contextVariable: contextVar } : {}),
  };
}

/**
 * Match `context.clearCookies()`.
 */
function matchClearCookies(callExpr: CallExpression): CookieActionDataType | null {
  const callee = callExpr.getExpression();
  if (!Node.isPropertyAccessExpression(callee)) return null;

  const methodName = (callee as PropertyAccessExpression).getName();
  if (methodName !== 'clearCookies') return null;

  const objectExpr = (callee as PropertyAccessExpression).getExpression();
  const contextVar = objectExpr.getText();

  return {
    type: 'cookieAction',
    operation: 'clear',
    ...(contextVar !== 'context' ? { contextVariable: contextVar } : {}),
  };
}

// ─── Variable Extraction ──────────────────────────────────────────────

/** Built-in identifiers that should not be tracked as user variables */
const BUILTIN_IDENTIFIERS = new Set([
  'page', 'test', 'expect', 'request', 'context', 'browser',
  'browserName', 'route', 'dialog', 'console', 'undefined', 'null',
  'true', 'false', 'Promise', 'JSON', 'Math', 'Array', 'Object',
  'String', 'Number', 'Boolean', 'Date', 'Error', 'Map', 'Set',
  'RegExp', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
]);

/**
 * Extract declared variables from a ts-morph Statement.
 * Handles `const x = ...`, `let x = ...`, `var x = ...`, and destructuring.
 */
export function extractDeclaredVariables(stmt: Statement): DeclaredVariable[] {
  const declared: DeclaredVariable[] = [];

  if (Node.isVariableStatement(stmt)) {
    for (const decl of (stmt as VariableStatement).getDeclarations()) {
      const nameNode = decl.getNameNode();

      if (Node.isIdentifier(nameNode)) {
        const varType = decl.getType()?.getText();
        const simplifiedType = varType && !varType.includes('{') && varType.length < 60 ? varType : undefined;
        declared.push({ name: nameNode.getText(), ...(simplifiedType ? { type: simplifiedType } : {}) });
      } else if (Node.isArrayBindingPattern(nameNode)) {
        for (const element of nameNode.getElements()) {
          if (Node.isBindingElement(element)) {
            declared.push({ name: element.getName() });
          }
        }
      } else if (Node.isObjectBindingPattern(nameNode)) {
        for (const element of nameNode.getElements()) {
          if (Node.isBindingElement(element)) {
            declared.push({ name: element.getName() });
          }
        }
      }
    }
  }

  // For-of/for-in loops declare variables in their initializer
  if (Node.isForOfStatement(stmt) || Node.isForInStatement(stmt)) {
    const initializer = (stmt as ForOfStatement | ForInStatement).getInitializer();
    if (initializer && Node.isVariableDeclarationList(initializer)) {
      for (const decl of initializer.getDeclarations()) {
        const nameNode = decl.getNameNode();
        if (Node.isIdentifier(nameNode)) {
          declared.push({ name: nameNode.getText() });
        }
      }
    }
  }

  return declared;
}

/**
 * Extract variable names referenced (used) in a statement, excluding declared names
 * and built-in identifiers. Only returns names that look like user-declared variables.
 */
export function extractUsedVariables(stmt: Statement, declaredInThisNode: Set<string>): string[] {
  const used = new Set<string>();

  const identifiers = stmt.getDescendantsOfKind(SyntaxKind.Identifier);
  for (const ident of identifiers) {
    const name = ident.getText();

    // Skip built-ins and variables declared in this very node
    if (BUILTIN_IDENTIFIERS.has(name) || declaredInThisNode.has(name)) continue;

    // Skip identifiers that are property access names (e.g., `.click` in `page.click()`)
    const parent = ident.getParent();
    if (parent && Node.isPropertyAccessExpression(parent)) {
      const propAccess = parent as PropertyAccessExpression;
      if (propAccess.getNameNode() === ident) continue;
    }

    // Skip identifiers that are the name in a property assignment (e.g., `name:` in `{ name: 'x' }`)
    if (parent && Node.isPropertyAssignment(parent)) {
      if ((parent as any).getNameNode?.() === ident) continue;
    }

    // Skip import specifiers
    if (parent && (Node.isImportSpecifier(parent) || Node.isImportClause(parent))) continue;

    // Skip identifiers that are method/function names being declared
    if (parent && (Node.isMethodDeclaration(parent) || Node.isFunctionDeclaration(parent))) {
      if ((parent as any).getNameNode?.() === ident) continue;
    }

    used.add(name);
  }

  return [...used];
}

/**
 * Attach declaredVariables and usedVariables to a parsed ActionNode based on its source statement.
 */
function attachVariableInfo(node: ActionNode, stmt: Statement): void {
  const declared = extractDeclaredVariables(stmt);
  const declaredNames = new Set(declared.map(d => d.name));
  const used = extractUsedVariables(stmt, declaredNames);

  if (declared.length > 0) {
    node.declaredVariables = declared;
  }
  if (used.length > 0) {
    node.usedVariables = used;
  }
}

// ─── test.use() Fixture Override Extraction ─────────────────────────────

/**
 * Convert a ts-morph Node to a JSON-compatible value.
 * Returns the parsed value and optionally the raw source for non-literal expressions.
 */
function nodeToFixtureOverrideValue(node: Node): FixtureOverrideValue {
  if (Node.isStringLiteral(node)) {
    return { value: node.getLiteralValue() };
  }
  if (Node.isNumericLiteral(node)) {
    return { value: node.getLiteralValue() };
  }
  if (node.getKind() === SyntaxKind.TrueKeyword) {
    return { value: true };
  }
  if (node.getKind() === SyntaxKind.FalseKeyword) {
    return { value: false };
  }
  if (node.getKind() === SyntaxKind.NullKeyword) {
    return { value: null };
  }
  if (Node.isObjectLiteralExpression(node)) {
    const obj: Record<string, unknown> = {};
    for (const prop of node.getProperties()) {
      if (Node.isPropertyAssignment(prop)) {
        const key = prop.getName();
        const init = prop.getInitializer();
        if (init) {
          const childVal = nodeToFixtureOverrideValue(init);
          // If child has rawSource, it's a non-literal; store as-is in the object
          if (childVal.rawSource !== undefined) {
            obj[key] = childVal.rawSource;
          } else {
            obj[key] = childVal.value;
          }
        }
      }
    }
    return { value: obj };
  }
  if (Node.isArrayLiteralExpression(node)) {
    const arr: unknown[] = [];
    for (const elem of node.getElements()) {
      const childVal = nodeToFixtureOverrideValue(elem);
      if (childVal.rawSource !== undefined) {
        arr.push(childVal.rawSource);
      } else {
        arr.push(childVal.value);
      }
    }
    return { value: arr };
  }

  // Non-literal expression: store raw source as fallback
  return { value: node.getText(), rawSource: node.getText() };
}

/**
 * Parse all test.use() calls inside a describe block's callback body and
 * merge their configuration objects into a single Record<string, FixtureOverrideValue>.
 */
function extractFixtureOverridesFromDescribe(describeCall: CallExpression): Record<string, FixtureOverrideValue> | undefined {
  const args = describeCall.getArguments();
  const callback = args.find(a => Node.isArrowFunction(a) || Node.isFunctionExpression(a));
  if (!callback) return undefined;

  const body = Node.isArrowFunction(callback)
    ? callback.getBody()
    : (callback as any).getBody();
  if (!Node.isBlock(body)) return undefined;

  const overrides: Record<string, FixtureOverrideValue> = {};

  for (const stmt of body.getStatements()) {
    if (!Node.isExpressionStatement(stmt)) continue;
    const expr = stmt.getExpression();
    if (!Node.isCallExpression(expr)) continue;

    const callText = expr.getExpression().getText();
    if (callText !== 'test.use') continue;

    const callArgs = expr.getArguments();
    if (callArgs.length < 1) continue;

    const optionsArg = callArgs[0];
    if (!Node.isObjectLiteralExpression(optionsArg)) continue;

    for (const prop of optionsArg.getProperties()) {
      if (Node.isPropertyAssignment(prop)) {
        const key = prop.getName();
        const init = prop.getInitializer();
        if (init) {
          overrides[key] = nodeToFixtureOverrideValue(init);
        }
      }
    }
  }

  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

/**
 * Extract test.use() calls at the top level of a source file (outside any describe block).
 */
function extractTopLevelFixtureOverrides(sourceFile: SourceFile): Record<string, FixtureOverrideValue> | undefined {
  const overrides: Record<string, FixtureOverrideValue> = {};

  for (const stmt of sourceFile.getStatements()) {
    if (!Node.isExpressionStatement(stmt)) continue;
    const expr = stmt.getExpression();
    if (!Node.isCallExpression(expr)) continue;

    const callText = expr.getExpression().getText();
    if (callText !== 'test.use') continue;

    const callArgs = expr.getArguments();
    if (callArgs.length < 1) continue;

    const optionsArg = callArgs[0];
    if (!Node.isObjectLiteralExpression(optionsArg)) continue;

    for (const prop of optionsArg.getProperties()) {
      if (Node.isPropertyAssignment(prop)) {
        const key = prop.getName();
        const init = prop.getInitializer();
        if (init) {
          overrides[key] = nodeToFixtureOverrideValue(init);
        }
      }
    }
  }

  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

/**
 * Extract test.setTimeout(ms) from a describe block's callback body.
 */
function extractDescribeTimeout(describeCall: CallExpression): number | undefined {
  const args = describeCall.getArguments();
  const callback = args.find(a => Node.isArrowFunction(a) || Node.isFunctionExpression(a));
  if (!callback) return undefined;

  const body = Node.isArrowFunction(callback)
    ? callback.getBody()
    : (callback as any).getBody();
  if (!Node.isBlock(body)) return undefined;

  for (const stmt of body.getStatements()) {
    if (!Node.isExpressionStatement(stmt)) continue;
    const expr = stmt.getExpression();
    if (!Node.isCallExpression(expr)) continue;

    const callText = expr.getExpression().getText();
    if (callText === 'test.setTimeout' && expr.getArguments().length === 1) {
      const arg = expr.getArguments()[0];
      if (Node.isNumericLiteral(arg)) {
        return Number(arg.getLiteralValue());
      }
      const val = Number(arg.getText());
      if (!isNaN(val)) return val;
    }
  }
  return undefined;
}

/**
 * Extract test.setTimeout(ms) from top-level statements in a source file.
 */
function extractTopLevelTimeout(sourceFile: SourceFile): number | undefined {
  for (const stmt of sourceFile.getStatements()) {
    if (!Node.isExpressionStatement(stmt)) continue;
    const expr = stmt.getExpression();
    if (!Node.isCallExpression(expr)) continue;

    const callText = expr.getExpression().getText();
    if (callText === 'test.setTimeout' && expr.getArguments().length === 1) {
      const arg = expr.getArguments()[0];
      if (Node.isNumericLiteral(arg)) {
        return Number(arg.getLiteralValue());
      }
      const val = Number(arg.getText());
      if (!isNaN(val)) return val;
    }
  }
  return undefined;
}
