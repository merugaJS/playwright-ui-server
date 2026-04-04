import { z } from 'zod';

// Locator strategies matching Playwright's API
export const LocatorStrategySchema = z.enum([
  'getByRole',
  'getByText',
  'getByLabel',
  'getByPlaceholder',
  'getByTestId',
  'getByAltText',
  'getByTitle',
  'locator',
  'frameLocator',
  'css',
  'xpath',
]);
export type LocatorStrategy = z.infer<typeof LocatorStrategySchema>;

// Locator modifier types (filter, nth, first, last)
// Forward-declared to allow recursive reference from LocatorRef -> LocatorModifier -> LocatorRef
export interface LocatorModifier {
  kind: 'filter' | 'nth' | 'first' | 'last';
  hasText?: string;
  has?: LocatorRef;
  index?: number;
}

// A single locator step (strategy + value pair), with optional modifiers
export const LocatorStepSchema = z.object({
  strategy: LocatorStrategySchema,
  value: z.string(),
  dynamic: z.boolean().optional(),
  modifiers: z.lazy((): z.ZodType<LocatorModifier[]> => z.array(LocatorModifierSchema)).optional(),
});
export type LocatorStep = z.infer<typeof LocatorStepSchema>;

// A locator can be inline or reference a page object's locator
// Inline locators support chaining via the optional `chain` array.
// When `chain` is present (length >= 2), it represents a chained locator
// like `page.locator('.parent').locator('.child')`.
// The top-level `strategy` and `value` always hold the first step for backward compat.
// Modifiers (filter, nth, first, last) can be attached to the top-level locator
// or to individual steps in a chain.
export const LocatorRefSchema: z.ZodType<LocatorRef> = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('inline'),
    strategy: LocatorStrategySchema,
    value: z.string(),
    dynamic: z.boolean().optional(),
    chain: z.array(LocatorStepSchema).optional(),
    modifiers: z.lazy((): z.ZodType<LocatorModifier[]> => z.array(LocatorModifierSchema)).optional(),
  }),
  z.object({
    kind: z.literal('pageObject'),
    pageObjectId: z.string(),
    locatorName: z.string(),
  }),
]);

// Explicit LocatorRef type (declared above LocatorModifier for forward reference)
export type LocatorRef =
  | {
      kind: 'inline';
      strategy: z.infer<typeof LocatorStrategySchema>;
      value: string;
      dynamic?: boolean;
      chain?: LocatorStep[];
      modifiers?: LocatorModifier[];
    }
  | {
      kind: 'pageObject';
      pageObjectId: string;
      locatorName: string;
    };

// Schema for locator modifiers (.filter, .nth, .first, .last)
export const LocatorModifierSchema: z.ZodType<LocatorModifier> = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('filter'),
    hasText: z.string().optional(),
    has: z.lazy((): z.ZodType<LocatorRef> => LocatorRefSchema).optional(),
  }),
  z.object({ kind: z.literal('nth'), index: z.number() }),
  z.object({ kind: z.literal('first') }),
  z.object({ kind: z.literal('last') }),
]);

// Action types supported in the visual editor
export const ActionTypeSchema = z.enum([
  'navigate',
  'click',
  'fill',
  'hover',
  'selectOption',
  'assertText',
  'assertVisible',
  'assertCount',
  'assertURL',
  'assertTitle',
  'assertScreenshot',
  'assertAttribute',
  'assertValue',
  'assertClass',
  'assertEnabled',
  'assertDisabled',
  'assertChecked',
  'assertHidden',
  'wait',
  'screenshot',
  'codeBlock',
  'pageObjectRef',
  'loop',
  'conditional',
  'networkRoute',
  'apiRequest',
  'newTab',
  'dialogHandler',
  'fileUpload',
  'storageState',
  'cookieAction',
  'fileDownload',
  'group',
  'tryCatch',
  'parameterizedTest',
  'responseAssertion',
  'browserStorage',
  'newContext',
  'utilityCall',
  'iteration',
  'switch',
  'harRoute',
  'inlineData',
]);
export type ActionType = z.infer<typeof ActionTypeSchema>;

// Type-specific data for each action
export const NavigateDataSchema = z.object({
  type: z.literal('navigate'),
  url: z.string(),
});

export const ClickDataSchema = z.object({
  type: z.literal('click'),
  locator: LocatorRefSchema,
});

export const FillDataSchema = z.object({
  type: z.literal('fill'),
  locator: LocatorRefSchema,
  value: z.string(),
});

export const HoverDataSchema = z.object({
  type: z.literal('hover'),
  locator: LocatorRefSchema,
});

export const SelectOptionDataSchema = z.object({
  type: z.literal('selectOption'),
  locator: LocatorRefSchema,
  value: z.string(),
});

export const AssertTextDataSchema = z.object({
  type: z.literal('assertText'),
  locator: LocatorRefSchema,
  expected: z.string(),
  exact: z.boolean().optional(),
  negated: z.boolean().optional(),
  soft: z.boolean().optional(),
  message: z.string().optional(),
});

export const AssertVisibleDataSchema = z.object({
  type: z.literal('assertVisible'),
  locator: LocatorRefSchema,
  negated: z.boolean().optional(),
  soft: z.boolean().optional(),
  message: z.string().optional(),
});

export const AssertCountDataSchema = z.object({
  type: z.literal('assertCount'),
  locator: LocatorRefSchema,
  expected: z.number(),
  negated: z.boolean().optional(),
  soft: z.boolean().optional(),
  message: z.string().optional(),
});

export const AssertURLDataSchema = z.object({
  type: z.literal('assertURL'),
  expected: z.string(),
  isRegex: z.boolean().optional(),
  negated: z.boolean().optional(),
  soft: z.boolean().optional(),
  message: z.string().optional(),
});

export const AssertTitleDataSchema = z.object({
  type: z.literal('assertTitle'),
  expected: z.string(),
  isRegex: z.boolean().optional(),
  negated: z.boolean().optional(),
  soft: z.boolean().optional(),
  message: z.string().optional(),
});

export const AssertScreenshotDataSchema = z.object({
  type: z.literal('assertScreenshot'),
  name: z.string().optional(),
  fullPage: z.boolean().optional(),
  negated: z.boolean().optional(),
  soft: z.boolean().optional(),
  message: z.string().optional(),
});

export const AssertAttributeDataSchema = z.object({
  type: z.literal('assertAttribute'),
  locator: LocatorRefSchema,
  attributeName: z.string(),
  expected: z.string(),
  negated: z.boolean().optional(),
  soft: z.boolean().optional(),
  message: z.string().optional(),
});

export const AssertValueDataSchema = z.object({
  type: z.literal('assertValue'),
  locator: LocatorRefSchema,
  expected: z.string(),
  negated: z.boolean().optional(),
  soft: z.boolean().optional(),
  message: z.string().optional(),
});

export const AssertClassDataSchema = z.object({
  type: z.literal('assertClass'),
  locator: LocatorRefSchema,
  expected: z.string(),
  negated: z.boolean().optional(),
  soft: z.boolean().optional(),
  message: z.string().optional(),
});

export const AssertEnabledDataSchema = z.object({
  type: z.literal('assertEnabled'),
  locator: LocatorRefSchema,
  negated: z.boolean().optional(),
  soft: z.boolean().optional(),
  message: z.string().optional(),
});

export const AssertDisabledDataSchema = z.object({
  type: z.literal('assertDisabled'),
  locator: LocatorRefSchema,
  negated: z.boolean().optional(),
  soft: z.boolean().optional(),
  message: z.string().optional(),
});

export const AssertCheckedDataSchema = z.object({
  type: z.literal('assertChecked'),
  locator: LocatorRefSchema,
  negated: z.boolean().optional(),
  soft: z.boolean().optional(),
  message: z.string().optional(),
});

export const AssertHiddenDataSchema = z.object({
  type: z.literal('assertHidden'),
  locator: LocatorRefSchema,
  negated: z.boolean().optional(),
  soft: z.boolean().optional(),
  message: z.string().optional(),
});

export const WaitDataSchema = z.object({
  type: z.literal('wait'),
  duration: z.number(),
});

export const ScreenshotDataSchema = z.object({
  type: z.literal('screenshot'),
  name: z.string().optional(),
  fullPage: z.boolean().optional(),
});

export const CodeBlockDataSchema = z.object({
  type: z.literal('codeBlock'),
  code: z.string(),
  description: z.string().optional(),
});

export const PageObjectRefDataSchema = z.object({
  type: z.literal('pageObjectRef'),
  pageObjectId: z.string(),
  method: z.string(),
  args: z.array(z.string()),
});

// Position on the React Flow canvas
export const PositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

// Variable declared within an action node
export const DeclaredVariableSchema = z.object({
  name: z.string(),
  type: z.string().optional(),
});
export type DeclaredVariable = z.infer<typeof DeclaredVariableSchema>;

// A single node in the visual flow (interface declared first for recursive schema)
export interface ActionNode {
  id: string;
  type: z.infer<typeof ActionTypeSchema>;
  position: { x: number; y: number };
  data: ActionData;
  declaredVariables?: DeclaredVariable[];
  usedVariables?: string[];
  /** Frame locator selectors for actions targeting elements inside iframes.
   *  Supports nested iframes: ['#outer', '#inner'] -> page.frameLocator('#outer').frameLocator('#inner') */
  frameLocators?: string[];
}

export const LoopDataSchema = z.object({
  type: z.literal('loop'),
  loopKind: z.enum(['for', 'for...of', 'for...in', 'while', 'do...while']),
  initializer: z.string().optional(),
  condition: z.string().optional(),
  incrementer: z.string().optional(),
  variableName: z.string().optional(),
  iterable: z.string().optional(),
  code: z.string().optional(),
  body: z.lazy((): z.ZodType<ActionNode[]> => z.array(ActionNodeSchema)),
});
export type LoopData = z.infer<typeof LoopDataSchema>;

export const ElseIfBranchSchema = z.object({
  condition: z.string(),
  children: z.lazy((): z.ZodType<ActionNode[]> => z.array(ActionNodeSchema)),
});

export const ConditionalDataSchema = z.object({
  type: z.literal('conditional'),
  condition: z.string(),
  thenChildren: z.lazy((): z.ZodType<ActionNode[]> => z.array(ActionNodeSchema)),
  elseIfBranches: z.array(ElseIfBranchSchema).optional(),
  elseChildren: z.lazy((): z.ZodType<ActionNode[]> => z.array(ActionNodeSchema)).optional(),
  code: z.string().optional(),
});
export type ConditionalData = z.infer<typeof ConditionalDataSchema>;

export const GroupDataSchema = z.object({
  type: z.literal('group'),
  stepName: z.string(),
  children: z.lazy((): z.ZodType<ActionNode[]> => z.array(ActionNodeSchema)),
  collapsed: z.boolean().optional(),
});
export type GroupData = z.infer<typeof GroupDataSchema>;

export const TryCatchDataSchema = z.object({
  type: z.literal('tryCatch'),
  tryChildren: z.lazy((): z.ZodType<ActionNode[]> => z.array(ActionNodeSchema)),
  catchVariable: z.string().optional(),
  catchChildren: z.lazy((): z.ZodType<ActionNode[]> => z.array(ActionNodeSchema)).optional(),
  finallyChildren: z.lazy((): z.ZodType<ActionNode[]> => z.array(ActionNodeSchema)).optional(),
  code: z.string().optional(),
});
export type TryCatchData = z.infer<typeof TryCatchDataSchema>;

export const ParameterizedTestDataSchema = z.object({
  type: z.literal('parameterizedTest'),
  loopPattern: z.enum(['for...of', 'forEach']),
  iteratorVariable: z.string(),
  dataSource: z.string(), // variable name or inline array text
  dataItems: z.array(z.record(z.unknown())).optional(), // extracted inline data items
  testNameTemplate: z.string(), // the test name expression (may include template literals)
  testTemplate: z.lazy((): z.ZodType<ActionNode[]> => z.array(ActionNodeSchema)),
  fixtures: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  annotations: z.array(z.string()).optional(),
});

export interface ParameterizedTestDataType {
  type: 'parameterizedTest';
  loopPattern: 'for...of' | 'forEach';
  iteratorVariable: string;
  dataSource: string;
  dataItems?: Record<string, unknown>[];
  testNameTemplate: string;
  testTemplate: ActionNode[];
  fixtures?: string[];
  tags?: string[];
  annotations?: string[];
}

export const FulfillOptionsSchema = z.object({
  status: z.number().optional(),
  headers: z.record(z.string()).optional(),
  json: z.string().optional(),
  body: z.string().optional(),
  contentType: z.string().optional(),
});

export const ContinueOverridesSchema = z.object({
  url: z.string().optional(),
  method: z.string().optional(),
  headers: z.record(z.string()).optional(),
  postData: z.string().optional(),
});

export const NetworkRouteDataSchema = z.object({
  type: z.literal('networkRoute'),
  urlPattern: z.string(),
  handlerAction: z.enum(['fulfill', 'abort', 'continue']),
  fulfillOptions: FulfillOptionsSchema.optional(),
  abortReason: z.string().optional(),
  continueOverrides: ContinueOverridesSchema.optional(),
});

export const ApiRequestMethodSchema = z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']);

export const ApiRequestDataSchema = z.object({
  type: z.literal('apiRequest'),
  method: ApiRequestMethodSchema,
  url: z.string(),
  headers: z.record(z.string()).optional(),
  body: z.string().optional(),
  resultVariable: z.string().optional(),
  params: z.record(z.string()).optional(),
});

export const ResponseAssertionTypeSchema = z.enum(['toBeOK', 'statusCode', 'headerValue', 'jsonBody', 'text']);

export const ResponseAssertionDataSchema = z.object({
  type: z.literal('responseAssertion'),
  responseVariable: z.string(),
  assertionType: ResponseAssertionTypeSchema,
  expectedValue: z.string().optional(),
  headerName: z.string().optional(),
  jsonPath: z.string().optional(),
  negated: z.boolean().optional(),
});

export interface ResponseAssertionDataType {
  type: 'responseAssertion';
  responseVariable: string;
  assertionType: 'toBeOK' | 'statusCode' | 'headerValue' | 'jsonBody' | 'text';
  expectedValue?: string;
  headerName?: string;
  jsonPath?: string;
  negated?: boolean;
}

export const NewTabDataSchema = z.object({
  type: z.literal('newTab'),
  pageVariable: z.string(),
  triggerAction: z.string(),
  triggerSelector: z.string().optional(),
  contextVariable: z.string().optional(),
});

export interface NewTabDataType {
  type: 'newTab';
  pageVariable: string;
  triggerAction: string;
  triggerSelector?: string;
  contextVariable?: string;
}

export const DialogHandlerDataSchema = z.object({
  type: z.literal('dialogHandler'),
  action: z.enum(['accept', 'dismiss']),
  inputText: z.string().optional(),
  once: z.boolean(),
});

export interface DialogHandlerDataType {
  type: 'dialogHandler';
  action: 'accept' | 'dismiss';
  inputText?: string;
  once: boolean;
}

export const FileUploadDataSchema = z.object({
  type: z.literal('fileUpload'),
  selector: z.string(),
  files: z.array(z.string()),
  locatorMethod: z.string().optional(),
});

export interface FileUploadDataType {
  type: 'fileUpload';
  selector: string;
  files: string[];
  locatorMethod?: string;
}

export const StorageStateDataSchema = z.object({
  type: z.literal('storageState'),
  operation: z.enum(['save', 'load']),
  filePath: z.string(),
  contextVariable: z.string().optional(),
});

export interface StorageStateDataType {
  type: 'storageState';
  operation: 'save' | 'load';
  filePath: string;
  contextVariable?: string;
}

export const CookieObjectSchema = z.object({
  name: z.string(),
  value: z.string(),
  domain: z.string().optional(),
  path: z.string().optional(),
  expires: z.number().optional(),
  httpOnly: z.boolean().optional(),
  secure: z.boolean().optional(),
  sameSite: z.enum(['Strict', 'Lax', 'None']).optional(),
  url: z.string().optional(),
});

export const CookieActionDataSchema = z.object({
  type: z.literal('cookieAction'),
  operation: z.enum(['add', 'get', 'clear']),
  cookies: z.array(CookieObjectSchema).optional(),
  urls: z.array(z.string()).optional(),
  resultVariable: z.string().optional(),
  contextVariable: z.string().optional(),
});

export interface CookieObjectType {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
  url?: string;
}

export interface CookieActionDataType {
  type: 'cookieAction';
  operation: 'add' | 'get' | 'clear';
  cookies?: CookieObjectType[];
  urls?: string[];
  resultVariable?: string;
  contextVariable?: string;
}

export const FileDownloadDataSchema = z.object({
  type: z.literal('fileDownload'),
  downloadVariable: z.string(),
  triggerAction: z.string(),
  triggerSelector: z.string().optional(),
  savePath: z.string().optional(),
  suggestedFilename: z.boolean().optional(),
});

export interface FileDownloadDataType {
  type: 'fileDownload';
  downloadVariable: string;
  triggerAction: string;
  triggerSelector?: string;
  savePath?: string;
  suggestedFilename?: boolean;
}

export const BrowserStorageDataSchema = z.object({
  type: z.literal('browserStorage'),
  storageType: z.enum(['localStorage', 'sessionStorage']),
  operation: z.enum(['setItem', 'getItem', 'removeItem', 'clear']),
  key: z.string().optional(),
  value: z.string().optional(),
  resultVariable: z.string().optional(),
});

export interface BrowserStorageDataType {
  type: 'browserStorage';
  storageType: 'localStorage' | 'sessionStorage';
  operation: 'setItem' | 'getItem' | 'removeItem' | 'clear';
  key?: string;
  value?: string;
  resultVariable?: string;
}

export const NewContextDataSchema = z.object({
  type: z.literal('newContext'),
  contextVariable: z.string(),
  options: z.string().optional(),
});

export interface NewContextDataType {
  type: 'newContext';
  contextVariable: string;
  options?: string;
}

export const UtilityCallArgumentSchema = z.object({
  name: z.string(),
  value: z.string(),
});

export const UtilityCallDataSchema = z.object({
  type: z.literal('utilityCall'),
  functionName: z.string(),
  modulePath: z.string(),
  arguments: z.array(UtilityCallArgumentSchema),
  awaitExpression: z.boolean(),
  returnVariable: z.string().optional(),
});

export interface UtilityCallDataType {
  type: 'utilityCall';
  functionName: string;
  modulePath: string;
  arguments: { name: string; value: string }[];
  awaitExpression: boolean;
  returnVariable?: string;
}

export const IterationDataSchema = z.object({
  type: z.literal('iteration'),
  method: z.enum(['forEach', 'map', 'filter']),
  arrayExpression: z.string(),
  callbackParams: z.array(z.string()),
  children: z.lazy((): z.ZodType<ActionNode[]> => z.array(ActionNodeSchema)),
  code: z.string().optional(),
  resultVariable: z.string().optional(),
  isAsync: z.boolean().optional(),
});
export type IterationData = z.infer<typeof IterationDataSchema>;

export interface IterationDataType {
  type: 'iteration';
  method: 'forEach' | 'map' | 'filter';
  arrayExpression: string;
  callbackParams: string[];
  children: ActionNode[];
  code?: string;
  resultVariable?: string;
  isAsync?: boolean;
}

export const SwitchCaseSchema = z.object({
  value: z.string().nullable(),
  children: z.lazy((): z.ZodType<ActionNode[]> => z.array(ActionNodeSchema)),
  fallsThrough: z.boolean(),
});

export const SwitchDataSchema = z.object({
  type: z.literal('switch'),
  expression: z.string(),
  cases: z.array(SwitchCaseSchema),
  code: z.string().optional(),
});
export type SwitchData = z.infer<typeof SwitchDataSchema>;

export interface SwitchCaseType {
  value: string | null;
  children: ActionNode[];
  fallsThrough: boolean;
}

export interface SwitchDataType {
  type: 'switch';
  expression: string;
  cases: SwitchCaseType[];
  code?: string;
}

export const HarRouteDataSchema = z.object({
  type: z.literal('harRoute'),
  harFilePath: z.string(),
  mode: z.enum(['playback', 'record']),
  url: z.string().optional(),
  notFound: z.enum(['abort', 'fallback']).optional(),
});
export type HarRouteData = z.infer<typeof HarRouteDataSchema>;

export const InlineDataDataSchema = z.object({
  type: z.literal('inlineData'),
  variableName: z.string(),
  dataType: z.enum(['array-of-objects', 'array-of-primitives', 'object']),
  values: z.union([z.array(z.unknown()), z.record(z.unknown())]),
  code: z.string(),
  isConst: z.boolean().optional(),
});

export interface InlineDataDataType {
  type: 'inlineData';
  variableName: string;
  dataType: 'array-of-objects' | 'array-of-primitives' | 'object';
  values: unknown[] | Record<string, unknown>;
  code: string;
  isConst?: boolean;
}

export const ActionDataSchema: z.ZodType<ActionData> = z.discriminatedUnion('type', [
  NavigateDataSchema,
  ClickDataSchema,
  FillDataSchema,
  HoverDataSchema,
  SelectOptionDataSchema,
  AssertTextDataSchema,
  AssertVisibleDataSchema,
  AssertCountDataSchema,
  AssertURLDataSchema,
  AssertTitleDataSchema,
  AssertScreenshotDataSchema,
  AssertAttributeDataSchema,
  AssertValueDataSchema,
  AssertClassDataSchema,
  AssertEnabledDataSchema,
  AssertDisabledDataSchema,
  AssertCheckedDataSchema,
  AssertHiddenDataSchema,
  WaitDataSchema,
  ScreenshotDataSchema,
  CodeBlockDataSchema,
  PageObjectRefDataSchema,
  LoopDataSchema,
  ConditionalDataSchema,
  NetworkRouteDataSchema,
  ApiRequestDataSchema,
  NewTabDataSchema,
  DialogHandlerDataSchema,
  FileUploadDataSchema,
  StorageStateDataSchema,
  CookieActionDataSchema,
  FileDownloadDataSchema,
  GroupDataSchema,
  TryCatchDataSchema,
  ParameterizedTestDataSchema,
  ResponseAssertionDataSchema,
  BrowserStorageDataSchema,
  NewContextDataSchema,
  UtilityCallDataSchema,
  IterationDataSchema,
  SwitchDataSchema,
  HarRouteDataSchema,
  InlineDataDataSchema,
]);

export type ActionData =
  | z.infer<typeof NavigateDataSchema>
  | z.infer<typeof ClickDataSchema>
  | z.infer<typeof FillDataSchema>
  | z.infer<typeof HoverDataSchema>
  | z.infer<typeof SelectOptionDataSchema>
  | z.infer<typeof AssertTextDataSchema>
  | z.infer<typeof AssertVisibleDataSchema>
  | z.infer<typeof AssertCountDataSchema>
  | z.infer<typeof AssertURLDataSchema>
  | z.infer<typeof AssertTitleDataSchema>
  | z.infer<typeof AssertScreenshotDataSchema>
  | z.infer<typeof AssertAttributeDataSchema>
  | z.infer<typeof AssertValueDataSchema>
  | z.infer<typeof AssertClassDataSchema>
  | z.infer<typeof AssertEnabledDataSchema>
  | z.infer<typeof AssertDisabledDataSchema>
  | z.infer<typeof AssertCheckedDataSchema>
  | z.infer<typeof AssertHiddenDataSchema>
  | z.infer<typeof WaitDataSchema>
  | z.infer<typeof ScreenshotDataSchema>
  | z.infer<typeof CodeBlockDataSchema>
  | z.infer<typeof PageObjectRefDataSchema>
  | LoopDataType
  | ConditionalDataType
  | NetworkRouteDataType
  | z.infer<typeof ApiRequestDataSchema>
  | NewTabDataType
  | DialogHandlerDataType
  | FileUploadDataType
  | StorageStateDataType
  | CookieActionDataType
  | FileDownloadDataType
  | GroupDataType
  | TryCatchDataType
  | ParameterizedTestDataType
  | ResponseAssertionDataType
  | BrowserStorageDataType
  | NewContextDataType
  | UtilityCallDataType
  | IterationDataType
  | SwitchDataType
  | z.infer<typeof HarRouteDataSchema>
  | InlineDataDataType;

// Explicit type to break circular inference
export interface ElseIfBranchType {
  condition: string;
  children: ActionNode[];
}

export interface ConditionalDataType {
  type: 'conditional';
  condition: string;
  thenChildren: ActionNode[];
  elseIfBranches?: ElseIfBranchType[];
  elseChildren?: ActionNode[];
  code?: string;
}

// Explicit type to break circular inference
export interface LoopDataType {
  type: 'loop';
  loopKind: 'for' | 'for...of' | 'for...in' | 'while' | 'do...while';
  initializer?: string;
  condition?: string;
  incrementer?: string;
  variableName?: string;
  iterable?: string;
  code?: string;
  body: ActionNode[];
}

// Explicit type to break circular inference
export interface GroupDataType {
  type: 'group';
  stepName: string;
  children: ActionNode[];
  collapsed?: boolean;
}

export interface TryCatchDataType {
  type: 'tryCatch';
  tryChildren: ActionNode[];
  catchVariable?: string;
  catchChildren?: ActionNode[];
  finallyChildren?: ActionNode[];
  code?: string;
}

export interface FulfillOptionsType {
  status?: number;
  headers?: Record<string, string>;
  json?: string;
  body?: string;
  contentType?: string;
}

export interface ContinueOverridesType {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  postData?: string;
}

export interface NetworkRouteDataType {
  type: 'networkRoute';
  urlPattern: string;
  handlerAction: 'fulfill' | 'abort' | 'continue';
  fulfillOptions?: FulfillOptionsType;
  abortReason?: string;
  continueOverrides?: ContinueOverridesType;
}

export const ActionNodeSchema: z.ZodType<ActionNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    type: ActionTypeSchema,
    position: PositionSchema,
    data: ActionDataSchema,
    declaredVariables: z.array(DeclaredVariableSchema).optional(),
    usedVariables: z.array(z.string()).optional(),
    frameLocators: z.array(z.string()).optional(),
  }),
);
