import { describe, it, expect } from 'vitest';
import { parseUtilitySource, classifyFunction } from '../utility-parser.js';

describe('utility-parser', () => {
  describe('classifyFunction', () => {
    it('classifies function with Page parameter as helper', () => {
      const kind = classifyFunction([
        { name: 'page', type: 'Page' },
        { name: 'user', type: 'string' },
      ]);
      expect(kind).toBe('helper');
    });

    it('classifies function with BrowserContext parameter as helper', () => {
      const kind = classifyFunction([
        { name: 'ctx', type: 'BrowserContext' },
      ]);
      expect(kind).toBe('helper');
    });

    it('classifies function with APIRequestContext parameter as helper', () => {
      const kind = classifyFunction([
        { name: 'req', type: 'APIRequestContext' },
      ]);
      expect(kind).toBe('helper');
    });

    it('classifies function with Browser parameter as helper', () => {
      const kind = classifyFunction([
        { name: 'b', type: 'Browser' },
      ]);
      expect(kind).toBe('helper');
    });

    it('classifies function with no Playwright params as utility', () => {
      const kind = classifyFunction([]);
      expect(kind).toBe('utility');
    });

    it('classifies function with only string params as utility', () => {
      const kind = classifyFunction([
        { name: 'prefix', type: 'string' },
        { name: 'length', type: 'number' },
      ]);
      expect(kind).toBe('utility');
    });

    it('falls back to parameter name heuristic when type is missing', () => {
      const kind = classifyFunction([
        { name: 'page' },
        { name: 'user' },
      ]);
      expect(kind).toBe('helper');
    });

    it('falls back to parameter name heuristic when type is any', () => {
      const kind = classifyFunction([
        { name: 'page', type: 'any' },
      ]);
      expect(kind).toBe('helper');
    });

    it('does not use name heuristic when type is explicitly non-Playwright', () => {
      const kind = classifyFunction([
        { name: 'page', type: 'number' },
      ]);
      expect(kind).toBe('utility');
    });
  });

  describe('parseUtilitySource', () => {
    it('classifies login(page: Page, user: string) as helper', () => {
      const code = `
        import { Page } from '@playwright/test';
        export async function login(page: Page, user: string) {
          await page.goto('/login');
        }
      `;
      const fns = parseUtilitySource(code);
      expect(fns).toHaveLength(1);
      expect(fns[0].name).toBe('login');
      expect(fns[0].kind).toBe('helper');
      expect(fns[0].isAsync).toBe(true);
      expect(fns[0].parameters).toEqual([
        { name: 'page', type: 'Page' },
        { name: 'user', type: 'string' },
      ]);
    });

    it('classifies generateId() as utility', () => {
      const code = `
        export function generateId(): string {
          return Math.random().toString(36).slice(2);
        }
      `;
      const fns = parseUtilitySource(code);
      expect(fns).toHaveLength(1);
      expect(fns[0].name).toBe('generateId');
      expect(fns[0].kind).toBe('utility');
      expect(fns[0].isAsync).toBe(false);
      expect(fns[0].parameters).toEqual([]);
    });

    it('classifies function with destructured Playwright params as helper', () => {
      const code = `
        import { Page } from '@playwright/test';
        export async function login({ page, username }: { page: Page; username: string }) {
          await page.fill('#user', username);
        }
      `;
      const fns = parseUtilitySource(code);
      expect(fns).toHaveLength(1);
      expect(fns[0].name).toBe('login');
      expect(fns[0].kind).toBe('helper');
      expect(fns[0].parameters).toEqual([
        { name: 'page', type: 'Page' },
        { name: 'username', type: 'string' },
      ]);
    });

    it('classifies arrow function with Page param as helper', () => {
      const code = `
        import { Page } from '@playwright/test';
        export const fillForm = async (page: Page, data: Record<string, string>) => {
          for (const [key, value] of Object.entries(data)) {
            await page.fill(key, value);
          }
        };
      `;
      const fns = parseUtilitySource(code);
      expect(fns).toHaveLength(1);
      expect(fns[0].name).toBe('fillForm');
      expect(fns[0].kind).toBe('helper');
      expect(fns[0].isAsync).toBe(true);
    });

    it('classifies arrow function without Playwright params as utility', () => {
      const code = `
        export const formatDate = (date: Date): string => {
          return date.toISOString();
        };
      `;
      const fns = parseUtilitySource(code);
      expect(fns).toHaveLength(1);
      expect(fns[0].name).toBe('formatDate');
      expect(fns[0].kind).toBe('utility');
    });

    it('skips non-exported functions', () => {
      const code = `
        function internalHelper(page: Page) {}
        export function publicHelper(page: Page) {}
      `;
      const fns = parseUtilitySource(code);
      expect(fns).toHaveLength(1);
      expect(fns[0].name).toBe('publicHelper');
    });

    it('handles multiple functions in one file', () => {
      const code = `
        import { Page, BrowserContext } from '@playwright/test';
        export async function login(page: Page, user: string) {}
        export function generateId(): string { return ''; }
        export async function setupContext(ctx: BrowserContext) {}
      `;
      const fns = parseUtilitySource(code);
      expect(fns).toHaveLength(3);

      const login = fns.find(f => f.name === 'login');
      expect(login?.kind).toBe('helper');

      const genId = fns.find(f => f.name === 'generateId');
      expect(genId?.kind).toBe('utility');

      const setupCtx = fns.find(f => f.name === 'setupContext');
      expect(setupCtx?.kind).toBe('helper');
    });

    it('uses parameter name fallback for untyped params', () => {
      const code = `
        export async function doLogin(page, username) {
          await page.goto('/login');
        }
      `;
      const fns = parseUtilitySource(code);
      expect(fns).toHaveLength(1);
      expect(fns[0].kind).toBe('helper');
    });

    it('classifies function with import()-qualified Page type as helper', () => {
      const code = `
        export async function navigate(page: import("@playwright/test").Page, url: string) {
          await page.goto(url);
        }
      `;
      const fns = parseUtilitySource(code);
      expect(fns).toHaveLength(1);
      expect(fns[0].kind).toBe('helper');
    });

    it('extracts JSDoc description', () => {
      const code = `
        /** Logs in a user with the given credentials. */
        export async function login(page: Page, user: string) {}
      `;
      const fns = parseUtilitySource(code);
      expect(fns).toHaveLength(1);
      expect(fns[0].description).toBe('Logs in a user with the given credentials.');
    });

    it('sets correct metadata fields', () => {
      const code = `
        export function helper(page: Page) {}
      `;
      const fns = parseUtilitySource(code, 'helpers/auth.ts', './helpers/auth');
      expect(fns).toHaveLength(1);
      expect(fns[0].filePath).toBe('helpers/auth.ts');
      expect(fns[0].modulePath).toBe('./helpers/auth');
      expect(fns[0].isExported).toBe(true);
    });
  });
});
