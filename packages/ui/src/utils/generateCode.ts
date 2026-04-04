/**
 * Client-side test code generator.
 * Mirrors the logic in @playwright-server/core's test-generator.ts
 * but operates on the UI-side TestFlow types (from api/hooks.ts).
 * This avoids adding core as a browser dependency.
 */
import type { TestFlow, TestCase, ActionNode, ActionData, LocatorRef } from '../api/hooks.js';

export function generateTestCode(flow: TestFlow): string {
  const lines: string[] = [];

  // Imports
  for (const imp of flow.imports) {
    const parts: string[] = [];
    if ((imp as any).defaultImport) {
      parts.push((imp as any).defaultImport);
    }
    if (imp.namedImports.length > 0) {
      parts.push(`{ ${imp.namedImports.join(', ')} }`);
    }
    lines.push(`import ${parts.join(', ')} from '${imp.moduleSpecifier}';`);
  }
  if (flow.imports.length > 0) lines.push('');

  // test.describe block
  lines.push(`test.describe('${escapeString(flow.describe)}', () => {`);

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

function generateTestCase(tc: TestCase, fixtures: string[], lines: string[]): void {
  const orderedNodes = topologicalSort(tc);

  const tagPrefix = tc.tags?.includes('@skip') ? 'test.skip' :
                    tc.tags?.includes('@only') ? 'test.only' : 'test';

  lines.push(`  ${tagPrefix}('${escapeString(tc.name)}', async ({ ${fixtures.join(', ')} }) => {`);

  for (const node of orderedNodes) {
    lines.push(`    ${generateAction(node, '    ')}`);
  }

  lines.push('  });');
}

function generateAction(node: ActionNode, indent: string = ''): string {
  const d = node.data;

  switch (d.type) {
    case 'navigate':
      return `await page.goto('${escapeString(d.url ?? '')}');`;

    case 'click':
      return `await ${generateLocator(d.locator!)}.click();`;

    case 'fill':
      return `await ${generateLocator(d.locator!)}.fill('${escapeString(d.value ?? '')}');`;

    case 'hover':
      return `await ${generateLocator(d.locator!)}.hover();`;

    case 'selectOption':
      return `await ${generateLocator(d.locator!)}.selectOption('${escapeString(d.value ?? '')}');`;

    case 'assertText': {
      const matcher = d.exact ? 'toHaveText' : 'toContainText';
      return `await expect(${generateLocator(d.locator!)}).${matcher}('${escapeString(d.expected ?? '')}');`;
    }

    case 'assertVisible':
      return `await expect(${generateLocator(d.locator!)}).toBeVisible();`;

    case 'wait':
      return `await page.waitForTimeout(${d.duration ?? 1000});`;

    case 'screenshot': {
      const opts: string[] = [];
      if (d.name) opts.push(`path: '${escapeString(d.name)}'`);
      if (d.fullPage) opts.push('fullPage: true');
      return opts.length > 0
        ? `await page.screenshot({ ${opts.join(', ')} });`
        : 'await page.screenshot();';
    }

    case 'codeBlock':
      return d.code ?? '';

    case 'pageObjectRef': {
      const args = (d.args ?? []).map(a => `'${escapeString(a)}'`).join(', ');
      return `await ${d.pageObjectId}.${d.method}(${args});`;
    }

    case 'loop':
      return generateLoop(d, indent);

    case 'conditional':
      return generateConditional(d, indent);

    case 'apiRequest': {
      const method = (d.method ?? 'get').toLowerCase();
      const urlStr = `'${d.url ?? ''}'`;
      const optParts: string[] = [];
      if (d.headers && Object.keys(d.headers).length > 0) {
        const h = Object.entries(d.headers).map(([k, v]) => `'${k}': '${v}'`).join(', ');
        optParts.push(`headers: { ${h} }`);
      }
      if (typeof d.body === 'string' && d.body) {
        optParts.push(`data: ${d.body}`);
      }
      const optStr = optParts.length > 0 ? `, { ${optParts.join(', ')} }` : '';
      const call = `await request.${method}(${urlStr}${optStr})`;
      return d.resultVariable ? `const ${d.resultVariable} = ${call};` : `${call};`;
    }

    default:
      return `// Unknown action type: ${d.type}`;
  }
}

function generateLoop(d: ActionData, indent: string): string {
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
    default:
      header = 'for (;;)';
  }

  const bodyLines: string[] = [];
  bodyLines.push(`${header} {`);

  const bodyChildren = Array.isArray(d.body) ? d.body : [];
  for (const child of bodyChildren) {
    bodyLines.push(`${indent}  ${generateAction(child, indent + '  ')}`);
  }

  bodyLines.push(`${indent}}`);
  return bodyLines.join('\n');
}

function generateConditional(d: ActionData, indent: string): string {
  const bodyLines: string[] = [];

  bodyLines.push(`if (${d.condition ?? 'true'}) {`);

  const thenChildren = (d as any).thenChildren ?? [];
  for (const child of thenChildren) {
    bodyLines.push(`${indent}  ${generateAction(child, indent + '  ')}`);
  }

  const elseIfBranches = (d as any).elseIfBranches ?? [];
  for (const branch of elseIfBranches) {
    bodyLines.push(`${indent}} else if (${branch.condition}) {`);
    for (const child of branch.children) {
      bodyLines.push(`${indent}  ${generateAction(child, indent + '  ')}`);
    }
  }

  const elseChildren = (d as any).elseChildren ?? [];
  if (elseChildren.length > 0) {
    bodyLines.push(`${indent}} else {`);
    for (const child of elseChildren) {
      bodyLines.push(`${indent}  ${generateAction(child, indent + '  ')}`);
    }
  }

  bodyLines.push(`${indent}}`);
  return bodyLines.join('\n');
}

function generateLocator(locator: LocatorRef): string {
  if (locator.kind === 'pageObject') {
    return `this.${locator.locatorName}`;
  }

  const { strategy, value } = locator;
  switch (strategy) {
    case 'getByRole':
      return `page.getByRole(${value})`;
    case 'getByText':
      return `page.getByText('${escapeString(value ?? '')}')`;
    case 'getByLabel':
      return `page.getByLabel('${escapeString(value ?? '')}')`;
    case 'getByPlaceholder':
      return `page.getByPlaceholder('${escapeString(value ?? '')}')`;
    case 'getByTestId':
      return `page.getByTestId('${escapeString(value ?? '')}')`;
    case 'locator':
      return `page.locator('${escapeString(value ?? '')}')`;
    case 'css':
      return `page.locator('${escapeString(value ?? '')}')`;
    case 'xpath':
      return `page.locator('xpath=${escapeString(value ?? '')}')`;
    default:
      return `page.locator('${escapeString(value ?? '')}')`;
  }
}

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

  if (sorted.length < tc.nodes.length) {
    const sortedIds = new Set(sorted.map(n => n.id));
    for (const node of tc.nodes) {
      if (!sortedIds.has(node.id)) sorted.push(node);
    }
  }

  return sorted;
}

function escapeString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
