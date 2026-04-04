import type { TestFlow, TestCase, ImportDeclaration, DescribeBlock, ParameterizedTest, FixtureOverrideValue } from '../model/test-flow.js';
import type { ActionNode, ActionData, LocatorRef, LocatorStep, LocatorModifier, LoopDataType, ConditionalDataType, TryCatchDataType, NetworkRouteDataType, FileUploadDataType, NewTabDataType, DialogHandlerDataType, StorageStateDataType, CookieActionDataType, FileDownloadDataType, GroupDataType, ParameterizedTestDataType, ResponseAssertionDataType, BrowserStorageDataType, NewContextDataType, UtilityCallDataType, IterationDataType, SwitchDataType, InlineDataDataType, HarRouteData } from '../model/action-node.js';
import { resolveFlowImports } from '../analysis/import-resolver.js';
import type { SymbolRegistry } from '../analysis/import-resolver.js';

/**
 * Options for generating a test file with auto-import management.
 */
export interface GenerateOptions {
  /** Symbol registry for resolving page object and utility imports */
  registry?: SymbolRegistry[];
  /** Manually added imports that should always be preserved */
  manualImports?: ImportDeclaration[];
  /** When true, automatically compute and merge imports based on action usage */
  autoImports?: boolean;
}

/**
 * Generate a complete .spec.ts file from a TestFlow model.
 * When options.autoImports is true, imports are automatically computed
 * based on actions used in the flow and merged with existing/manual imports.
 */
export function generateTestFile(flow: TestFlow, options?: GenerateOptions): string {
  const lines: string[] = [];

  // Determine imports: auto-computed or from the flow directly
  let imports: ImportDeclaration[];
  if (options?.autoImports) {
    imports = resolveFlowImports(
      flow,
      options.registry ?? [],
      options.manualImports ?? [],
    );
  } else {
    imports = flow.imports;
  }

  // Imports
  for (const imp of imports) {
    lines.push(generateImport(imp));
  }
  if (imports.length > 0) lines.push('');

  // test.describe block
  const describeCall = describeCallString(flow.describeMode);
  lines.push(`${describeCall}('${escapeString(flow.describe)}', () => {`);

  // test.use() fixture overrides (emitted first inside describe)
  if (flow.fixtureOverrides && Object.keys(flow.fixtureOverrides).length > 0) {
    lines.push(`  test.use(${generateFixtureOverridesObject(flow.fixtureOverrides, '  ')});`);
    lines.push('');
  }

  // test.setTimeout() at describe level
  if (flow.timeout !== undefined) {
    lines.push(`  test.setTimeout(${flow.timeout});`);
    lines.push('');
  }

  // beforeAll
  if (flow.beforeAll && flow.beforeAll.length > 0) {
    lines.push(`  test.beforeAll(async () => {`);
    for (const node of flow.beforeAll) {
      lines.push(`    ${generateAction(node, '    ')}`);
    }
    lines.push('  });');
    lines.push('');
  }

  // beforeEach
  if (flow.beforeEach && flow.beforeEach.length > 0) {
    lines.push(`  test.beforeEach(async ({ ${flow.fixtures.join(', ')} }) => {`);
    for (const node of flow.beforeEach) {
      lines.push(`    ${generateAction(node, '    ')}`);
    }
    lines.push('  });');
    lines.push('');
  }

  // Test cases
  for (let i = 0; i < flow.tests.length; i++) {
    const tc = flow.tests[i];
    generateTestCase(tc, flow.fixtures, lines);
    if (i < flow.tests.length - 1) lines.push('');
  }

  // Parameterized tests
  if (flow.parameterizedTests && flow.parameterizedTests.length > 0) {
    for (const pt of flow.parameterizedTests) {
      if (flow.tests.length > 0) lines.push('');
      generateParameterizedTest(pt, flow.fixtures, lines, '  ');
    }
  }

  // Nested describe blocks
  if (flow.children && flow.children.length > 0) {
    for (const child of flow.children) {
      lines.push('');
      generateDescribeBlock(child, flow.fixtures, lines, '  ');
    }
  }

  // afterEach
  if (flow.afterEach && flow.afterEach.length > 0) {
    lines.push('');
    lines.push(`  test.afterEach(async ({ ${flow.fixtures.join(', ')} }) => {`);
    for (const node of flow.afterEach) {
      lines.push(`    ${generateAction(node, '    ')}`);
    }
    lines.push('  });');
  }

  // afterAll
  if (flow.afterAll && flow.afterAll.length > 0) {
    lines.push('');
    lines.push(`  test.afterAll(async () => {`);
    for (const node of flow.afterAll) {
      lines.push(`    ${generateAction(node, '    ')}`);
    }
    lines.push('  });');
  }

  lines.push('});');
  lines.push('');

  return lines.join('\n');
}

function generateImport(imp: ImportDeclaration): string {
  // Side-effect import: import './setup';
  if (imp.isSideEffect) {
    return `import '${imp.moduleSpecifier}';`;
  }

  // Namespace import: import * as utils from './utils';
  if (imp.namespaceImport) {
    return `import * as ${imp.namespaceImport} from '${imp.moduleSpecifier}';`;
  }

  const parts: string[] = [];
  if (imp.defaultImport) {
    parts.push(imp.defaultImport);
  }
  if (imp.namedImports.length > 0) {
    parts.push(`{ ${imp.namedImports.join(', ')} }`);
  }
  return `import ${parts.join(', ')} from '${imp.moduleSpecifier}';`;
}

function describeCallString(mode?: string): string {
  if (mode === 'serial') return 'test.describe.serial';
  if (mode === 'parallel') return 'test.describe.parallel';
  return 'test.describe';
}

function generateDescribeBlock(block: DescribeBlock, fixtures: string[], lines: string[], baseIndent: string): void {
  const call = describeCallString(block.mode);
  lines.push(`${baseIndent}${call}('${escapeString(block.name)}', () => {`);
  const indent = baseIndent + '  ';
  const bodyIndent = indent + '  ';

  // test.use() fixture overrides (emitted first inside describe)
  if (block.fixtureOverrides && Object.keys(block.fixtureOverrides).length > 0) {
    lines.push(`${indent}test.use(${generateFixtureOverridesObject(block.fixtureOverrides, indent)});`);
    lines.push('');
  }

  // test.setTimeout() at describe level
  if (block.timeout !== undefined) {
    lines.push(`${indent}test.setTimeout(${block.timeout});`);
    lines.push('');
  }

  // beforeAll
  if (block.beforeAll && block.beforeAll.length > 0) {
    lines.push(`${indent}test.beforeAll(async () => {`);
    for (const node of block.beforeAll) {
      lines.push(`${bodyIndent}${generateAction(node, bodyIndent)}`);
    }
    lines.push(`${indent}});`);
    lines.push('');
  }

  // beforeEach
  if (block.beforeEach && block.beforeEach.length > 0) {
    lines.push(`${indent}test.beforeEach(async ({ ${fixtures.join(', ')} }) => {`);
    for (const node of block.beforeEach) {
      lines.push(`${bodyIndent}${generateAction(node, bodyIndent)}`);
    }
    lines.push(`${indent}});`);
    lines.push('');
  }

  // Tests
  for (let i = 0; i < block.tests.length; i++) {
    const tc = block.tests[i];
    const orderedNodes = topologicalSort(tc);

    const tagPrefix = tc.tags?.includes('@skip') ? 'test.skip' :
                      tc.tags?.includes('@only') ? 'test.only' : 'test';
    const namePart = `'${escapeString(tc.name)}'`;
    const callbackPart = `async ({ ${fixtures.join(', ')} }) => {`;
    const customTags = tc.tags?.filter(t => t !== '@skip' && t !== '@only') ?? [];

    if (customTags.length > 0) {
      const tagArray = customTags.map(t => `'${escapeString(t)}'`).join(', ');
      lines.push(`${indent}${tagPrefix}(${namePart}, { tag: [${tagArray}] }, ${callbackPart}`);
    } else {
      lines.push(`${indent}${tagPrefix}(${namePart}, ${callbackPart}`);
    }

    // Emit annotations as first statements in the test body
    if (tc.annotations && tc.annotations.length > 0) {
      for (const annotation of tc.annotations) {
        lines.push(`${bodyIndent}test.${annotation}();`);
      }
    }

    // Emit test.setTimeout() if set
    if (tc.timeout !== undefined) {
      lines.push(`${bodyIndent}test.setTimeout(${tc.timeout});`);
    }

    for (const node of orderedNodes) {
      lines.push(`${bodyIndent}${generateAction(node, bodyIndent)}`);
    }
    lines.push(`${indent}});`);
    if (i < block.tests.length - 1) lines.push('');
  }

  // Parameterized tests
  if (block.parameterizedTests && block.parameterizedTests.length > 0) {
    for (const pt of block.parameterizedTests) {
      if (block.tests.length > 0) lines.push('');
      generateParameterizedTest(pt, fixtures, lines, indent);
    }
  }

  // Nested describes
  if (block.children && block.children.length > 0) {
    for (const child of block.children) {
      lines.push('');
      generateDescribeBlock(child, fixtures, lines, indent);
    }
  }

  // afterEach
  if (block.afterEach && block.afterEach.length > 0) {
    lines.push('');
    lines.push(`${indent}test.afterEach(async ({ ${fixtures.join(', ')} }) => {`);
    for (const node of block.afterEach) {
      lines.push(`${bodyIndent}${generateAction(node, bodyIndent)}`);
    }
    lines.push(`${indent}});`);
  }

  // afterAll
  if (block.afterAll && block.afterAll.length > 0) {
    lines.push('');
    lines.push(`${indent}test.afterAll(async () => {`);
    for (const node of block.afterAll) {
      lines.push(`${bodyIndent}${generateAction(node, bodyIndent)}`);
    }
    lines.push(`${indent}});`);
  }

  lines.push(`${baseIndent}});`);
}

function generateTestCase(tc: TestCase, fixtures: string[], lines: string[]): void {
  // Sort nodes by edges (topological order) to produce correct statement order
  const orderedNodes = topologicalSort(tc);

  const tagPrefix = tc.tags?.includes('@skip') ? 'test.skip' :
                    tc.tags?.includes('@only') ? 'test.only' : 'test';

  // Build the test() call arguments: name, optional options object, callback
  const namePart = `'${escapeString(tc.name)}'`;
  const callbackPart = `async ({ ${fixtures.join(', ')} }) => {`;

  // Filter tags to get only custom tags (exclude @skip and @only which are handled by tagPrefix)
  const customTags = tc.tags?.filter(t => t !== '@skip' && t !== '@only') ?? [];

  if (customTags.length > 0) {
    const tagArray = customTags.map(t => `'${escapeString(t)}'`).join(', ');
    lines.push(`  ${tagPrefix}(${namePart}, { tag: [${tagArray}] }, ${callbackPart}`);
  } else {
    lines.push(`  ${tagPrefix}(${namePart}, ${callbackPart}`);
  }

  // Emit annotations as first statements in the test body
  if (tc.annotations && tc.annotations.length > 0) {
    for (const annotation of tc.annotations) {
      lines.push(`    test.${annotation}();`);
    }
  }

  // Emit test.setTimeout() if set
  if (tc.timeout !== undefined) {
    lines.push(`    test.setTimeout(${tc.timeout});`);
  }

  for (const node of orderedNodes) {
    lines.push(`    ${generateAction(node, '    ')}`);
  }

  lines.push('  });');
}

function generateParameterizedTest(pt: ParameterizedTest, fixtures: string[], lines: string[], baseIndent: string): void {
  const bodyIndent = baseIndent + '  ';
  const testBodyIndent = bodyIndent + '  ';
  const fixtureList = pt.fixtures && pt.fixtures.length > 0 ? pt.fixtures : fixtures;

  // Determine the test name argument - preserve template literals and expressions
  const nameArg = pt.testNameTemplate;
  let namePart: string;
  if (pt.testNameIsExpression) {
    // Expression or template literal — emit as-is (no quotes)
    namePart = nameArg;
  } else {
    namePart = `'${escapeString(nameArg)}'`;
  }

  if (pt.loopPattern === 'for...of') {
    lines.push(`${baseIndent}for (const ${pt.iteratorVariable} of ${pt.dataSource}) {`);
    lines.push(`${bodyIndent}test(${namePart}, async ({ ${fixtureList.join(', ')} }) => {`);

    for (const node of pt.testBody) {
      lines.push(`${testBodyIndent}${generateAction(node, testBodyIndent)}`);
    }

    lines.push(`${bodyIndent}});`);
    lines.push(`${baseIndent}}`);
  } else {
    // forEach pattern
    lines.push(`${baseIndent}${pt.dataSource}.forEach(${pt.iteratorVariable} => {`);
    lines.push(`${bodyIndent}test(${namePart}, async ({ ${fixtureList.join(', ')} }) => {`);

    for (const node of pt.testBody) {
      lines.push(`${testBodyIndent}${generateAction(node, testBodyIndent)}`);
    }

    lines.push(`${bodyIndent}});`);
    lines.push(`${baseIndent}});`);
  }
}

function generateAction(node: ActionNode, indent: string = ''): string {
  const d = node.data;
  const fl = node.frameLocators;

  switch (d.type) {
    case 'navigate':
      return `await page.goto('${escapeString(d.url)}');`;

    case 'click':
      return `await ${generateLocator(d.locator, fl)}.click();`;

    case 'fill':
      return `await ${generateLocator(d.locator, fl)}.fill('${escapeString(d.value)}');`;

    case 'hover':
      return `await ${generateLocator(d.locator, fl)}.hover();`;

    case 'selectOption':
      return `await ${generateLocator(d.locator, fl)}.selectOption('${escapeString(d.value)}');`;

    case 'assertText': {
      const matcher = d.exact ? 'toHaveText' : 'toContainText';
      const notPrefix = d.negated ? 'not.' : '';
      const expectFn = d.soft ? 'expect.soft' : 'expect';
      const msgArg = d.message ? `, '${escapeString(d.message)}'` : '';
      return `await ${expectFn}(${generateLocator(d.locator, fl)}${msgArg}).${notPrefix}${matcher}('${escapeString(d.expected)}');`;
    }

    case 'assertVisible': {
      const notPrefix = d.negated ? 'not.' : '';
      const expectFn = d.soft ? 'expect.soft' : 'expect';
      const msgArg = d.message ? `, '${escapeString(d.message)}'` : '';
      return `await ${expectFn}(${generateLocator(d.locator, fl)}${msgArg}).${notPrefix}toBeVisible();`;
    }

    case 'assertCount': {
      const notPrefix = d.negated ? 'not.' : '';
      const expectFn = d.soft ? 'expect.soft' : 'expect';
      const msgArg = d.message ? `, '${escapeString(d.message)}'` : '';
      return `await ${expectFn}(${generateLocator(d.locator, fl)}${msgArg}).${notPrefix}toHaveCount(${d.expected});`;
    }

    case 'assertURL': {
      const notPrefix = d.negated ? 'not.' : '';
      const expectFn = d.soft ? 'expect.soft' : 'expect';
      const urlArg = d.isRegex ? d.expected : `'${escapeString(d.expected)}'`;
      const msgArg = d.message ? `, '${escapeString(d.message)}'` : '';
      return `await ${expectFn}(page${msgArg}).${notPrefix}toHaveURL(${urlArg});`;
    }

    case 'assertTitle': {
      const notPrefix = d.negated ? 'not.' : '';
      const expectFn = d.soft ? 'expect.soft' : 'expect';
      const titleArg = d.isRegex ? d.expected : `'${escapeString(d.expected)}'`;
      const msgArg = d.message ? `, '${escapeString(d.message)}'` : '';
      return `await ${expectFn}(page${msgArg}).${notPrefix}toHaveTitle(${titleArg});`;
    }

    case 'assertScreenshot': {
      const notPrefix = d.negated ? 'not.' : '';
      const expectFn = d.soft ? 'expect.soft' : 'expect';
      const msgArg = d.message ? `, '${escapeString(d.message)}'` : '';
      const args: string[] = [];
      if (d.name) args.push(`'${escapeString(d.name)}'`);
      const opts: string[] = [];
      if (d.fullPage) opts.push('fullPage: true');
      if (opts.length > 0) args.push(`{ ${opts.join(', ')} }`);
      const argsStr = args.length > 0 ? args.join(', ') : '';
      return `await ${expectFn}(page${msgArg}).${notPrefix}toHaveScreenshot(${argsStr});`;
    }

    case 'assertAttribute': {
      const notPrefix = d.negated ? 'not.' : '';
      const expectFn = d.soft ? 'expect.soft' : 'expect';
      const msgArg = d.message ? `, '${escapeString(d.message)}'` : '';
      return `await ${expectFn}(${generateLocator(d.locator, fl)}${msgArg}).${notPrefix}toHaveAttribute('${escapeString(d.attributeName)}', '${escapeString(d.expected)}');`;
    }

    case 'assertValue': {
      const notPrefix = d.negated ? 'not.' : '';
      const expectFn = d.soft ? 'expect.soft' : 'expect';
      const msgArg = d.message ? `, '${escapeString(d.message)}'` : '';
      return `await ${expectFn}(${generateLocator(d.locator, fl)}${msgArg}).${notPrefix}toHaveValue('${escapeString(d.expected)}');`;
    }

    case 'assertClass': {
      const notPrefix = d.negated ? 'not.' : '';
      const expectFn = d.soft ? 'expect.soft' : 'expect';
      const msgArg = d.message ? `, '${escapeString(d.message)}'` : '';
      return `await ${expectFn}(${generateLocator(d.locator, fl)}${msgArg}).${notPrefix}toHaveClass('${escapeString(d.expected)}');`;
    }

    case 'assertEnabled': {
      const notPrefix = d.negated ? 'not.' : '';
      const expectFn = d.soft ? 'expect.soft' : 'expect';
      const msgArg = d.message ? `, '${escapeString(d.message)}'` : '';
      return `await ${expectFn}(${generateLocator(d.locator, fl)}${msgArg}).${notPrefix}toBeEnabled();`;
    }

    case 'assertDisabled': {
      const notPrefix = d.negated ? 'not.' : '';
      const expectFn = d.soft ? 'expect.soft' : 'expect';
      const msgArg = d.message ? `, '${escapeString(d.message)}'` : '';
      return `await ${expectFn}(${generateLocator(d.locator, fl)}${msgArg}).${notPrefix}toBeDisabled();`;
    }

    case 'assertChecked': {
      const notPrefix = d.negated ? 'not.' : '';
      const expectFn = d.soft ? 'expect.soft' : 'expect';
      const msgArg = d.message ? `, '${escapeString(d.message)}'` : '';
      return `await ${expectFn}(${generateLocator(d.locator, fl)}${msgArg}).${notPrefix}toBeChecked();`;
    }

    case 'assertHidden': {
      const notPrefix = d.negated ? 'not.' : '';
      const expectFn = d.soft ? 'expect.soft' : 'expect';
      const msgArg = d.message ? `, '${escapeString(d.message)}'` : '';
      return `await ${expectFn}(${generateLocator(d.locator, fl)}${msgArg}).${notPrefix}toBeHidden();`;
    }

    case 'wait':
      return `await page.waitForTimeout(${d.duration});`;

    case 'screenshot': {
      const opts: string[] = [];
      if (d.name) opts.push(`path: '${escapeString(d.name)}'`);
      if (d.fullPage) opts.push('fullPage: true');
      return opts.length > 0
        ? `await page.screenshot({ ${opts.join(', ')} });`
        : 'await page.screenshot();';
    }

    case 'codeBlock':
      return d.code;

    case 'pageObjectRef': {
      const args = d.args.map(a => `'${escapeString(a)}'`).join(', ');
      return `await ${d.pageObjectId}.${d.method}(${args});`;
    }

    case 'loop':
      return generateLoop(d as LoopDataType, indent);

    case 'conditional':
      return generateConditional(d as ConditionalDataType, indent);

    case 'networkRoute':
      return generateNetworkRoute(d as NetworkRouteDataType, indent);

    case 'apiRequest':
      return generateApiRequest(d as Extract<ActionData, { type: 'apiRequest' }>);

    case 'fileUpload':
      return generateFileUpload(d as FileUploadDataType);

    case 'newTab':
      return generateNewTab(d as NewTabDataType);

    case 'fileDownload':
      return generateFileDownload(d as FileDownloadDataType);

    case 'dialogHandler':
      return generateDialogHandler(d as DialogHandlerDataType);

    case 'storageState':
      return generateStorageState(d as StorageStateDataType);

    case 'cookieAction':
      return generateCookieAction(d as CookieActionDataType);

    case 'group':
      return generateGroup(d as GroupDataType, indent);

    case 'tryCatch':
      return generateTryCatch(d as TryCatchDataType, indent);

    case 'parameterizedTest':
      return `// parameterizedTest action (should be rendered via generateParameterizedTest)`;

    case 'responseAssertion':
      return generateResponseAssertion(d as ResponseAssertionDataType);

    case 'browserStorage':
      return generateBrowserStorage(d as BrowserStorageDataType);

    case 'newContext':
      return generateNewContext(d as NewContextDataType);

    case 'utilityCall':
      return generateUtilityCall(d as UtilityCallDataType);

    case 'iteration':
      return generateIteration(d as IterationDataType, indent);

    case 'switch':
      return generateSwitch(d as SwitchDataType, indent);

    case 'inlineData':
      return generateInlineData(d as InlineDataDataType);

    case 'harRoute':
      return generateHarRoute(d as HarRouteData);

    default:
      return `// Unknown action type: ${(d as ActionData).type}`;
  }
}

function generateIteration(d: IterationDataType, indent: string): string {
  const asyncPrefix = d.isAsync ? 'async ' : '';
  const params = d.callbackParams.join(', ');
  const lines: string[] = [];

  const callOpen = `${d.arrayExpression}.${d.method}(${asyncPrefix}(${params}) => {`;
  if (d.resultVariable) {
    lines.push(`const ${d.resultVariable} = ${callOpen}`);
  } else {
    lines.push(callOpen);
  }

  for (const child of d.children) {
    lines.push(`${indent}  ${generateAction(child, indent + '  ')}`);
  }

  lines.push(`${indent}});`);
  return lines.join('\n');
}

function generateLoop(d: LoopDataType, indent: string): string {
  // Handle do...while separately due to its unique structure
  if (d.loopKind === 'do...while') {
    const lines: string[] = [];
    lines.push('do {');

    for (const child of d.body) {
      lines.push(`${indent}  ${generateAction(child, indent + '  ')}`);
    }

    lines.push(`${indent}} while (${d.condition ?? 'true'});`);
    return lines.join('\n');
  }

  let header: string;

  switch (d.loopKind) {
    case 'for':
      header = `for (${d.initializer ?? ''}; ${d.condition ?? ''}; ${d.incrementer ?? ''})`;
      break;
    case 'for...of':
      header = `for (const ${d.variableName ?? '_'} of ${d.iterable ?? '[]'})`;
      break;
    case 'for...in':
      header = `for (const ${d.variableName ?? '_'} in ${d.iterable ?? '{}'})`;
      break;
    case 'while':
      header = `while (${d.condition ?? 'true'})`;
      break;
  }

  const lines: string[] = [];
  lines.push(`${header} {`);

  for (const child of d.body) {
    lines.push(`${indent}  ${generateAction(child, indent + '  ')}`);
  }

  lines.push(`${indent}}`);
  return lines.join('\n');
}

function generateConditional(d: ConditionalDataType, indent: string): string {
  const lines: string[] = [];

  // if (condition) {
  lines.push(`if (${d.condition}) {`);
  for (const child of d.thenChildren) {
    lines.push(`${indent}  ${generateAction(child, indent + '  ')}`);
  }

  // else if branches
  if (d.elseIfBranches) {
    for (const branch of d.elseIfBranches) {
      lines.push(`${indent}} else if (${branch.condition}) {`);
      for (const child of branch.children) {
        lines.push(`${indent}  ${generateAction(child, indent + '  ')}`);
      }
    }
  }

  // else block
  if (d.elseChildren && d.elseChildren.length > 0) {
    lines.push(`${indent}} else {`);
    for (const child of d.elseChildren) {
      lines.push(`${indent}  ${generateAction(child, indent + '  ')}`);
    }
  }

  lines.push(`${indent}}`);
  return lines.join('\n');
}

function generateNetworkRoute(d: NetworkRouteDataType, indent: string): string {
  // Determine if pattern is a regex literal (starts with /)
  const isRegex = d.urlPattern.startsWith('/') && d.urlPattern.lastIndexOf('/') > 0;
  const patternStr = isRegex ? d.urlPattern : `'${escapeString(d.urlPattern)}'`;

  let handlerBody: string;

  switch (d.handlerAction) {
    case 'fulfill': {
      const opts: string[] = [];
      if (d.fulfillOptions) {
        if (d.fulfillOptions.status !== undefined) {
          opts.push(`status: ${d.fulfillOptions.status}`);
        }
        if (d.fulfillOptions.contentType) {
          opts.push(`contentType: '${escapeString(d.fulfillOptions.contentType)}'`);
        }
        if (d.fulfillOptions.headers && Object.keys(d.fulfillOptions.headers).length > 0) {
          const headerEntries = Object.entries(d.fulfillOptions.headers)
            .map(([k, v]) => `'${escapeString(k)}': '${escapeString(v)}'`)
            .join(', ');
          opts.push(`headers: { ${headerEntries} }`);
        }
        if (d.fulfillOptions.json) {
          opts.push(`json: ${d.fulfillOptions.json}`);
        }
        if (d.fulfillOptions.body) {
          opts.push(`body: '${escapeString(d.fulfillOptions.body)}'`);
        }
      }
      handlerBody = opts.length > 0
        ? `route.fulfill({ ${opts.join(', ')} })`
        : 'route.fulfill()';
      break;
    }
    case 'abort': {
      handlerBody = d.abortReason
        ? `route.abort('${escapeString(d.abortReason)}')`
        : 'route.abort()';
      break;
    }
    case 'continue': {
      const opts: string[] = [];
      if (d.continueOverrides) {
        if (d.continueOverrides.url) {
          opts.push(`url: '${escapeString(d.continueOverrides.url)}'`);
        }
        if (d.continueOverrides.method) {
          opts.push(`method: '${escapeString(d.continueOverrides.method)}'`);
        }
        if (d.continueOverrides.headers && Object.keys(d.continueOverrides.headers).length > 0) {
          const headerEntries = Object.entries(d.continueOverrides.headers)
            .map(([k, v]) => `'${escapeString(k)}': '${escapeString(v)}'`)
            .join(', ');
          opts.push(`headers: { ${headerEntries} }`);
        }
        if (d.continueOverrides.postData) {
          opts.push(`postData: '${escapeString(d.continueOverrides.postData)}'`);
        }
      }
      handlerBody = opts.length > 0
        ? `route.continue({ ${opts.join(', ')} })`
        : 'route.continue()';
      break;
    }
  }

  return `await page.route(${patternStr}, async route => {\n${indent}  await ${handlerBody};\n${indent}});`;
}

function generateModifier(mod: LocatorModifier): string {
  switch (mod.kind) {
    case 'filter': {
      const opts: string[] = [];
      if (mod.hasText !== undefined) opts.push(`hasText: '${escapeString(mod.hasText)}'`);
      if (mod.has) opts.push(`has: ${generateLocator(mod.has)}`);
      return `.filter({ ${opts.join(', ')} })`;
    }
    case 'nth':
      return `.nth(${mod.index})`;
    case 'first':
      return '.first()';
    case 'last':
      return '.last()';
  }
}

function generateLocatorStep(step: LocatorStep, isFirst: boolean): string {
  const prefix = isFirst ? 'page.' : '.';
  let base: string;

  // Dynamic locators: emit the value as-is (no quoting)
  if (step.dynamic) {
    const methodName = step.strategy === 'css' || step.strategy === 'xpath'
      ? 'locator' : step.strategy;
    base = `${prefix}${methodName}(${step.value})`;
  } else {
    switch (step.strategy) {
      case 'getByRole':
        base = `${prefix}getByRole(${step.value})`;
        break;
      case 'getByText':
        base = `${prefix}getByText('${escapeString(step.value)}')`;
        break;
      case 'getByLabel':
        base = `${prefix}getByLabel('${escapeString(step.value)}')`;
        break;
      case 'getByPlaceholder':
        base = `${prefix}getByPlaceholder('${escapeString(step.value)}')`;
        break;
      case 'getByTestId':
        base = `${prefix}getByTestId('${escapeString(step.value)}')`;
        break;
      case 'getByAltText':
        base = `${prefix}getByAltText('${escapeString(step.value)}')`;
        break;
      case 'getByTitle':
        base = `${prefix}getByTitle('${escapeString(step.value)}')`;
        break;
      case 'locator':
        base = `${prefix}locator('${escapeString(step.value)}')`;
        break;
      case 'frameLocator':
        base = `${prefix}frameLocator('${escapeString(step.value)}')`;
        break;
      case 'css':
        base = `${prefix}locator('${escapeString(step.value)}')`;
        break;
      case 'xpath':
        base = `${prefix}locator('xpath=${escapeString(step.value)}')`;
        break;
      default:
        base = `${prefix}locator('${escapeString(step.value)}')`;
    }
  }

  // Append modifiers
  if (step.modifiers) {
    for (const mod of step.modifiers) {
      base += generateModifier(mod);
    }
  }
  return base;
}

function generateLocator(locator: LocatorRef, frameLocators?: string[]): string {
  if (locator.kind === 'pageObject') {
    return `this.${locator.locatorName}`;
  }

  // Build frame locator prefix if present
  let framePrefix = '';
  if (frameLocators && frameLocators.length > 0) {
    framePrefix = 'page' + frameLocators.map(f => `.frameLocator('${escapeString(f)}')`).join('');
  }

  // If chain is present with multiple steps, generate the full chain
  if (locator.chain && locator.chain.length > 0) {
    if (framePrefix) {
      // First step uses '.' prefix (chaining from frameLocator), not 'page.'
      return framePrefix + locator.chain
        .map((step) => generateLocatorStep(step, false))
        .join('');
    }
    return locator.chain
      .map((step, i) => generateLocatorStep(step, i === 0))
      .join('');
  }

  // Single-step locator (backward compat: no chain field)
  if (framePrefix) {
    return framePrefix + generateLocatorStep({ strategy: locator.strategy, value: locator.value, dynamic: locator.dynamic, modifiers: locator.modifiers }, false);
  }
  let result = generateLocatorStep({ strategy: locator.strategy, value: locator.value, dynamic: locator.dynamic, modifiers: locator.modifiers }, true);
  return result;
}

/**
 * Topologically sort nodes based on edges.
 * Falls back to original array order if edges form no valid DAG.
 */
function topologicalSort(tc: TestCase): ActionNode[] {
  if (tc.edges.length === 0) return tc.nodes;

  const nodeMap = new Map(tc.nodes.map(n => [n.id, n]));
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const node of tc.nodes) {
    inDegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }

  for (const edge of tc.edges) {
    adjacency.get(edge.source)?.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const sorted: ActionNode[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = nodeMap.get(id);
    if (node) sorted.push(node);

    for (const target of adjacency.get(id) ?? []) {
      const newDeg = (inDegree.get(target) ?? 1) - 1;
      inDegree.set(target, newDeg);
      if (newDeg === 0) queue.push(target);
    }
  }

  // If some nodes weren't reached (cycle or disconnected), append them
  if (sorted.length < tc.nodes.length) {
    const sortedIds = new Set(sorted.map(n => n.id));
    for (const node of tc.nodes) {
      if (!sortedIds.has(node.id)) sorted.push(node);
    }
  }

  return sorted;
}

function generateApiRequest(d: Extract<ActionData, { type: 'apiRequest' }>): string {
  const method = d.method.toLowerCase();
  const urlStr = `'${escapeString(d.url)}'`;

  // Build options object if there are headers, body, or params
  const optionsParts: string[] = [];

  if (d.headers && Object.keys(d.headers).length > 0) {
    const headerEntries = Object.entries(d.headers)
      .map(([k, v]) => `'${escapeString(k)}': '${escapeString(v)}'`)
      .join(', ');
    optionsParts.push(`headers: { ${headerEntries} }`);
  }

  if (d.body) {
    optionsParts.push(`data: ${d.body}`);
  }

  if (d.params && Object.keys(d.params).length > 0) {
    const paramEntries = Object.entries(d.params)
      .map(([k, v]) => `'${escapeString(k)}': '${escapeString(v)}'`)
      .join(', ');
    optionsParts.push(`params: { ${paramEntries} }`);
  }

  const optionsStr = optionsParts.length > 0
    ? `, { ${optionsParts.join(', ')} }`
    : '';

  const callStr = `await request.${method}(${urlStr}${optionsStr})`;

  if (d.resultVariable) {
    return `const ${d.resultVariable} = ${callStr};`;
  }

  return `${callStr};`;
}

function generateFileUpload(d: FileUploadDataType): string {
  const selectorStr = `'${escapeString(d.selector)}'`;

  // Determine file argument format
  let filesArg: string;
  if (d.files.length === 0) {
    filesArg = '[]';
  } else if (d.files.length === 1) {
    filesArg = `'${escapeString(d.files[0])}'`;
  } else {
    const items = d.files.map(f => `'${escapeString(f)}'`).join(', ');
    filesArg = `[${items}]`;
  }

  // If locatorMethod is set, use locator-based form
  if (d.locatorMethod) {
    const locatorCall = d.locatorMethod === 'locator'
      ? `page.locator(${selectorStr})`
      : `page.${d.locatorMethod}(${selectorStr})`;
    return `await ${locatorCall}.setInputFiles(${filesArg});`;
  }

  // Default: page.setInputFiles(selector, files)
  return `await page.setInputFiles(${selectorStr}, ${filesArg});`;
}

function generateNewContext(d: NewContextDataType): string {
  const opts = d.options ? d.options : '';
  return `const ${d.contextVariable} = await browser.newContext(${opts});`;
}

function generateNewTab(d: NewTabDataType): string {
  const ctx = d.contextVariable ?? 'context';
  // If triggerAction starts with the waitForEvent call (popup pattern), emit the simpler form
  if (d.triggerAction.includes('waitForEvent(\'popup\')') || d.triggerAction.includes('waitForEvent("popup")')) {
    return `const ${d.pageVariable} = await ${d.triggerAction};`;
  }
  // If triggerAction is a context.newPage() call, emit simple form
  if (d.triggerAction.endsWith('.newPage()')) {
    return `const ${d.pageVariable} = await ${d.triggerAction};`;
  }
  // Emit the Promise.all destructuring pattern
  return `const [${d.pageVariable}] = await Promise.all([\n  ${ctx}.waitForEvent('page'),\n  ${d.triggerAction}\n]);`;
}

function generateFileDownload(d: FileDownloadDataType): string {
  const lines: string[] = [];

  // If triggerAction is just waitForEvent('download') (sequential pattern), emit the simpler form
  if (d.triggerAction.includes("waitForEvent('download')") || d.triggerAction.includes('waitForEvent("download")')) {
    lines.push(`const ${d.downloadVariable} = await ${d.triggerAction};`);
  } else {
    // Emit the Promise.all destructuring pattern
    lines.push(`const [${d.downloadVariable}] = await Promise.all([`);
    lines.push(`  page.waitForEvent('download'),`);
    lines.push(`  ${d.triggerAction}`);
    lines.push(`]);`);
  }

  // Emit saveAs if present
  if (d.savePath !== undefined) {
    if (d.suggestedFilename) {
      lines.push(`await ${d.downloadVariable}.saveAs(${d.savePath});`);
    } else {
      lines.push(`await ${d.downloadVariable}.saveAs('${escapeString(d.savePath)}');`);
    }
  }

  return lines.join('\n');
}

function generateDialogHandler(d: DialogHandlerDataType): string {
  const method = d.once ? 'once' : 'on';
  let callbackBody: string;
  if (d.action === 'accept') {
    callbackBody = d.inputText !== undefined
      ? `dialog.accept('${escapeString(d.inputText)}')`
      : 'dialog.accept()';
  } else {
    callbackBody = 'dialog.dismiss()';
  }
  return `page.${method}('dialog', dialog => ${callbackBody});`;
}

function generateStorageState(d: StorageStateDataType): string {
  if (d.operation === 'save') {
    const caller = d.contextVariable ?? 'context';
    return `await ${caller}.storageState({ path: '${escapeString(d.filePath)}' });`;
  }
  // load via test.use
  return `test.use({ storageState: '${escapeString(d.filePath)}' });`;
}

function generateCookieAction(d: CookieActionDataType): string {
  const ctx = d.contextVariable ?? 'context';

  switch (d.operation) {
    case 'add': {
      if (!d.cookies || d.cookies.length === 0) {
        return `await ${ctx}.addCookies([]);`;
      }
      const cookieStrs = d.cookies.map(c => {
        const parts: string[] = [];
        parts.push(`name: '${escapeString(c.name)}'`);
        parts.push(`value: '${escapeString(c.value)}'`);
        if (c.domain !== undefined) parts.push(`domain: '${escapeString(c.domain)}'`);
        if (c.path !== undefined) parts.push(`path: '${escapeString(c.path)}'`);
        if (c.url !== undefined) parts.push(`url: '${escapeString(c.url)}'`);
        if (c.expires !== undefined) parts.push(`expires: ${c.expires}`);
        if (c.httpOnly !== undefined) parts.push(`httpOnly: ${c.httpOnly}`);
        if (c.secure !== undefined) parts.push(`secure: ${c.secure}`);
        if (c.sameSite !== undefined) parts.push(`sameSite: '${c.sameSite}'`);
        return `{ ${parts.join(', ')} }`;
      });
      return `await ${ctx}.addCookies([${cookieStrs.join(', ')}]);`;
    }
    case 'get': {
      const urlArg = d.urls && d.urls.length > 0
        ? `[${d.urls.map(u => `'${escapeString(u)}'`).join(', ')}]`
        : '';
      const callStr = `await ${ctx}.cookies(${urlArg})`;
      if (d.resultVariable) {
        return `const ${d.resultVariable} = ${callStr};`;
      }
      return `${callStr};`;
    }
    case 'clear':
      return `await ${ctx}.clearCookies();`;
  }
}

function generateGroup(d: GroupDataType, indent: string): string {
  const lines: string[] = [];
  lines.push(`await test.step('${escapeString(d.stepName)}', async () => {`);
  for (const child of d.children) {
    lines.push(`${indent}  ${generateAction(child, `${indent}  `)}`);
  }
  lines.push(`${indent}});`);
  return lines.join('\n');
}

function generateTryCatch(d: TryCatchDataType, indent: string): string {
  const lines: string[] = [];

  // try block
  lines.push('try {');
  for (const child of d.tryChildren) {
    lines.push(`${indent}  ${generateAction(child, indent + '  ')}`);
  }

  // catch block
  if (d.catchChildren && d.catchChildren.length > 0) {
    const catchHeader = d.catchVariable ? `catch (${d.catchVariable})` : 'catch';
    lines.push(`${indent}} ${catchHeader} {`);
    for (const child of d.catchChildren) {
      lines.push(`${indent}  ${generateAction(child, indent + '  ')}`);
    }
  }

  // finally block
  if (d.finallyChildren && d.finallyChildren.length > 0) {
    lines.push(`${indent}} finally {`);
    for (const child of d.finallyChildren) {
      lines.push(`${indent}  ${generateAction(child, indent + '  ')}`);
    }
  }

  lines.push(`${indent}}`);
  return lines.join('\n');
}

function generateSwitch(d: SwitchDataType, indent: string): string {
  const lines: string[] = [];
  lines.push(`switch (${d.expression}) {`);

  for (const c of d.cases) {
    if (c.value === null) {
      lines.push(`${indent}  default:`);
    } else {
      lines.push(`${indent}  case ${c.value}:`);
    }

    for (const child of c.children) {
      lines.push(`${indent}    ${generateAction(child, indent + '    ')}`);
    }

    if (!c.fallsThrough) {
      lines.push(`${indent}    break;`);
    }
  }

  lines.push(`${indent}}`);
  return lines.join('\n');
}

function generateResponseAssertion(d: ResponseAssertionDataType): string {
  const notPrefix = d.negated ? 'not.' : '';

  switch (d.assertionType) {
    case 'toBeOK':
      return `expect(${d.responseVariable}).${notPrefix}toBeOK();`;

    case 'statusCode':
      return `expect(${d.responseVariable}.status()).${notPrefix}toBe(${d.expectedValue});`;

    case 'headerValue': {
      const headerName = d.headerName ?? '';
      return `expect(${d.responseVariable}.headers()['${escapeString(headerName)}']).${notPrefix}toContain('${escapeString(d.expectedValue ?? '')}');`;
    }

    case 'jsonBody':
      return `expect(await ${d.responseVariable}.json()).${notPrefix}toEqual(${d.expectedValue});`;

    case 'text':
      return `expect(await ${d.responseVariable}.text()).${notPrefix}toBe('${escapeString(d.expectedValue ?? '')}');`;

    default:
      return `// Unknown response assertion type: ${d.assertionType}`;
  }
}

function generateBrowserStorage(d: BrowserStorageDataType): string {
  const storage = d.storageType;
  let call: string;
  switch (d.operation) {
    case 'setItem':
      call = `${storage}.setItem('${escapeString(d.key ?? '')}', '${escapeString(d.value ?? '')}')`;
      break;
    case 'getItem':
      call = `${storage}.getItem('${escapeString(d.key ?? '')}')`;
      break;
    case 'removeItem':
      call = `${storage}.removeItem('${escapeString(d.key ?? '')}')`;
      break;
    case 'clear':
      call = `${storage}.clear()`;
      break;
  }
  const prefix = d.resultVariable ? `const ${d.resultVariable} = ` : '';
  return `${prefix}await page.evaluate(() => ${call});`;
}

function generateUtilityCall(d: UtilityCallDataType): string {
  const args = d.arguments.map(a => a.value).join(', ');
  const call = `${d.functionName}(${args})`;
  const awaitPrefix = d.awaitExpression ? 'await ' : '';
  if (d.returnVariable) {
    return `const ${d.returnVariable} = ${awaitPrefix}${call};`;
  }
  return `${awaitPrefix}${call};`;
}

function generateInlineData(d: InlineDataDataType): string {
  // Prefer raw source code if available
  if (d.code) {
    return d.code;
  }
  // Fall back to generating from structured data
  const keyword = d.isConst ? 'const' : 'let';
  const formatted = JSON.stringify(d.values, null, 2);
  return `${keyword} ${d.variableName} = ${formatted};`;
}

function generateHarRoute(d: HarRouteData): string {
  const options: string[] = [];
  if (d.mode === 'record') options.push('update: true');
  if (d.url) options.push(`url: '${escapeString(d.url)}'`);
  if (d.notFound) options.push(`notFound: '${d.notFound}'`);

  if (options.length > 0) {
    return `await page.routeFromHAR('${escapeString(d.harFilePath)}', { ${options.join(', ')} });`;
  }
  return `await page.routeFromHAR('${escapeString(d.harFilePath)}');`;
}

function escapeString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function generateFixtureOverridesObject(overrides: Record<string, FixtureOverrideValue>, _indent: string): string {
  const entries: string[] = [];
  for (const [key, override] of Object.entries(overrides)) {
    if (override.rawSource !== undefined) {
      entries.push(`${key}: ${override.rawSource}`);
    } else {
      entries.push(`${key}: ${valueToLiteral(override.value)}`);
    }
  }
  return `{ ${entries.join(', ')} }`;
}

function valueToLiteral(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return `'${escapeString(value)}'`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    const items = value.map(v => valueToLiteral(v));
    return `[${items.join(', ')}]`;
  }
  if (typeof value === 'object') {
    const objEntries = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${valueToLiteral(v)}`);
    return `{ ${objEntries.join(', ')} }`;
  }
  return String(value);
}
