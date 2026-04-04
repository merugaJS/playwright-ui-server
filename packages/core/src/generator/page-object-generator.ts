import type { PageObject, PageObjectLocator, PageObjectMethod } from '../model/page-object.js';
import type { LocatorStrategy } from '../model/action-node.js';

/**
 * Generate a TypeScript page object class file from a PageObject model.
 */
export function generatePageObjectFile(po: PageObject): string {
  const lines: string[] = [];

  // Imports
  lines.push(`import { type Page, type Locator } from '@playwright/test';`);
  lines.push('');

  // Class declaration
  lines.push(`export class ${po.name} {`);

  // Locator properties
  for (const loc of po.locators) {
    lines.push(`  readonly ${loc.name}: Locator;`);
  }
  if (po.locators.length > 0) lines.push('');

  // Constructor
  lines.push('  constructor(private readonly page: Page) {');
  for (const loc of po.locators) {
    lines.push(`    this.${loc.name} = page.${generateLocatorCall(loc)};`);
  }
  lines.push('  }');

  // Methods
  for (const method of po.methods) {
    lines.push('');
    generateMethod(method, lines);
  }

  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

function generateLocatorCall(loc: PageObjectLocator): string {
  const { strategy, value } = loc;

  switch (strategy) {
    case 'getByRole':
      // value might already include options like "'button', { name: 'Submit' }"
      if (value.includes(',') && !value.startsWith("'")) {
        return `getByRole(${value})`;
      }
      return `getByRole('${escapeString(value)}')`;
    case 'getByText':
      return `getByText('${escapeString(value)}')`;
    case 'getByLabel':
      return `getByLabel('${escapeString(value)}')`;
    case 'getByPlaceholder':
      return `getByPlaceholder('${escapeString(value)}')`;
    case 'getByTestId':
      return `getByTestId('${escapeString(value)}')`;
    case 'locator':
      return `locator('${escapeString(value)}')`;
    case 'css':
      return `locator('${escapeString(value)}')`;
    case 'xpath':
      return `locator('xpath=${escapeString(value)}')`;
    default:
      return `locator('${escapeString(value)}')`;
  }
}

function generateMethod(method: PageObjectMethod, lines: string[]): void {
  const params = method.parameters
    .map((p) => `${p.name}: ${p.type}`)
    .join(', ');

  lines.push(`  async ${method.name}(${params}) {`);

  // Indent the body
  const bodyLines = method.body.split('\n');
  for (const line of bodyLines) {
    lines.push(`    ${line}`);
  }

  lines.push('  }');
}

function escapeString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
