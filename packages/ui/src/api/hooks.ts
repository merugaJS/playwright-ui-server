import { useQuery } from '@tanstack/react-query';

// ─── Shared Types ────────────────────────────────────────────────────

export interface TestFileInfo {
  id: string;
  filePath: string;
  fileName: string;
  directory: string;
}

interface TestsResponse {
  testDir: string;
  files: TestFileInfo[];
  total: number;
}

export interface ProjectUse {
  browserName?: 'chromium' | 'firefox' | 'webkit';
  viewport?: { width: number; height: number };
  device?: string;
  baseURL?: string;
}

export interface PlaywrightProjectConfig {
  name: string;
  testDir?: string;
  use?: ProjectUse;
}

export interface PlaywrightConfigData {
  testDir: string;
  testMatch?: string | string[];
  testIgnore?: string | string[];
  baseURL?: string;
  projects?: PlaywrightProjectConfig[];
  outputDir?: string;
  timeout?: number;
  retries?: number;
  workers?: number | string;
  reporter?: string | (string | [string, Record<string, unknown>])[];
  globalSetup?: string;
  globalTeardown?: string;
}

export interface ConfigResponse {
  rootDir: string;
  configPath: string | null;
  config: PlaywrightConfigData;
}

// ─── TestFlow types (mirrors core model) ─────────────────────────────

export interface Position {
  x: number;
  y: number;
}

export interface LocatorModifier {
  kind: 'filter' | 'nth' | 'first' | 'last';
  hasText?: string;
  has?: LocatorRef;
  index?: number;
}

export interface LocatorStep {
  strategy: string;
  value: string;
  modifiers?: LocatorModifier[];
}

export interface LocatorRef {
  kind: 'inline' | 'pageObject';
  strategy?: string;
  value?: string;
  chain?: LocatorStep[];
  modifiers?: LocatorModifier[];
  pageObjectId?: string;
  locatorName?: string;
}

export interface ActionData {
  type: string;
  url?: string;
  locator?: LocatorRef;
  value?: string;
  expected?: string; // may also arrive as number from server (e.g. assertCount) — coerced to string in rendering
  exact?: boolean;
  duration?: number;
  name?: string;
  fullPage?: boolean;
  code?: string;
  description?: string;
  pageObjectId?: string;
  method?: string;
  args?: string[];
  // Loop fields
  loopKind?: 'for' | 'for...of' | 'for...in' | 'while' | 'do...while';
  initializer?: string;
  condition?: string;
  incrementer?: string;
  variableName?: string;
  iterable?: string;
  body?: ActionNode[] | string;
  // Conditional fields
  thenChildren?: ActionNode[];
  elseIfBranches?: { condition: string; children: ActionNode[] }[];
  elseChildren?: ActionNode[];
  // Network route fields
  urlPattern?: string;
  handlerAction?: 'fulfill' | 'abort' | 'continue';
  fulfillOptions?: {
    status?: number;
    headers?: Record<string, string>;
    json?: string;
    body?: string;
    contentType?: string;
  };
  abortReason?: string;
  continueOverrides?: {
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    postData?: string;
  };
  // API request fields (apiRequest type)
  headers?: Record<string, string>;
  resultVariable?: string;
  params?: Record<string, string>;
  // Assertion common fields
  negated?: boolean;
  soft?: boolean;
  isRegex?: boolean;
  attributeName?: string;
  message?: string;
  // New tab fields
  pageVariable?: string;
  triggerAction?: string;
  triggerSelector?: string;
  contextVariable?: string;
  // Dialog handler fields
  action?: string;
  inputText?: string;
  once?: boolean;
  // File upload fields
  selector?: string;
  files?: string[];
  locatorMethod?: string;
  // Storage state fields
  operation?: string;
  filePath?: string;
  // Cookie fields
  cookies?: unknown[];
  urls?: string[];
  // File download fields
  downloadVariable?: string;
  savePath?: string;
  suggestedFilename?: boolean;
  // Group / test.step fields
  stepName?: string;
  children?: ActionNode[];
  collapsed?: boolean;
  // Try/catch fields
  tryChildren?: ActionNode[];
  catchVariable?: string;
  catchChildren?: ActionNode[];
  finallyChildren?: ActionNode[];
  // Parameterized test fields
  loopPattern?: string;
  iteratorVariable?: string;
  dataSource?: string;
  dataItems?: Record<string, unknown>[];
  testNameTemplate?: string;
  testTemplate?: ActionNode[];
  // Response assertion fields
  responseVariable?: string;
  assertionType?: string;
  expectedValue?: string;
  headerName?: string;
  jsonPath?: string;
  // Browser storage fields
  storageType?: string;
  key?: string;
  // New context fields
  options?: string;
  // Frame locator fields
  frameLocators?: string[];
  // Utility call fields
  functionName?: string;
  modulePath?: string;
  awaitExpression?: boolean;
  // Iteration fields
  arrayExpression?: string;
  callbackParams?: string[];
  isAsync?: boolean;
  // Switch fields
  expression?: string;
  cases?: { value: string | null; children: ActionNode[]; fallsThrough: boolean }[];
  // Inline data fields
  dataType?: 'array-of-objects' | 'array-of-primitives' | 'object';
  values?: unknown[] | Record<string, unknown>;
  isConst?: boolean;
  // HAR route fields
  harFilePath?: string;
  mode?: string;
  notFound?: string;
}

export interface ActionNode {
  id: string;
  type: string;
  position: Position;
  data: ActionData;
  frameLocators?: string[];
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface TestCase {
  id: string;
  name: string;
  nodes: ActionNode[];
  edges: FlowEdge[];
  tags?: string[];
  timeout?: number;
}

export interface DescribeBlock {
  name: string;
  timeout?: number;
  tests: TestCase[];
  beforeAll?: ActionNode[];
  beforeEach?: ActionNode[];
  afterEach?: ActionNode[];
  afterAll?: ActionNode[];
  children?: DescribeBlock[];
}

export interface TestFlow {
  id: string;
  filePath: string;
  describe: string;
  timeout?: number;
  tests: TestCase[];
  beforeAll?: ActionNode[];
  beforeEach?: ActionNode[];
  afterEach?: ActionNode[];
  afterAll?: ActionNode[];
  children?: DescribeBlock[];
  imports: { moduleSpecifier: string; namedImports: string[] }[];
  fixtures: string[];
  externalDataSources?: { variableName: string; filePath: string; fileType: 'json' | 'csv' | 'module' }[];
  metadata: {
    contentHash: string;
    lastParsedAt: number;
    parseWarnings: string[];
  };
}

// ─── Page Object types ───────────────────────────────────────────────

export interface PageObjectLocator {
  name: string;
  strategy: string;
  value: string;
}

export interface PageObjectMethod {
  name: string;
  parameters: { name: string; type: string }[];
  body: string;
}

export interface PageObject {
  id: string;
  filePath: string;
  name: string;
  locators: PageObjectLocator[];
  methods: PageObjectMethod[];
}

export interface PageObjectSummary {
  id: string;
  filePath: string;
  fileName: string;
  directory: string;
  name: string;
  locatorCount: number;
  methodCount: number;
  parseError?: boolean;
}

interface PageObjectsResponse {
  files: PageObjectSummary[];
  total: number;
}

// ─── Fixture types ───────────────────────────────────────────────────

export interface FixtureDefinition {
  name: string;
  filePath: string;
  type: string;
  isBuiltIn: boolean;
}

interface FixturesResponse {
  builtIn: FixtureDefinition[];
  custom: FixtureDefinition[];
  fixtureFiles: string[];
  total: number;
}

// ─── Runner types ────────────────────────────────────────────────────

interface RunnerStatusResponse {
  running: boolean;
}

// ─── Fetch helper ────────────────────────────────────────────────────

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

// ─── Hooks ───────────────────────────────────────────────────────────

export function useConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: () => fetchJson<ConfigResponse>('/api/config'),
  });
}

export function useTestFiles() {
  return useQuery({
    queryKey: ['tests'],
    queryFn: () => fetchJson<TestsResponse>('/api/tests'),
  });
}

export function useTestFlow(testId: string | null) {
  return useQuery({
    queryKey: ['testFlow', testId],
    queryFn: () => fetchJson<TestFlow>(`/api/tests/${testId}`),
    enabled: !!testId,
  });
}

// ─── Page Object Hooks ──────────────────────────────────────────────

export function usePageObjects() {
  return useQuery({
    queryKey: ['pageObjects'],
    queryFn: () => fetchJson<PageObjectsResponse>('/api/page-objects'),
  });
}

export function usePageObject(pageObjectId: string | null) {
  return useQuery({
    queryKey: ['pageObject', pageObjectId],
    queryFn: () => fetchJson<PageObject>(`/api/page-objects/${pageObjectId}`),
    enabled: !!pageObjectId,
  });
}

// ─── Fixture Hooks ──────────────────────────────────────────────────

export function useFixtures() {
  return useQuery({
    queryKey: ['fixtures'],
    queryFn: () => fetchJson<FixturesResponse>('/api/fixtures'),
  });
}

// ─── Runner Hooks ───────────────────────────────────────────────────

export function useRunnerStatus() {
  return useQuery({
    queryKey: ['runnerStatus'],
    queryFn: () => fetchJson<RunnerStatusResponse>('/api/runner/status'),
    refetchInterval: 2000, // Poll while running
  });
}
