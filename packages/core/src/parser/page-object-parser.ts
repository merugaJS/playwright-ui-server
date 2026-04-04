import {
  Project,
  SyntaxKind,
  Node,
  ClassDeclaration,
  PropertyDeclaration,
  MethodDeclaration,
  SourceFile,
  CallExpression,
  PropertyAccessExpression,
} from 'ts-morph';
import fs from 'node:fs';
import path from 'node:path';
import type { PageObject, PageObjectLocator, PageObjectMethod } from '../model/page-object.js';
import type { LocatorStrategy } from '../model/action-node.js';

/**
 * Parse a page object TypeScript file into a PageObject model.
 * Expects a class that takes `page` in its constructor and defines locators as properties.
 * Returns null if the file doesn't contain a recognizable page object class.
 */
export function parsePageObjectFile(filePath: string): PageObject | null {
  const project = new Project({ skipAddingFilesFromTsConfig: true });

  let sourceFile: SourceFile;
  try {
    sourceFile = project.addSourceFileAtPath(filePath);
  } catch {
    return null;
  }

  const classDecl = findPageObjectClass(sourceFile);
  if (!classDecl) {
    return null;
  }

  // Verify it looks like a page object: constructor must accept a `page` parameter
  // (either as an explicit parameter or a parameter property like `private page: Page`)
  if (!hasPageParameter(classDecl)) {
    return null;
  }

  const className = classDecl.getName() ?? 'UnnamedPageObject';
  const locators = extractLocators(classDecl);
  const methods = extractMethods(classDecl);

  const id = Buffer.from(filePath).toString('base64url');

  return {
    id,
    filePath,
    name: className,
    locators,
    methods,
  };
}

/**
 * Scan a directory for TypeScript page object files and parse each one.
 * Skips files that don't contain a recognizable page object class.
 */
export function scanPageObjectFiles(dir: string): PageObject[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const pageObjects: PageObject[] = [];

  function walk(currentDir: string): void {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        // Skip node_modules and hidden directories
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          walk(fullPath);
        }
      } else if (entry.isFile() && /\.(ts|js)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
        const parsed = parsePageObjectFile(fullPath);
        if (parsed) {
          pageObjects.push(parsed);
        }
      }
    }
  }

  walk(dir);
  return pageObjects;
}

/**
 * Find the first exported class declaration in the file.
 * Page objects are typically `export class LoginPage { ... }`
 */
function findPageObjectClass(sourceFile: SourceFile): ClassDeclaration | undefined {
  // Prefer exported classes
  const classes = sourceFile.getClasses();
  const exported = classes.find((c) => c.isExported());
  return exported ?? classes[0];
}

/**
 * Check whether the class constructor accepts a `page` parameter,
 * either as a regular parameter or a parameter property (e.g., `private page: Page`).
 */
function hasPageParameter(classDecl: ClassDeclaration): boolean {
  const constructor = classDecl.getConstructors()[0];
  if (!constructor) {
    // No explicit constructor — check if any property initializer references `this.page`
    // (could be using a parameter property from a base class or shorthand)
    for (const prop of classDecl.getProperties()) {
      const init = prop.getInitializer();
      if (init && init.getText().includes('this.page')) {
        return true;
      }
    }
    return false;
  }

  for (const param of constructor.getParameters()) {
    if (param.getName() === 'page') {
      return true;
    }
  }

  return false;
}

/**
 * Extract locators from class properties.
 * Patterns:
 *   readonly emailInput = this.page.getByLabel('Email');
 *   readonly submitBtn = this.page.locator('#submit');
 *   emailInput: Locator;  (with constructor assignment)
 */
function extractLocators(classDecl: ClassDeclaration): PageObjectLocator[] {
  const locators: PageObjectLocator[] = [];

  for (const prop of classDecl.getProperties()) {
    const name = prop.getName();
    const initializer = prop.getInitializer();

    if (initializer && Node.isCallExpression(initializer)) {
      const locator = matchLocatorCall(initializer);
      if (locator) {
        locators.push({ name, ...locator });
        continue;
      }
    }

    // Check for chained locator: this.page.getByRole('button').first()
    if (initializer && Node.isCallExpression(initializer)) {
      const chainLocator = matchChainedLocator(initializer);
      if (chainLocator) {
        locators.push({ name, ...chainLocator });
        continue;
      }
    }

    // Check constructor body for assignments like this.emailInput = page.getByLabel('Email')
    const constructorAssignment = findConstructorAssignment(classDecl, name);
    if (constructorAssignment) {
      locators.push({ name, ...constructorAssignment });
    }
  }

  // Also check constructor for locators assigned to properties not declared explicitly
  const constructor = classDecl.getConstructors()[0];
  if (constructor) {
    const body = constructor.getBody();
    if (body && Node.isBlock(body)) {
      for (const stmt of body.getStatements()) {
        if (Node.isExpressionStatement(stmt)) {
          const expr = stmt.getExpression();
          if (Node.isBinaryExpression(expr)) {
            const left = expr.getLeft();
            const right = expr.getRight();
            if (Node.isPropertyAccessExpression(left) && left.getExpression().getText() === 'this') {
              const propName = left.getName();
              // Skip if already found
              if (locators.some((l) => l.name === propName)) continue;
              if (Node.isCallExpression(right)) {
                const locator = matchLocatorCall(right);
                if (locator) {
                  locators.push({ name: propName, ...locator });
                }
              }
            }
          }
        }
      }
    }
  }

  return locators;
}

/**
 * Match a call expression like `this.page.getByLabel('Email')` or `page.locator('.btn')`
 */
function matchLocatorCall(callExpr: CallExpression): { strategy: LocatorStrategy; value: string } | null {
  const callee = callExpr.getExpression();
  if (!Node.isPropertyAccessExpression(callee)) return null;

  const methodName = callee.getName();
  const objectText = callee.getExpression().getText();

  // Must be on this.page or page
  if (!objectText.endsWith('page') && !objectText.endsWith('this.page')) return null;

  const strategyMap: Record<string, LocatorStrategy> = {
    getByRole: 'getByRole',
    getByText: 'getByText',
    getByLabel: 'getByLabel',
    getByPlaceholder: 'getByPlaceholder',
    getByTestId: 'getByTestId',
    locator: 'locator',
  };

  const strategy = strategyMap[methodName];
  if (!strategy) return null;

  const args = callExpr.getArguments();
  if (args.length === 0) return null;

  let value: string;
  if (args.length === 1) {
    value = extractStringValue(args[0]);
  } else {
    value = args.map((a) => a.getText()).join(', ');
  }

  return { strategy, value };
}

/**
 * Match chained locator calls like `this.page.getByRole('button').first()`
 * We extract the base locator strategy from the inner call.
 */
function matchChainedLocator(callExpr: CallExpression): { strategy: LocatorStrategy; value: string } | null {
  const callee = callExpr.getExpression();
  if (!Node.isPropertyAccessExpression(callee)) return null;

  // The object of the chain call might be another call expression (the locator)
  const innerExpr = callee.getExpression();
  if (Node.isCallExpression(innerExpr)) {
    return matchLocatorCall(innerExpr);
  }

  return null;
}

/**
 * Find constructor assignment for a property: this.propName = page.getBy...()
 */
function findConstructorAssignment(
  classDecl: ClassDeclaration,
  propName: string,
): { strategy: LocatorStrategy; value: string } | null {
  const constructor = classDecl.getConstructors()[0];
  if (!constructor) return null;

  const body = constructor.getBody();
  if (!body || !Node.isBlock(body)) return null;

  for (const stmt of body.getStatements()) {
    if (!Node.isExpressionStatement(stmt)) continue;
    const expr = stmt.getExpression();
    if (!Node.isBinaryExpression(expr)) continue;

    const left = expr.getLeft();
    if (!Node.isPropertyAccessExpression(left)) continue;
    if (left.getExpression().getText() !== 'this') continue;
    if (left.getName() !== propName) continue;

    const right = expr.getRight();
    if (Node.isCallExpression(right)) {
      return matchLocatorCall(right);
    }
  }

  return null;
}

/**
 * Extract methods from the class (excluding constructor).
 */
function extractMethods(classDecl: ClassDeclaration): PageObjectMethod[] {
  const methods: PageObjectMethod[] = [];

  for (const method of classDecl.getMethods()) {
    const name = method.getName();
    if (name === 'constructor') continue;

    const parameters = method.getParameters().map((p) => ({
      name: p.getName(),
      type: p.getType()?.getText() || 'string',
    }));

    // Get the method body text (without the outer braces)
    const body = method.getBody();
    let bodyText = '';
    if (body && Node.isBlock(body)) {
      const statements = body.getStatements();
      bodyText = statements.map((s) => s.getText()).join('\n');
    }

    methods.push({
      name,
      parameters,
      body: bodyText,
    });
  }

  return methods;
}

function extractStringValue(node: Node): string {
  if (Node.isStringLiteral(node)) {
    return node.getLiteralValue();
  }
  if (Node.isNoSubstitutionTemplateLiteral(node)) {
    return node.getText().replace(/^`|`$/g, '');
  }
  return node.getText().replace(/^['"]|['"]$/g, '');
}
