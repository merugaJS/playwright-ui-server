import type { TestFlow, TestCase, DescribeBlock, ParameterizedTest } from '../model/test-flow.js';
import type { PageObject } from '../model/page-object.js';
import type { ActionNode } from '../model/action-node.js';

// ─── Types ────────────────────────────────────────────────────────────

export interface MethodCoverage {
  methodName: string;
  pageObject: string;
  pageObjectId: string;
  usedBy: string[]; // test flow IDs
}

export interface LocatorCoverage {
  locatorName: string;
  pageObject: string;
  pageObjectId: string;
  usedBy: string[]; // test flow IDs
}

export interface CoverageReport {
  methods: MethodCoverage[];
  locators: LocatorCoverage[];
  summary: {
    totalMethods: number;
    coveredMethods: number;
    totalLocators: number;
    coveredLocators: number;
    methodCoveragePercent: number;
    locatorCoveragePercent: number;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Recursively collect all action nodes from a list, traversing container
 * nodes (loop, conditional, group, tryCatch, iteration, switch,
 * parameterizedTest).
 */
function collectAllNodes(nodes: ActionNode[]): ActionNode[] {
  const result: ActionNode[] = [];
  for (const node of nodes) {
    result.push(node);
    const d = (node.data ?? node) as any;
    if (!d || typeof d !== 'object') continue;
    // Container types with children / body arrays
    if (d.body) result.push(...collectAllNodes(d.body));
    if (d.children) result.push(...collectAllNodes(d.children));
    if (d.thenChildren) result.push(...collectAllNodes(d.thenChildren));
    if (d.elseChildren) result.push(...collectAllNodes(d.elseChildren));
    if (d.elseIfBranches) {
      for (const branch of d.elseIfBranches) {
        result.push(...collectAllNodes(branch.children));
      }
    }
    if (d.tryChildren) result.push(...collectAllNodes(d.tryChildren));
    if (d.catchChildren) result.push(...collectAllNodes(d.catchChildren));
    if (d.finallyChildren) result.push(...collectAllNodes(d.finallyChildren));
    if (d.testTemplate) result.push(...collectAllNodes(d.testTemplate));
    if (d.cases) {
      for (const c of d.cases) {
        if (c.children) result.push(...collectAllNodes(c.children));
      }
    }
  }
  return result;
}

/**
 * Collect every action node from a TestFlow, including hooks, nested
 * describes, and parameterized tests.
 */
function collectFlowNodes(flow: TestFlow): ActionNode[] {
  const all: ActionNode[] = [];

  const addTests = (tests: TestCase[]) => {
    for (const t of tests) {
      all.push(...collectAllNodes(t.nodes));
    }
  };

  const addHooks = (hooks?: ActionNode[]) => {
    if (hooks) all.push(...collectAllNodes(hooks));
  };

  const addParameterized = (pts?: ParameterizedTest[]) => {
    if (!pts) return;
    for (const pt of pts) {
      all.push(...collectAllNodes(pt.testBody));
    }
  };

  const addDescribe = (desc: DescribeBlock) => {
    addTests(desc.tests);
    addHooks(desc.beforeAll);
    addHooks(desc.beforeEach);
    addHooks(desc.afterEach);
    addHooks(desc.afterAll);
    addParameterized(desc.parameterizedTests);
    if (desc.children) {
      for (const child of desc.children) {
        addDescribe(child);
      }
    }
  };

  // Top-level
  addTests(flow.tests);
  addHooks(flow.beforeAll);
  addHooks(flow.beforeEach);
  addHooks(flow.afterEach);
  addHooks(flow.afterAll);
  addParameterized(flow.parameterizedTests);

  if (flow.children) {
    for (const child of flow.children) {
      addDescribe(child);
    }
  }

  return all;
}

// ─── Analyzer ─────────────────────────────────────────────────────────

/**
 * Analyze test coverage of page object methods and locators.
 *
 * Matching is name-based:
 * - A `pageObjectRef` action node that references a page object method
 *   counts as covering that method.
 * - A locator ref with `kind: 'pageObject'` that references a page
 *   object locator counts as covering that locator.
 */
export function analyzeCoverage(
  testFlows: TestFlow[],
  pageObjects: PageObject[],
): CoverageReport {
  // Build maps: pageObjectId -> { methods used, locators used } per flow
  const methodUsage = new Map<string, Set<string>>(); // "poId::method" -> flowIds
  const locatorUsage = new Map<string, Set<string>>(); // "poId::locator" -> flowIds

  for (const flow of testFlows) {
    const nodes = collectFlowNodes(flow);

    for (const node of nodes) {
      // Check pageObjectRef actions
      if (node.type === 'pageObjectRef') {
        const d = node.data as { type: 'pageObjectRef'; pageObjectId: string; method: string; args: string[] };
        const key = `${d.pageObjectId}::${d.method}`;
        if (!methodUsage.has(key)) methodUsage.set(key, new Set());
        methodUsage.get(key)!.add(flow.id);
      }

      // Check locator refs in action data
      checkLocatorRefs(node.data, flow.id, locatorUsage);
    }
  }

  // Build coverage arrays
  const methods: MethodCoverage[] = [];
  const locators: LocatorCoverage[] = [];

  for (const po of pageObjects) {
    for (const method of po.methods) {
      const key = `${po.id}::${method.name}`;
      const usedBy = methodUsage.has(key) ? Array.from(methodUsage.get(key)!) : [];
      methods.push({
        methodName: method.name,
        pageObject: po.name,
        pageObjectId: po.id,
        usedBy,
      });
    }

    for (const loc of po.locators) {
      const key = `${po.id}::${loc.name}`;
      const usedBy = locatorUsage.has(key) ? Array.from(locatorUsage.get(key)!) : [];
      locators.push({
        locatorName: loc.name,
        pageObject: po.name,
        pageObjectId: po.id,
        usedBy,
      });
    }
  }

  const coveredMethods = methods.filter((m) => m.usedBy.length > 0).length;
  const coveredLocators = locators.filter((l) => l.usedBy.length > 0).length;

  return {
    methods,
    locators,
    summary: {
      totalMethods: methods.length,
      coveredMethods,
      totalLocators: locators.length,
      coveredLocators,
      methodCoveragePercent: methods.length > 0 ? Math.round((coveredMethods / methods.length) * 100) : 100,
      locatorCoveragePercent: locators.length > 0 ? Math.round((coveredLocators / locators.length) * 100) : 100,
    },
  };
}

/**
 * Recursively inspect action data for locator refs with kind 'pageObject'.
 */
function checkLocatorRefs(
  data: unknown,
  flowId: string,
  locatorUsage: Map<string, Set<string>>,
): void {
  if (data === null || data === undefined || typeof data !== 'object') return;

  if (Array.isArray(data)) {
    for (const item of data) {
      checkLocatorRefs(item, flowId, locatorUsage);
    }
    return;
  }

  const obj = data as Record<string, unknown>;

  // Check if this is a pageObject locator reference
  if (obj.kind === 'pageObject' && typeof obj.pageObjectId === 'string' && typeof obj.locatorName === 'string') {
    const key = `${obj.pageObjectId}::${obj.locatorName}`;
    if (!locatorUsage.has(key)) locatorUsage.set(key, new Set());
    locatorUsage.get(key)!.add(flowId);
  }

  // Recurse into object values
  for (const value of Object.values(obj)) {
    if (typeof value === 'object' && value !== null) {
      checkLocatorRefs(value, flowId, locatorUsage);
    }
  }
}
