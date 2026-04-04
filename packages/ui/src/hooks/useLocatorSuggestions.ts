import { useMemo } from 'react';
import { usePageObjects, usePageObject } from '../api/hooks.js';
import type { PageObjectSummary, PageObject } from '../api/hooks.js';
import { useQueries } from '@tanstack/react-query';

export interface LocatorSuggestion {
  /** Locator name as defined in the page object class */
  name: string;
  /** The selector expression, e.g. getByRole('button') */
  selector: string;
  /** Name of the page object class this locator belongs to */
  pageObject: string;
  /** Page object ID for reference */
  pageObjectId: string;
}

async function fetchPageObject(id: string): Promise<PageObject> {
  const res = await fetch(`/api/page-objects/${id}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

/**
 * Fetches all page objects and flattens their locators into a filterable
 * suggestions list. Supports simple case-insensitive substring matching.
 */
export function useLocatorSuggestions(query: string = '') {
  const { data: pageObjectsData, isLoading: isLoadingList } = usePageObjects();
  const summaries: PageObjectSummary[] = pageObjectsData?.files ?? [];

  // Only fetch details for page objects that have locators
  const idsWithLocators = useMemo(
    () => summaries.filter((s) => s.locatorCount > 0 && !s.parseError).map((s) => s.id),
    [summaries],
  );

  // Fetch each page object's full details in parallel
  const pageObjectQueries = useQueries({
    queries: idsWithLocators.map((id) => ({
      queryKey: ['pageObject', id] as const,
      queryFn: () => fetchPageObject(id),
      staleTime: 30_000,
    })),
  });

  const isLoading = isLoadingList || pageObjectQueries.some((q) => q.isLoading);

  // Flatten all locators into suggestions
  const allSuggestions: LocatorSuggestion[] = useMemo(() => {
    const result: LocatorSuggestion[] = [];
    for (const q of pageObjectQueries) {
      if (!q.data) continue;
      const po = q.data;
      for (const loc of po.locators) {
        result.push({
          name: loc.name,
          selector: `${loc.strategy}('${loc.value}')`,
          pageObject: po.name,
          pageObjectId: po.id,
        });
      }
    }
    return result;
  }, [pageObjectQueries]);

  // Filter by query (case-insensitive substring match)
  const suggestions: LocatorSuggestion[] = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return allSuggestions;
    return allSuggestions.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.selector.toLowerCase().includes(q) ||
        s.pageObject.toLowerCase().includes(q),
    );
  }, [allSuggestions, query]);

  return { suggestions, allSuggestions, isLoading };
}
