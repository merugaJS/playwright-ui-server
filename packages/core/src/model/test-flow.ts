import { z } from 'zod';
import { ActionNodeSchema, ParameterizedTestDataSchema } from './action-node.js';
import { FixtureDefinitionSchema } from './fixture.js';

export const FlowEdgeSchema = z.object({
  id: z.string(),
  source: z.string(), // ActionNode id
  target: z.string(), // ActionNode id
  label: z.string().optional(), // For conditional edges
});
export type FlowEdge = z.infer<typeof FlowEdgeSchema>;

export const ImportDeclarationSchema = z.object({
  moduleSpecifier: z.string(), // e.g., '@playwright/test'
  namedImports: z.array(z.string()), // e.g., ['test', 'expect']
  defaultImport: z.string().optional(),
  namespaceImport: z.string().optional(), // e.g., 'utils' for `import * as utils from './utils'`
  isSideEffect: z.boolean().optional(), // true for `import './setup'`
});
export type ImportDeclaration = z.infer<typeof ImportDeclarationSchema>;

export const TestAnnotationSchema = z.enum(['slow', 'fixme', 'fail', 'skip']);
export type TestAnnotation = z.infer<typeof TestAnnotationSchema>;

export const TestCaseSchema = z.object({
  id: z.string(),
  name: z.string(), // test('name', ...) label
  nodes: z.array(ActionNodeSchema),
  edges: z.array(FlowEdgeSchema),
  tags: z.array(z.string()).optional(),
  annotations: z.array(TestAnnotationSchema).optional(),
  timeout: z.number().optional(), // test.setTimeout(ms) per-test timeout
});
export type TestCase = z.infer<typeof TestCaseSchema>;

export const ParameterizedTestSchema = z.object({
  id: z.string(),
  loopPattern: z.enum(['for...of', 'forEach']),
  iteratorVariable: z.string(),
  dataSource: z.string(),
  dataItems: z.array(z.record(z.unknown())).optional(),
  testNameTemplate: z.string(),
  testNameIsExpression: z.boolean().optional(), // true if the test name is a JS expression (not a string literal)
  testBody: z.array(ActionNodeSchema),
  edges: z.array(FlowEdgeSchema),
  fixtures: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  annotations: z.array(TestAnnotationSchema).optional(),
});
export type ParameterizedTest = z.infer<typeof ParameterizedTestSchema>;

export const TestFlowMetadataSchema = z.object({
  contentHash: z.string(),
  lastParsedAt: z.number(),
  parseWarnings: z.array(z.string()),
});

export const DescribeModeSchema = z.enum(['default', 'serial', 'parallel']).default('default');
export type DescribeMode = z.infer<typeof DescribeModeSchema>;

// A single fixture override value: either a parsed JSON-compatible value or raw source text
export const FixtureOverrideValueSchema = z.object({
  value: z.unknown(),          // Parsed JSON-compatible value (string, number, boolean, object, array)
  rawSource: z.string().optional(), // Raw source text fallback for non-literal expressions
});
export type FixtureOverrideValue = z.infer<typeof FixtureOverrideValueSchema>;

// DescribeBlock represents a test.describe() block, supporting nesting
export interface DescribeBlock {
  name: string;
  mode?: DescribeMode;
  timeout?: number; // test.setTimeout(ms) at describe level
  tests: TestCase[];
  parameterizedTests?: ParameterizedTest[];
  beforeAll?: ActionNode[];
  beforeEach?: ActionNode[];
  afterEach?: ActionNode[];
  afterAll?: ActionNode[];
  children?: DescribeBlock[];
  fixtureOverrides?: Record<string, FixtureOverrideValue>;
}

// Need to use z.lazy for recursive schema
import type { ActionNode } from './action-node.js';
const DescribeBlockSchema: z.ZodType<DescribeBlock> = z.lazy(() =>
  z.object({
    name: z.string(),
    mode: DescribeModeSchema.optional(),
    timeout: z.number().optional(),
    tests: z.array(TestCaseSchema),
    parameterizedTests: z.array(ParameterizedTestSchema).optional(),
    beforeAll: z.array(ActionNodeSchema).optional(),
    beforeEach: z.array(ActionNodeSchema).optional(),
    afterEach: z.array(ActionNodeSchema).optional(),
    afterAll: z.array(ActionNodeSchema).optional(),
    children: z.array(DescribeBlockSchema).optional(),
    fixtureOverrides: z.record(FixtureOverrideValueSchema).optional(),
  })
);
export { DescribeBlockSchema };

export const ExternalDataSourceSchema = z.object({
  variableName: z.string(),
  filePath: z.string(),
  fileType: z.enum(['json', 'csv', 'module']),
});
export type ExternalDataSource = z.infer<typeof ExternalDataSourceSchema>;

export const TestFlowSchema = z.object({
  id: z.string(),
  filePath: z.string(), // Relative path from project root
  describe: z.string(), // test.describe() label
  describeMode: DescribeModeSchema.optional(), // serial | parallel | default
  timeout: z.number().optional(), // test.setTimeout(ms) at describe level
  tests: z.array(TestCaseSchema),
  parameterizedTests: z.array(ParameterizedTestSchema).optional(),
  beforeAll: z.array(ActionNodeSchema).optional(),
  beforeEach: z.array(ActionNodeSchema).optional(),
  afterEach: z.array(ActionNodeSchema).optional(),
  afterAll: z.array(ActionNodeSchema).optional(),
  children: z.array(DescribeBlockSchema).optional(), // Nested describe blocks
  imports: z.array(ImportDeclarationSchema),
  fixtures: z.array(z.string()), // Names of fixtures used
  customFixtures: z.array(FixtureDefinitionSchema).optional(), // Custom fixture definitions from test.extend
  fixtureOverrides: z.record(FixtureOverrideValueSchema).optional(), // test.use() overrides at describe level
  externalDataSources: z.array(ExternalDataSourceSchema).optional(), // External data file imports (JSON, CSV, etc.)
  metadata: TestFlowMetadataSchema,
});
export type TestFlow = z.infer<typeof TestFlowSchema>;
