import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import type { Node } from '@xyflow/react';
import type { ActionData, LocatorRef, LocatorStep, LocatorModifier } from '../api/hooks.js';

/**
 * Extract all searchable text from a node's ActionData.
 * Searches across: type label, locator strings, URL values,
 * assertion text, fill values, step names, descriptions, code, etc.
 */
export function getSearchableText(node: Node): string {
  const data = node.data as unknown as ActionData;
  const parts: string[] = [];

  // Node type
  if (node.type) parts.push(node.type);
  if (data.type) parts.push(data.type);

  // Description / step name
  if (data.description) parts.push(data.description);
  if (data.stepName) parts.push(data.stepName);

  // URL
  if (data.url) parts.push(data.url);

  // Value (fill, select)
  if (data.value) parts.push(data.value);

  // Expected (assertions)
  if (data.expected != null) parts.push(String(data.expected));

  // Code block
  if (data.code) parts.push(data.code);

  // Locator text
  if (data.locator) {
    parts.push(...extractLocatorText(data.locator));
  }

  // Network route
  if (data.urlPattern) parts.push(data.urlPattern);
  if (data.handlerAction) parts.push(data.handlerAction);

  // API request
  if (data.method) parts.push(data.method);
  if (data.resultVariable) parts.push(data.resultVariable);

  // Page object ref
  if (data.pageObjectId) parts.push(data.pageObjectId);
  if (data.args) parts.push(...data.args);

  // Loop fields
  if (data.loopKind) parts.push(data.loopKind);
  if (data.initializer) parts.push(data.initializer);
  if (data.condition) parts.push(data.condition);
  if (data.variableName) parts.push(data.variableName);
  if (data.iterable) parts.push(data.iterable);

  // Dialog
  if (data.action) parts.push(data.action);
  if (data.inputText) parts.push(data.inputText);

  // Tab / context
  if (data.pageVariable) parts.push(data.pageVariable);
  if (data.contextVariable) parts.push(data.contextVariable);

  // Storage
  if (data.operation) parts.push(data.operation);
  if (data.filePath) parts.push(data.filePath);
  if (data.key) parts.push(data.key);

  // Assertion extra fields
  if (data.attributeName) parts.push(data.attributeName);
  if (data.assertionType) parts.push(data.assertionType);
  if (data.expectedValue) parts.push(data.expectedValue);

  // Name (screenshot)
  if (data.name) parts.push(data.name);

  // Selector (file upload)
  if (data.selector) parts.push(data.selector);

  return parts.join(' ');
}

function extractLocatorText(locator: LocatorRef): string[] {
  const parts: string[] = [];
  if (locator.kind === 'pageObject') {
    if (locator.locatorName) parts.push(locator.locatorName);
    if (locator.pageObjectId) parts.push(locator.pageObjectId);
  } else {
    if (locator.strategy) parts.push(locator.strategy);
    if (locator.value) parts.push(locator.value);
    if (locator.chain) {
      for (const step of locator.chain) {
        parts.push(...extractLocatorStepText(step));
      }
    }
    if (locator.modifiers) {
      for (const mod of locator.modifiers) {
        parts.push(...extractModifierText(mod));
      }
    }
  }
  return parts;
}

function extractLocatorStepText(step: LocatorStep): string[] {
  const parts: string[] = [step.strategy, step.value];
  if (step.modifiers) {
    for (const mod of step.modifiers) {
      parts.push(...extractModifierText(mod));
    }
  }
  return parts;
}

function extractModifierText(mod: LocatorModifier): string[] {
  const parts: string[] = [mod.kind];
  if (mod.hasText) parts.push(mod.hasText);
  if (mod.index != null) parts.push(String(mod.index));
  if (mod.has) parts.push(...extractLocatorText(mod.has));
  return parts;
}

export interface UseNodeSearchResult {
  /** Current search query */
  query: string;
  /** Set the search query */
  setQuery: (q: string) => void;
  /** IDs of all matching nodes */
  matchingNodeIds: Set<string>;
  /** Total number of matches */
  matchCount: number;
  /** Index of the currently focused match (0-based) */
  currentMatchIndex: number;
  /** ID of the currently focused match node, or null */
  currentMatchNodeId: string | null;
  /** Move to the next match */
  nextMatch: () => void;
  /** Move to the previous match */
  prevMatch: () => void;
  /** Whether search is active (query is non-empty) */
  isSearching: boolean;
  /** Reset search state */
  reset: () => void;
}

export function useNodeSearch(nodes: Node[]): UseNodeSearchResult {
  const [query, setQueryRaw] = useState('');
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const setQuery = useCallback((q: string) => {
    setQueryRaw(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(q);
      setCurrentMatchIndex(0);
    }, 200);
  }, []);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const normalizedQuery = debouncedQuery.toLowerCase().trim();
  const isSearching = normalizedQuery.length > 0;

  // Build a map of nodeId -> searchable text (lowercased)
  const searchIndex = useMemo(() => {
    const map = new Map<string, string>();
    for (const node of nodes) {
      map.set(node.id, getSearchableText(node).toLowerCase());
    }
    return map;
  }, [nodes]);

  // Find matching node IDs (preserving order from nodes array)
  const matchingNodeIdsOrdered = useMemo(() => {
    if (!isSearching) return [];
    return nodes
      .filter((n) => {
        const text = searchIndex.get(n.id);
        return text != null && text.includes(normalizedQuery);
      })
      .map((n) => n.id);
  }, [nodes, searchIndex, normalizedQuery, isSearching]);

  const matchingNodeIdSet = useMemo(
    () => new Set(matchingNodeIdsOrdered),
    [matchingNodeIdsOrdered],
  );

  const matchCount = matchingNodeIdsOrdered.length;

  // Clamp currentMatchIndex
  const clampedIndex =
    matchCount === 0 ? 0 : Math.min(currentMatchIndex, matchCount - 1);

  const currentMatchNodeId =
    matchCount > 0 ? matchingNodeIdsOrdered[clampedIndex] : null;

  const nextMatch = useCallback(() => {
    setCurrentMatchIndex((prev) => {
      if (matchCount === 0) return 0;
      return (prev + 1) % matchCount;
    });
  }, [matchCount]);

  const prevMatch = useCallback(() => {
    setCurrentMatchIndex((prev) => {
      if (matchCount === 0) return 0;
      return (prev - 1 + matchCount) % matchCount;
    });
  }, [matchCount]);

  const reset = useCallback(() => {
    setQueryRaw('');
    setDebouncedQuery('');
    setCurrentMatchIndex(0);
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  return {
    query,
    setQuery,
    matchingNodeIds: matchingNodeIdSet,
    matchCount,
    currentMatchIndex: clampedIndex,
    currentMatchNodeId,
    nextMatch,
    prevMatch,
    isSearching,
    reset,
  };
}
