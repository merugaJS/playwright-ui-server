import { describe, it, expect } from 'vitest';
import { analyzeCoverage } from '../coverage-analyzer.js';
import type { TestFlow } from '../../model/test-flow.js';
import type { PageObject } from '../../model/page-object.js';
import type { ActionNode } from '../../model/action-node.js';

// ─── Helpers ──────────────────────────────────────────────────────────

function makeNode(overrides: Partial<ActionNode> & { type: ActionNode['type']; data: ActionNode['data'] }): ActionNode {
  return {
    id: `node-${Math.random().toString(36).slice(2, 8)}`,
    position: { x: 0, y: 0 },
    ...overrides,
  };
}

function makeFlow(overrides: Partial<TestFlow> & { id: string }): TestFlow {
  return {
    filePath: 'tests/example.spec.ts',
    describe: 'Example',
    tests: [],
    imports: [],
    fixtures: [],
    metadata: { contentHash: 'abc', lastParsedAt: Date.now(), parseWarnings: [] },
    ...overrides,
  };
}

function makePageObject(overrides: Partial<PageObject> & { id: string; name: string }): PageObject {
  return {
    filePath: 'pages/example.page.ts',
    locators: [],
    methods: [],
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('analyzeCoverage', () => {
  it('returns empty coverage for no page objects', () => {
    const report = analyzeCoverage([], []);
    expect(report.methods).toEqual([]);
    expect(report.locators).toEqual([]);
    expect(report.summary.totalMethods).toBe(0);
    expect(report.summary.methodCoveragePercent).toBe(100);
  });

  it('reports uncovered methods when no tests reference them', () => {
    const po = makePageObject({
      id: 'po1',
      name: 'LoginPage',
      methods: [
        { name: 'login', parameters: [], body: '' },
        { name: 'logout', parameters: [], body: '' },
      ],
    });

    const report = analyzeCoverage([], [po]);
    expect(report.methods).toHaveLength(2);
    expect(report.methods[0].usedBy).toEqual([]);
    expect(report.methods[1].usedBy).toEqual([]);
    expect(report.summary.coveredMethods).toBe(0);
    expect(report.summary.methodCoveragePercent).toBe(0);
  });

  it('detects method coverage via pageObjectRef nodes', () => {
    const po = makePageObject({
      id: 'po1',
      name: 'LoginPage',
      methods: [
        { name: 'login', parameters: [], body: '' },
        { name: 'logout', parameters: [], body: '' },
      ],
    });

    const flow = makeFlow({
      id: 'flow1',
      tests: [
        {
          id: 'test1',
          name: 'should login',
          nodes: [
            makeNode({
              type: 'pageObjectRef',
              data: { type: 'pageObjectRef', pageObjectId: 'po1', method: 'login', args: [] },
            }),
          ],
          edges: [],
        },
      ],
    });

    const report = analyzeCoverage([flow], [po]);
    expect(report.methods[0].methodName).toBe('login');
    expect(report.methods[0].usedBy).toEqual(['flow1']);
    expect(report.methods[1].methodName).toBe('logout');
    expect(report.methods[1].usedBy).toEqual([]);
    expect(report.summary.coveredMethods).toBe(1);
    expect(report.summary.methodCoveragePercent).toBe(50);
  });

  it('detects locator coverage via pageObject locator refs', () => {
    const po = makePageObject({
      id: 'po1',
      name: 'LoginPage',
      locators: [
        { name: 'usernameInput', strategy: 'getByLabel', value: 'Username' },
        { name: 'passwordInput', strategy: 'getByLabel', value: 'Password' },
      ],
    });

    const flow = makeFlow({
      id: 'flow1',
      tests: [
        {
          id: 'test1',
          name: 'should fill username',
          nodes: [
            makeNode({
              type: 'fill',
              data: {
                type: 'fill',
                locator: { kind: 'pageObject', pageObjectId: 'po1', locatorName: 'usernameInput' },
                value: 'admin',
              },
            }),
          ],
          edges: [],
        },
      ],
    });

    const report = analyzeCoverage([flow], [po]);
    expect(report.locators[0].locatorName).toBe('usernameInput');
    expect(report.locators[0].usedBy).toEqual(['flow1']);
    expect(report.locators[1].locatorName).toBe('passwordInput');
    expect(report.locators[1].usedBy).toEqual([]);
    expect(report.summary.coveredLocators).toBe(1);
    expect(report.summary.locatorCoveragePercent).toBe(50);
  });

  it('counts multiple flows using the same method', () => {
    const po = makePageObject({
      id: 'po1',
      name: 'LoginPage',
      methods: [{ name: 'login', parameters: [], body: '' }],
    });

    const flow1 = makeFlow({
      id: 'flow1',
      tests: [
        {
          id: 'test1',
          name: 'test A',
          nodes: [
            makeNode({
              type: 'pageObjectRef',
              data: { type: 'pageObjectRef', pageObjectId: 'po1', method: 'login', args: [] },
            }),
          ],
          edges: [],
        },
      ],
    });

    const flow2 = makeFlow({
      id: 'flow2',
      tests: [
        {
          id: 'test2',
          name: 'test B',
          nodes: [
            makeNode({
              type: 'pageObjectRef',
              data: { type: 'pageObjectRef', pageObjectId: 'po1', method: 'login', args: [] },
            }),
          ],
          edges: [],
        },
      ],
    });

    const report = analyzeCoverage([flow1, flow2], [po]);
    expect(report.methods[0].usedBy).toContain('flow1');
    expect(report.methods[0].usedBy).toContain('flow2');
    expect(report.methods[0].usedBy).toHaveLength(2);
    expect(report.summary.methodCoveragePercent).toBe(100);
  });

  it('traverses nested nodes (loop, conditional, group)', () => {
    const po = makePageObject({
      id: 'po1',
      name: 'DashboardPage',
      methods: [
        { name: 'openMenu', parameters: [], body: '' },
        { name: 'closeDialog', parameters: [], body: '' },
        { name: 'submit', parameters: [], body: '' },
      ],
    });

    const flow = makeFlow({
      id: 'flow1',
      tests: [
        {
          id: 'test1',
          name: 'nested test',
          nodes: [
            // Method ref inside a loop body
            makeNode({
              type: 'loop',
              data: {
                type: 'loop',
                loopKind: 'for',
                condition: 'i < 3',
                body: [
                  makeNode({
                    type: 'pageObjectRef',
                    data: { type: 'pageObjectRef', pageObjectId: 'po1', method: 'openMenu', args: [] },
                  }),
                ],
              },
            }),
            // Method ref inside a conditional thenChildren
            makeNode({
              type: 'conditional',
              data: {
                type: 'conditional',
                condition: 'true',
                thenChildren: [
                  makeNode({
                    type: 'pageObjectRef',
                    data: { type: 'pageObjectRef', pageObjectId: 'po1', method: 'closeDialog', args: [] },
                  }),
                ],
              },
            }),
            // Method ref inside a group
            makeNode({
              type: 'group',
              data: {
                type: 'group',
                stepName: 'Final step',
                children: [
                  makeNode({
                    type: 'pageObjectRef',
                    data: { type: 'pageObjectRef', pageObjectId: 'po1', method: 'submit', args: [] },
                  }),
                ],
              },
            }),
          ],
          edges: [],
        },
      ],
    });

    const report = analyzeCoverage([flow], [po]);
    expect(report.summary.coveredMethods).toBe(3);
    expect(report.summary.methodCoveragePercent).toBe(100);
  });

  it('picks up references in hooks (beforeEach, afterAll, etc.)', () => {
    const po = makePageObject({
      id: 'po1',
      name: 'SetupPage',
      methods: [{ name: 'setup', parameters: [], body: '' }],
    });

    const flow = makeFlow({
      id: 'flow1',
      tests: [],
      beforeEach: [
        makeNode({
          type: 'pageObjectRef',
          data: { type: 'pageObjectRef', pageObjectId: 'po1', method: 'setup', args: [] },
        }),
      ],
    });

    const report = analyzeCoverage([flow], [po]);
    expect(report.methods[0].usedBy).toEqual(['flow1']);
    expect(report.summary.coveredMethods).toBe(1);
  });

  it('picks up references inside nested describe blocks', () => {
    const po = makePageObject({
      id: 'po1',
      name: 'NavPage',
      methods: [{ name: 'goHome', parameters: [], body: '' }],
    });

    const flow = makeFlow({
      id: 'flow1',
      tests: [],
      children: [
        {
          name: 'inner describe',
          tests: [
            {
              id: 'test-inner',
              name: 'inner test',
              nodes: [
                makeNode({
                  type: 'pageObjectRef',
                  data: { type: 'pageObjectRef', pageObjectId: 'po1', method: 'goHome', args: [] },
                }),
              ],
              edges: [],
            },
          ],
        },
      ],
    });

    const report = analyzeCoverage([flow], [po]);
    expect(report.methods[0].usedBy).toEqual(['flow1']);
  });

  it('handles tryCatch children correctly', () => {
    const po = makePageObject({
      id: 'po1',
      name: 'ErrorPage',
      methods: [{ name: 'handleError', parameters: [], body: '' }],
    });

    const flow = makeFlow({
      id: 'flow1',
      tests: [
        {
          id: 'test1',
          name: 'try-catch test',
          nodes: [
            makeNode({
              type: 'tryCatch',
              data: {
                type: 'tryCatch',
                tryChildren: [],
                catchChildren: [
                  makeNode({
                    type: 'pageObjectRef',
                    data: { type: 'pageObjectRef', pageObjectId: 'po1', method: 'handleError', args: [] },
                  }),
                ],
              },
            }),
          ],
          edges: [],
        },
      ],
    });

    const report = analyzeCoverage([flow], [po]);
    expect(report.methods[0].usedBy).toEqual(['flow1']);
  });
});
