import { describe, it, expect } from 'vitest';
import { computeVariableScope } from '../variable-scope.js';
import type { ActionNode } from '../../model/action-node.js';

function makeNode(
  id: string,
  type: ActionNode['type'],
  data: ActionNode['data'],
  opts: { declaredVariables?: ActionNode['declaredVariables']; usedVariables?: ActionNode['usedVariables'] } = {},
): ActionNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data,
    ...opts,
  };
}

describe('computeVariableScope', () => {
  it('returns correct in-scope variables for a 5-node flow', () => {
    const nodes: ActionNode[] = [
      makeNode('n1', 'codeBlock', { type: 'codeBlock', code: 'const userId = "abc"' }, {
        declaredVariables: [{ name: 'userId', type: 'string' }],
      }),
      makeNode('n2', 'codeBlock', { type: 'codeBlock', code: 'const token = "xyz"' }, {
        declaredVariables: [{ name: 'token', type: 'string' }],
      }),
      makeNode('n3', 'navigate', { type: 'navigate', url: '/users' }, {
        usedVariables: ['userId'],
      }),
      makeNode('n4', 'codeBlock', { type: 'codeBlock', code: 'const result = fetch(token)' }, {
        declaredVariables: [{ name: 'result' }],
        usedVariables: ['token'],
      }),
      makeNode('n5', 'navigate', { type: 'navigate', url: '/done' }, {
        usedVariables: ['userId', 'result'],
      }),
    ];

    const scope = computeVariableScope(nodes);

    // n1: nothing in scope yet
    const s1 = scope.get('n1')!;
    expect(s1.inScope).toEqual([]);
    expect(s1.declaredHere).toEqual([{ name: 'userId', type: 'string' }]);

    // n2: userId is in scope
    const s2 = scope.get('n2')!;
    expect(s2.inScope.map(v => v.name)).toEqual(['userId']);

    // n3: userId and token in scope; uses userId from other
    const s3 = scope.get('n3')!;
    expect(s3.inScope.map(v => v.name)).toEqual(['userId', 'token']);
    expect(s3.usedFromOther.map(v => v.name)).toEqual(['userId']);
    expect(s3.undeclared).toEqual([]);

    // n4: userId and token in scope; uses token from other
    const s4 = scope.get('n4')!;
    expect(s4.inScope.map(v => v.name)).toEqual(['userId', 'token']);
    expect(s4.usedFromOther.map(v => v.name)).toEqual(['token']);

    // n5: userId, token, result in scope; uses userId and result from other
    const s5 = scope.get('n5')!;
    expect(s5.inScope.map(v => v.name)).toEqual(['userId', 'token', 'result']);
    expect(s5.usedFromOther.map(v => v.name)).toContain('userId');
    expect(s5.usedFromOther.map(v => v.name)).toContain('result');
  });

  it('flags variables used before declaration as undeclared', () => {
    const nodes: ActionNode[] = [
      makeNode('n1', 'navigate', { type: 'navigate', url: '/test' }, {
        usedVariables: ['futureVar'],
      }),
      makeNode('n2', 'codeBlock', { type: 'codeBlock', code: 'const futureVar = 1' }, {
        declaredVariables: [{ name: 'futureVar' }],
      }),
    ];

    const scope = computeVariableScope(nodes);

    const s1 = scope.get('n1')!;
    expect(s1.undeclared).toEqual(['futureVar']);
    expect(s1.usedFromOther).toEqual([]);
  });

  it('variables declared inside a group are not in scope outside the group', () => {
    const innerChild = makeNode('inner1', 'codeBlock', { type: 'codeBlock', code: 'const secret = 42' }, {
      declaredVariables: [{ name: 'secret' }],
    });

    const groupNode = makeNode('g1', 'group', {
      type: 'group',
      stepName: 'Setup',
      children: [innerChild],
    }, {});

    const afterGroup = makeNode('n2', 'navigate', { type: 'navigate', url: '/test' }, {
      usedVariables: ['secret'],
    });

    const nodes: ActionNode[] = [groupNode, afterGroup];
    const scope = computeVariableScope(nodes);

    // The node after the group should NOT have 'secret' in scope
    const s2 = scope.get('n2')!;
    expect(s2.inScope.map(v => v.name)).not.toContain('secret');
    expect(s2.undeclared).toContain('secret');
  });

  it('variables declared before a group are in scope inside the group', () => {
    const beforeGroup = makeNode('n1', 'codeBlock', { type: 'codeBlock', code: 'const baseUrl = "http://localhost"' }, {
      declaredVariables: [{ name: 'baseUrl', type: 'string' }],
    });

    const innerChild = makeNode('inner1', 'navigate', { type: 'navigate', url: '/test' }, {
      usedVariables: ['baseUrl'],
    });

    const groupNode = makeNode('g1', 'group', {
      type: 'group',
      stepName: 'Navigate',
      children: [innerChild],
    }, {});

    const nodes: ActionNode[] = [beforeGroup, groupNode];
    const scope = computeVariableScope(nodes);

    // Inside the group, baseUrl should be in scope
    const sInner = scope.get('inner1')!;
    expect(sInner.inScope.map(v => v.name)).toContain('baseUrl');
    expect(sInner.usedFromOther.map(v => v.name)).toContain('baseUrl');
    expect(sInner.undeclared).toEqual([]);
  });

  it('handles empty node list', () => {
    const scope = computeVariableScope([]);
    expect(scope.size).toBe(0);
  });

  it('handles nodes with no variables', () => {
    const nodes: ActionNode[] = [
      makeNode('n1', 'navigate', { type: 'navigate', url: '/' }),
      makeNode('n2', 'click', { type: 'click', locator: { kind: 'inline', strategy: 'getByRole', value: "'button'" } }),
    ];

    const scope = computeVariableScope(nodes);

    const s1 = scope.get('n1')!;
    expect(s1.inScope).toEqual([]);
    expect(s1.declaredHere).toEqual([]);
    expect(s1.usedFromOther).toEqual([]);
    expect(s1.undeclared).toEqual([]);
  });
});
