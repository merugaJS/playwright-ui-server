export { computeVariableScope } from './variable-scope.js';
export type { NodeVariableScope } from './variable-scope.js';
export {
  computeRequiredImports,
  resolveFlowImports,
  collectAllActions,
  extractReferencedSymbols,
  extractIdentifiersFromCode,
  computePlaywrightImports,
  mergeImportDeclarations,
} from './import-resolver.js';
export type { SymbolRegistry } from './import-resolver.js';
export { scanEnvVars, scanEnvVarsInSource } from './env-scanner.js';
export type { EnvVarReference } from './env-scanner.js';
export { analyzeCoverage } from './coverage-analyzer.js';
export type { MethodCoverage, LocatorCoverage, CoverageReport } from './coverage-analyzer.js';
