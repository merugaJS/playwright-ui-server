import { useQuery } from '@tanstack/react-query';

// ─── Types ────────────────────────────────────────────────────────────

export interface MethodCoverage {
  methodName: string;
  pageObject: string;
  pageObjectId: string;
  usedBy: string[];
}

export interface LocatorCoverage {
  locatorName: string;
  pageObject: string;
  pageObjectId: string;
  usedBy: string[];
}

export interface CoverageSummary {
  totalMethods: number;
  coveredMethods: number;
  totalLocators: number;
  coveredLocators: number;
  methodCoveragePercent: number;
  locatorCoveragePercent: number;
}

export interface CoverageReport {
  methods: MethodCoverage[];
  locators: LocatorCoverage[];
  summary: CoverageSummary;
}

// ─── Hook ─────────────────────────────────────────────────────────────

async function fetchCoverage(): Promise<CoverageReport> {
  const res = await fetch('/api/coverage');
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

/**
 * Fetch page-object coverage data (methods and locators used across tests).
 */
export function useCoverage() {
  return useQuery({
    queryKey: ['coverage'],
    queryFn: fetchCoverage,
  });
}
