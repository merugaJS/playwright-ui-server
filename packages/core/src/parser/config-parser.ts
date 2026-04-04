import { Project, SyntaxKind, ObjectLiteralExpression, Node } from 'ts-morph';
import type { PlaywrightConfig, PlaywrightProject } from '../model/config.js';

/**
 * Parse a playwright.config.ts file and extract configuration.
 * Uses ts-morph AST parsing to read the static config object.
 * Falls back to sensible defaults for anything it cannot extract.
 */
export function parsePlaywrightConfig(configPath: string): PlaywrightConfig {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  const sourceFile = project.addSourceFileAtPath(configPath);

  const defaults: PlaywrightConfig = {
    testDir: './tests',
  };

  // Look for defineConfig({...}) or export default {...}
  const configObject = findConfigObject(sourceFile);
  if (!configObject) {
    return defaults;
  }

  return extractConfig(configObject, defaults);
}

function findConfigObject(sourceFile: ReturnType<Project['addSourceFileAtPath']>): ObjectLiteralExpression | undefined {
  // Pattern 1: export default defineConfig({...})
  const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
  for (const call of callExpressions) {
    const expr = call.getExpression();
    if (expr.getText() === 'defineConfig') {
      const args = call.getArguments();
      if (args.length > 0 && Node.isObjectLiteralExpression(args[0])) {
        return args[0];
      }
    }
  }

  // Pattern 2: export default {...}
  const defaultExport = sourceFile.getDefaultExportSymbol();
  if (defaultExport) {
    const declarations = defaultExport.getDeclarations();
    for (const decl of declarations) {
      const objLiteral = decl.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression)[0];
      if (objLiteral) {
        return objLiteral;
      }
    }
  }

  return undefined;
}

function extractConfig(obj: ObjectLiteralExpression, defaults: PlaywrightConfig): PlaywrightConfig {
  const config = { ...defaults };

  // Extract testDir
  const testDir = getStringProperty(obj, 'testDir');
  if (testDir !== undefined) config.testDir = testDir;

  // Extract testMatch
  const testMatch = getStringOrArrayProperty(obj, 'testMatch');
  if (testMatch !== undefined) config.testMatch = testMatch;

  // Extract testIgnore
  const testIgnore = getStringOrArrayProperty(obj, 'testIgnore');
  if (testIgnore !== undefined) config.testIgnore = testIgnore;

  // Extract outputDir
  const outputDir = getStringProperty(obj, 'outputDir');
  if (outputDir !== undefined) config.outputDir = outputDir;

  // Extract timeout
  const timeout = getNumberProperty(obj, 'timeout');
  if (timeout !== undefined) config.timeout = timeout;

  // Extract retries
  const retries = getNumberProperty(obj, 'retries');
  if (retries !== undefined) config.retries = retries;

  // Extract workers (number or string like '50%')
  const workersProp = obj.getProperty('workers');
  if (workersProp && Node.isPropertyAssignment(workersProp)) {
    const init = workersProp.getInitializer();
    if (init && Node.isNumericLiteral(init)) {
      config.workers = init.getLiteralValue();
    } else if (init && Node.isStringLiteral(init)) {
      config.workers = init.getLiteralValue();
    }
  }

  // Extract reporter
  const reporterProp = obj.getProperty('reporter');
  if (reporterProp && Node.isPropertyAssignment(reporterProp)) {
    const init = reporterProp.getInitializer();
    if (init && Node.isStringLiteral(init)) {
      config.reporter = init.getLiteralValue();
    } else if (init && Node.isArrayLiteralExpression(init)) {
      const reporters: (string | [string, Record<string, unknown>])[] = [];
      for (const el of init.getElements()) {
        if (Node.isStringLiteral(el)) {
          reporters.push(el.getLiteralValue());
        } else if (Node.isArrayLiteralExpression(el)) {
          const elems = el.getElements();
          if (elems.length >= 1 && Node.isStringLiteral(elems[0])) {
            reporters.push(elems[0].getLiteralValue());
          }
        }
      }
      config.reporter = reporters;
    }
  }

  // Extract globalSetup
  const globalSetup = getStringProperty(obj, 'globalSetup');
  if (globalSetup !== undefined) config.globalSetup = globalSetup;

  // Extract globalTeardown
  const globalTeardown = getStringProperty(obj, 'globalTeardown');
  if (globalTeardown !== undefined) config.globalTeardown = globalTeardown;

  // Extract baseURL from use.baseURL
  const useProp = obj.getProperty('use');
  if (useProp && Node.isPropertyAssignment(useProp)) {
    const useInit = useProp.getInitializer();
    if (useInit && Node.isObjectLiteralExpression(useInit)) {
      const baseURL = getStringProperty(useInit, 'baseURL');
      if (baseURL !== undefined) config.baseURL = baseURL;
    }
  }

  // Extract projects array
  const projectsProp = obj.getProperty('projects');
  if (projectsProp && Node.isPropertyAssignment(projectsProp)) {
    const projectsInit = projectsProp.getInitializer();
    if (projectsInit && Node.isArrayLiteralExpression(projectsInit)) {
      config.projects = [];
      for (const element of projectsInit.getElements()) {
        if (Node.isObjectLiteralExpression(element)) {
          const project = extractProject(element);
          if (project) {
            config.projects.push(project);
          }
        }
      }
    }
  }

  return config;
}

function extractProject(obj: ObjectLiteralExpression): PlaywrightProject | undefined {
  const name = getStringProperty(obj, 'name');
  if (!name) return undefined;

  const project: PlaywrightProject = {
    name,
    testDir: getStringProperty(obj, 'testDir'),
  };

  // Extract use object
  const useProp = obj.getProperty('use');
  if (useProp && Node.isPropertyAssignment(useProp)) {
    const useInit = useProp.getInitializer();
    if (useInit && Node.isObjectLiteralExpression(useInit)) {
      project.use = {};

      const browserName = getStringProperty(useInit, 'browserName');
      if (browserName && (browserName === 'chromium' || browserName === 'firefox' || browserName === 'webkit')) {
        project.use.browserName = browserName;
      }

      const device = getStringProperty(useInit, 'device');
      if (device) project.use.device = device;

      const baseURL = getStringProperty(useInit, 'baseURL');
      if (baseURL) project.use.baseURL = baseURL;

      // Extract viewport
      const viewportProp = useInit.getProperty('viewport');
      if (viewportProp && Node.isPropertyAssignment(viewportProp)) {
        const vpInit = viewportProp.getInitializer();
        if (vpInit && Node.isObjectLiteralExpression(vpInit)) {
          const width = getNumberProperty(vpInit, 'width');
          const height = getNumberProperty(vpInit, 'height');
          if (width !== undefined && height !== undefined) {
            project.use.viewport = { width, height };
          }
        }
      }

      // Also check ...devices['xxx'] spread for device detection
      const spreadAssignments = useInit.getDescendantsOfKind(SyntaxKind.SpreadAssignment);
      for (const spread of spreadAssignments) {
        const text = spread.getExpression().getText();
        const match = text.match(/devices\[['"](.+?)['"]\]/);
        if (match) {
          project.use.device = match[1];
        }
      }
    }
  }

  return project;
}

function getStringProperty(obj: ObjectLiteralExpression, name: string): string | undefined {
  const prop = obj.getProperty(name);
  if (prop && Node.isPropertyAssignment(prop)) {
    const init = prop.getInitializer();
    if (init && Node.isStringLiteral(init)) {
      return init.getLiteralValue();
    }
  }
  return undefined;
}

function getNumberProperty(obj: ObjectLiteralExpression, name: string): number | undefined {
  const prop = obj.getProperty(name);
  if (prop && Node.isPropertyAssignment(prop)) {
    const init = prop.getInitializer();
    if (init && Node.isNumericLiteral(init)) {
      return init.getLiteralValue();
    }
  }
  return undefined;
}

function getStringOrArrayProperty(obj: ObjectLiteralExpression, name: string): string | string[] | undefined {
  const prop = obj.getProperty(name);
  if (prop && Node.isPropertyAssignment(prop)) {
    const init = prop.getInitializer();
    if (init && Node.isStringLiteral(init)) {
      return init.getLiteralValue();
    }
    if (init && Node.isArrayLiteralExpression(init)) {
      return init.getElements()
        .filter(Node.isStringLiteral)
        .map(el => el.getLiteralValue());
    }
  }
  return undefined;
}
