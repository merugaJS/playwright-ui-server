import { Project, SyntaxKind, ObjectLiteralExpression, Node, SourceFile } from 'ts-morph';
import type { PlaywrightConfig } from '../model/config.js';

/**
 * Update a playwright.config.ts file in-place using AST modification.
 * Modifies only the known properties and preserves everything else
 * (custom code, comments, formatting).
 *
 * Returns the new file content as a string.
 */
export function updatePlaywrightConfig(configPath: string, updates: PlaywrightConfig): string {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  const sourceFile = project.addSourceFileAtPath(configPath);

  const configObject = findConfigObject(sourceFile);
  if (!configObject) {
    throw new Error('Could not find config object in file. Expected defineConfig({...}) or export default {...}');
  }

  // Apply scalar properties at root level
  setStringProperty(configObject, 'testDir', updates.testDir);

  if (updates.timeout !== undefined) {
    setNumberProperty(configObject, 'timeout', updates.timeout);
  } else {
    removeProperty(configObject, 'timeout');
  }

  if (updates.retries !== undefined) {
    setNumberProperty(configObject, 'retries', updates.retries);
  } else {
    removeProperty(configObject, 'retries');
  }

  if (updates.workers !== undefined) {
    if (typeof updates.workers === 'number') {
      setNumberProperty(configObject, 'workers', updates.workers);
    } else {
      setStringProperty(configObject, 'workers', updates.workers);
    }
  } else {
    removeProperty(configObject, 'workers');
  }

  if (updates.outputDir !== undefined) {
    setStringProperty(configObject, 'outputDir', updates.outputDir);
  }

  // Update use.baseURL
  updateUseBaseURL(configObject, updates.baseURL);

  // Update reporter
  updateReporter(configObject, updates.reporter);

  // Update projects array
  if (updates.projects !== undefined) {
    updateProjects(configObject, updates.projects);
  }

  return sourceFile.getFullText();
}

function findConfigObject(sourceFile: SourceFile): ObjectLiteralExpression | undefined {
  // Pattern 1: defineConfig({...})
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

function setStringProperty(obj: ObjectLiteralExpression, name: string, value: string | undefined): void {
  if (value === undefined) return;

  const prop = obj.getProperty(name);
  if (prop && Node.isPropertyAssignment(prop)) {
    prop.setInitializer(`'${escapeString(value)}'`);
  } else if (!prop) {
    obj.addPropertyAssignment({
      name,
      initializer: `'${escapeString(value)}'`,
    });
  }
}

function setNumberProperty(obj: ObjectLiteralExpression, name: string, value: number): void {
  const prop = obj.getProperty(name);
  if (prop && Node.isPropertyAssignment(prop)) {
    prop.setInitializer(String(value));
  } else if (!prop) {
    obj.addPropertyAssignment({
      name,
      initializer: String(value),
    });
  }
}

function removeProperty(obj: ObjectLiteralExpression, name: string): void {
  const prop = obj.getProperty(name);
  if (prop) {
    prop.remove();
  }
}

function updateUseBaseURL(configObject: ObjectLiteralExpression, baseURL: string | undefined): void {
  const useProp = configObject.getProperty('use');

  if (baseURL !== undefined) {
    if (useProp && Node.isPropertyAssignment(useProp)) {
      const useInit = useProp.getInitializer();
      if (useInit && Node.isObjectLiteralExpression(useInit)) {
        setStringProperty(useInit, 'baseURL', baseURL);
      }
    } else if (!useProp) {
      // Create use object with baseURL
      configObject.addPropertyAssignment({
        name: 'use',
        initializer: `{\n    baseURL: '${escapeString(baseURL)}',\n  }`,
      });
    }
  } else {
    // Remove baseURL from use if it exists
    if (useProp && Node.isPropertyAssignment(useProp)) {
      const useInit = useProp.getInitializer();
      if (useInit && Node.isObjectLiteralExpression(useInit)) {
        removeProperty(useInit, 'baseURL');
      }
    }
  }
}

function updateReporter(configObject: ObjectLiteralExpression, reporter: PlaywrightConfig['reporter']): void {
  if (reporter === undefined) {
    removeProperty(configObject, 'reporter');
    return;
  }

  let initText: string;
  if (typeof reporter === 'string') {
    initText = `'${escapeString(reporter)}'`;
  } else if (Array.isArray(reporter)) {
    const items = reporter.map(r => {
      if (typeof r === 'string') return `'${escapeString(r)}'`;
      if (Array.isArray(r)) return `['${escapeString(r[0])}', ${JSON.stringify(r[1])}]`;
      return `'${escapeString(String(r))}'`;
    });
    initText = `[${items.join(', ')}]`;
  } else {
    return;
  }

  const prop = configObject.getProperty('reporter');
  if (prop && Node.isPropertyAssignment(prop)) {
    prop.setInitializer(initText);
  } else if (!prop) {
    configObject.addPropertyAssignment({
      name: 'reporter',
      initializer: initText,
    });
  }
}

function updateProjects(configObject: ObjectLiteralExpression, projects: NonNullable<PlaywrightConfig['projects']>): void {
  const projectsText = generateProjectsArrayText(projects);

  const prop = configObject.getProperty('projects');
  if (prop && Node.isPropertyAssignment(prop)) {
    prop.setInitializer(projectsText);
  } else if (!prop) {
    configObject.addPropertyAssignment({
      name: 'projects',
      initializer: projectsText,
    });
  }
}

function generateProjectsArrayText(projects: NonNullable<PlaywrightConfig['projects']>): string {
  if (projects.length === 0) return '[]';

  const items = projects.map(p => {
    const parts: string[] = [`name: '${escapeString(p.name)}'`];

    if (p.testDir) {
      parts.push(`testDir: '${escapeString(p.testDir)}'`);
    }

    if (p.use) {
      const useParts: string[] = [];
      if (p.use.browserName) {
        useParts.push(`browserName: '${p.use.browserName}'`);
      }
      if (p.use.device) {
        useParts.push(`...devices['${escapeString(p.use.device)}']`);
      }
      if (p.use.viewport) {
        useParts.push(`viewport: { width: ${p.use.viewport.width}, height: ${p.use.viewport.height} }`);
      }
      if (p.use.baseURL) {
        useParts.push(`baseURL: '${escapeString(p.use.baseURL)}'`);
      }

      if (useParts.length > 0) {
        parts.push(`use: { ${useParts.join(', ')} }`);
      }
    }

    return `{\n      ${parts.join(',\n      ')},\n    }`;
  });

  return `[\n    ${items.join(',\n    ')},\n  ]`;
}

function escapeString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
