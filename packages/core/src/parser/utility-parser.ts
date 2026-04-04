import {
  Project,
  Node,
  SourceFile,
  FunctionDeclaration,
  ParameterDeclaration,
  SyntaxKind,
} from 'ts-morph';
import type { UtilityFunction, UtilityFunctionKind, UtilityFunctionParam } from '../model/utility-function.js';

/**
 * Playwright-specific type names that indicate a function is a test helper.
 * If any parameter has one of these types, the function is classified as 'helper'.
 */
const PLAYWRIGHT_TYPES = new Set([
  'Page',
  'BrowserContext',
  'APIRequestContext',
  'Browser',
  'Locator',
  'FrameLocator',
  'Frame',
  'Worker',
  'ElectronApplication',
  'AndroidDevice',
]);

/**
 * Common Playwright parameter names used as a fallback heuristic
 * when type information is unavailable (e.g., plain JS files).
 */
const PLAYWRIGHT_PARAM_NAMES = new Set([
  'page',
  'context',
  'browser',
  'request',
  'browserContext',
]);

/**
 * Determine whether a function should be classified as a Playwright test helper
 * based on its parameter types and names.
 *
 * A function is a 'helper' if any of its parameters:
 * 1. Has a type annotation matching a Playwright type (Page, BrowserContext, etc.)
 * 2. Has a name matching a common Playwright variable (page, context, browser, request)
 *    AND no type annotation is available (fallback heuristic for JS files)
 * 3. Uses destructured parameters with Playwright types
 */
export function classifyFunction(params: UtilityFunctionParam[]): UtilityFunctionKind {
  for (const param of params) {
    // Check type annotation first (most reliable)
    if (param.type) {
      const baseType = extractBaseType(param.type);
      if (PLAYWRIGHT_TYPES.has(baseType)) {
        return 'helper';
      }
    }

    // Fallback: check parameter name when type is missing or 'any'
    if (!param.type || param.type === 'any') {
      if (PLAYWRIGHT_PARAM_NAMES.has(param.name)) {
        return 'helper';
      }
    }
  }
  return 'utility';
}

/**
 * Extract the base type name from a possibly qualified type string.
 * E.g., "import('playwright').Page" -> "Page", "Page" -> "Page"
 */
function extractBaseType(typeStr: string): string {
  // Handle import(...).Type patterns
  const importMatch = typeStr.match(/\.(\w+)$/);
  if (importMatch) {
    return importMatch[1];
  }
  // Handle simple type names, stripping any generic parameters
  const genericMatch = typeStr.match(/^(\w+)/);
  return genericMatch ? genericMatch[1] : typeStr;
}

/**
 * Extract parameters from a ts-morph function declaration,
 * including support for destructured parameters with type annotations.
 */
function extractParams(funcDecl: FunctionDeclaration): UtilityFunctionParam[] {
  const params: UtilityFunctionParam[] = [];

  for (const param of funcDecl.getParameters()) {
    const nameNode = param.getNameNode();

    if (Node.isObjectBindingPattern(nameNode)) {
      // Destructured parameter: { page, user }: { page: Page; user: string }
      // Check the type annotation of the entire destructured parameter
      const typeAnnotation = param.getTypeNode();
      if (typeAnnotation) {
        // Parse the type literal to extract individual property types
        const typeText = typeAnnotation.getText();
        for (const element of nameNode.getElements()) {
          const propName = element.getName();
          const propTypeMatch = typeText.match(
            new RegExp(`${propName}\\s*:\\s*([^;},]+)`)
          );
          params.push({
            name: propName,
            type: propTypeMatch ? propTypeMatch[1].trim() : undefined,
          });
        }
      } else {
        // No type annotation on destructured param — use names only
        for (const element of nameNode.getElements()) {
          params.push({ name: element.getName() });
        }
      }
    } else {
      // Regular parameter
      const name = param.getName();
      const typeNode = param.getTypeNode();
      const type = typeNode ? typeNode.getText() : undefined;
      params.push({ name, type });
    }
  }

  return params;
}

/**
 * Parse a TypeScript/JavaScript file and extract all exported functions,
 * classifying each as either a 'helper' or 'utility'.
 *
 * @param filePath Absolute path to the source file
 * @param modulePath Module specifier to use for imports (e.g., './helpers/auth')
 * @returns Array of parsed utility functions
 */
export function parseUtilityFile(filePath: string, modulePath: string): UtilityFunction[] {
  const project = new Project({ skipAddingFilesFromTsConfig: true });

  let sourceFile: SourceFile;
  try {
    sourceFile = project.addSourceFileAtPath(filePath);
  } catch {
    return [];
  }

  return parseUtilitySourceFile(sourceFile, filePath, modulePath);
}

/**
 * Parse a ts-morph SourceFile and extract all exported functions,
 * classifying each as either a 'helper' or 'utility'.
 *
 * @param sourceFile ts-morph SourceFile to analyze
 * @param filePath Absolute path of the file (for metadata)
 * @param modulePath Module specifier to use for imports
 * @returns Array of parsed utility functions
 */
export function parseUtilitySourceFile(
  sourceFile: SourceFile,
  filePath: string,
  modulePath: string,
): UtilityFunction[] {
  const results: UtilityFunction[] = [];

  // Process top-level function declarations
  for (const funcDecl of sourceFile.getFunctions()) {
    if (!funcDecl.isExported()) continue;

    const name = funcDecl.getName();
    if (!name) continue;

    const parameters = extractParams(funcDecl);
    const kind = classifyFunction(parameters);
    const isAsync = funcDecl.isAsync();

    // Extract JSDoc description if present
    const jsDocs = funcDecl.getJsDocs();
    const description = jsDocs.length > 0 ? jsDocs[0].getDescription().trim() : undefined;

    results.push({
      name,
      filePath,
      modulePath,
      kind,
      parameters,
      isAsync,
      isExported: true,
      description: description || undefined,
    });
  }

  // Process exported variable declarations holding arrow functions / function expressions
  for (const varStmt of sourceFile.getVariableStatements()) {
    if (!varStmt.isExported()) continue;

    for (const decl of varStmt.getDeclarations()) {
      const name = decl.getName();
      const init = decl.getInitializer();
      if (!init) continue;

      let parameters: UtilityFunctionParam[] = [];
      let isAsync = false;

      if (Node.isArrowFunction(init) || Node.isFunctionExpression(init)) {
        isAsync = init.isAsync();
        for (const param of init.getParameters()) {
          const nameNode = param.getNameNode();
          if (Node.isObjectBindingPattern(nameNode)) {
            const typeAnnotation = param.getTypeNode();
            if (typeAnnotation) {
              const typeText = typeAnnotation.getText();
              for (const element of nameNode.getElements()) {
                const propName = element.getName();
                const propTypeMatch = typeText.match(
                  new RegExp(`${propName}\\s*:\\s*([^;},]+)`)
                );
                parameters.push({
                  name: propName,
                  type: propTypeMatch ? propTypeMatch[1].trim() : undefined,
                });
              }
            } else {
              for (const element of nameNode.getElements()) {
                parameters.push({ name: element.getName() });
              }
            }
          } else {
            const paramName = param.getName();
            const typeNode = param.getTypeNode();
            parameters.push({
              name: paramName,
              type: typeNode ? typeNode.getText() : undefined,
            });
          }
        }

        const kind = classifyFunction(parameters);

        results.push({
          name,
          filePath,
          modulePath,
          kind,
          parameters,
          isAsync,
          isExported: true,
        });
      }
    }
  }

  return results;
}

/**
 * Parse utility source code from a string (useful for testing).
 */
export function parseUtilitySource(code: string, filePath = 'test.ts', modulePath = './test'): UtilityFunction[] {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    useInMemoryFileSystem: true,
  });
  const sourceFile = project.createSourceFile(filePath, code);
  return parseUtilitySourceFile(sourceFile, filePath, modulePath);
}
