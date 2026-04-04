import type { ActionNode, DeclaredVariable } from '../model/action-node.js';

/**
 * Scope information computed for a single node in a flow.
 */
export interface NodeVariableScope {
  /** Variables that are in scope at this node (declared by any preceding node) */
  inScope: DeclaredVariable[];
  /** Variables declared by this node */
  declaredHere: DeclaredVariable[];
  /** Variables used by this node that were declared in a preceding node */
  usedFromOther: DeclaredVariable[];
  /** Variable names used by this node that are not declared anywhere in scope */
  undeclared: string[];
}

/**
 * Compute a variable scope map for an ordered list of action nodes.
 *
 * For each node, determines which variables are in scope (from preceding nodes),
 * which are declared here, which are used from other nodes, and which are undeclared.
 *
 * Group nodes (test.step) create a child scope: variables declared inside a group
 * are NOT visible outside that group.
 *
 * @param nodes - An ordered array of ActionNode (in execution order)
 * @returns A Map from node id to its NodeVariableScope
 */
export function computeVariableScope(nodes: ActionNode[]): Map<string, NodeVariableScope> {
  const result = new Map<string, NodeVariableScope>();

  // Accumulate variables in scope as we iterate in execution order
  const cumulativeScope: DeclaredVariable[] = [];

  for (const node of nodes) {
    const declaredHere = node.declaredVariables ?? [];
    const usedNames = node.usedVariables ?? [];

    // Build a lookup of what's currently in scope (before this node's declarations)
    const inScope = [...cumulativeScope];
    const inScopeNames = new Set(inScope.map(v => v.name));

    // Determine which used variables come from other nodes vs. are undeclared
    const usedFromOther: DeclaredVariable[] = [];
    const undeclared: string[] = [];

    for (const name of usedNames) {
      if (inScopeNames.has(name)) {
        const scopeVar = inScope.find(v => v.name === name);
        if (scopeVar) {
          usedFromOther.push(scopeVar);
        }
      } else {
        undeclared.push(name);
      }
    }

    result.set(node.id, {
      inScope,
      declaredHere,
      usedFromOther,
      undeclared,
    });

    // Add this node's declared variables to the cumulative scope.
    // Group children variables are scoped to the group and NOT added here.
    // The node's own declaredVariables (extracted at the statement level) are added.
    // For group nodes, variables declared by children stay inside the group.
    if (node.data.type === 'group') {
      // Compute child scope recursively for group children, but don't leak variables out
      const children = (node.data as any).children as ActionNode[] | undefined;
      if (children && children.length > 0) {
        // Compute scope for children with the current cumulative scope as base
        computeChildScope(children, [...cumulativeScope, ...declaredHere], result);
      }
    }

    // Add this node's top-level declared variables to scope for subsequent nodes
    for (const v of declaredHere) {
      cumulativeScope.push(v);
    }
  }

  return result;
}

/**
 * Recursively compute variable scope for children of a group/step node.
 * Variables declared in child nodes are scoped to the group and do NOT
 * leak into the parent scope.
 */
function computeChildScope(
  children: ActionNode[],
  parentScope: DeclaredVariable[],
  result: Map<string, NodeVariableScope>,
): void {
  const childCumulativeScope = [...parentScope];

  for (const child of children) {
    const declaredHere = child.declaredVariables ?? [];
    const usedNames = child.usedVariables ?? [];

    const inScope = [...childCumulativeScope];
    const inScopeNames = new Set(inScope.map(v => v.name));

    const usedFromOther: DeclaredVariable[] = [];
    const undeclared: string[] = [];

    for (const name of usedNames) {
      if (inScopeNames.has(name)) {
        const scopeVar = inScope.find(v => v.name === name);
        if (scopeVar) {
          usedFromOther.push(scopeVar);
        }
      } else {
        undeclared.push(name);
      }
    }

    result.set(child.id, {
      inScope,
      declaredHere,
      usedFromOther,
      undeclared,
    });

    // Recurse for nested groups
    if (child.data.type === 'group') {
      const grandchildren = (child.data as any).children as ActionNode[] | undefined;
      if (grandchildren && grandchildren.length > 0) {
        computeChildScope(grandchildren, [...childCumulativeScope, ...declaredHere], result);
      }
    }

    for (const v of declaredHere) {
      childCumulativeScope.push(v);
    }
  }
}
