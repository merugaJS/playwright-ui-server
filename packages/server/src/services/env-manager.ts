import fs from 'node:fs';
import path from 'node:path';
import { scanEnvVars, type EnvVarReference } from '@playwright-server/core';
import type { ProjectInfo } from '../project-scanner.js';

export interface EnvVarInfo {
  name: string;
  /** The merged value (UI override > .env > system env). Masked unless unmasked. */
  value: string | undefined;
  /** Where the value comes from */
  source: 'override' | 'dotenv' | 'system' | 'unset';
  /** Relative file paths that reference this variable */
  referencedIn: string[];
}

/**
 * Manages environment variable discovery, loading, and overrides.
 *
 * Priority (highest to lowest):
 *   1. UI overrides (stored in .playwright-server/env.json)
 *   2. .env file values
 *   3. System environment variables
 */
export class EnvManager {
  private projectInfo: ProjectInfo;
  private overridesPath: string;

  constructor(projectInfo: ProjectInfo) {
    this.projectInfo = projectInfo;
    this.overridesPath = path.join(
      projectInfo.rootDir,
      '.playwright-server',
      'env.json',
    );
  }

  /**
   * Scan test files and config for env var references.
   */
  discoverEnvVars(): EnvVarReference[] {
    const files: { filePath: string; content: string }[] = [];

    // Scan test files
    for (const testFile of this.projectInfo.testFiles) {
      const absPath = path.join(this.projectInfo.rootDir, testFile.filePath);
      if (fs.existsSync(absPath)) {
        files.push({
          filePath: testFile.filePath,
          content: fs.readFileSync(absPath, 'utf-8'),
        });
      }
    }

    // Scan config file
    if (this.projectInfo.configPath && fs.existsSync(this.projectInfo.configPath)) {
      files.push({
        filePath: path.relative(this.projectInfo.rootDir, this.projectInfo.configPath),
        content: fs.readFileSync(this.projectInfo.configPath, 'utf-8'),
      });
    }

    return scanEnvVars(files);
  }

  /**
   * Parse a .env file into a key-value map.
   * Handles KEY=VALUE, quoted values, comments, and blank lines.
   */
  loadDotEnv(): Record<string, string> {
    const envPath = path.join(this.projectInfo.rootDir, '.env');
    if (!fs.existsSync(envPath)) {
      return {};
    }

    const result: Record<string, string> = {};
    const content = fs.readFileSync(envPath, 'utf-8');

    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) continue;

      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;

      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();

      // Strip surrounding quotes
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (key) {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Load UI overrides from .playwright-server/env.json.
   */
  loadOverrides(): Record<string, string> {
    if (!fs.existsSync(this.overridesPath)) {
      return {};
    }
    try {
      const raw = fs.readFileSync(this.overridesPath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, string>;
      }
      return {};
    } catch {
      return {};
    }
  }

  /**
   * Save UI overrides to .playwright-server/env.json.
   */
  saveOverrides(overrides: Record<string, string>): void {
    const dir = path.dirname(this.overridesPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.overridesPath, JSON.stringify(overrides, null, 2) + '\n', 'utf-8');
  }

  /**
   * Get the full list of discovered env vars with their merged values.
   *
   * @param masked - If true (default), mask values to show only first/last char.
   */
  getEnvVars(masked = true): EnvVarInfo[] {
    const discovered = this.discoverEnvVars();
    const dotenv = this.loadDotEnv();
    const overrides = this.loadOverrides();

    return discovered.map((ref) => {
      let value: string | undefined;
      let source: EnvVarInfo['source'] = 'unset';

      // Priority: override > dotenv > system
      if (ref.name in overrides) {
        value = overrides[ref.name];
        source = 'override';
      } else if (ref.name in dotenv) {
        value = dotenv[ref.name];
        source = 'dotenv';
      } else if (ref.name in process.env) {
        value = process.env[ref.name];
        source = 'system';
      }

      return {
        name: ref.name,
        value: value !== undefined && masked ? maskValue(value) : value,
        source,
        referencedIn: ref.referencedIn,
      };
    });
  }

  /**
   * Update overrides for one or more env vars.
   * Merges with existing overrides.
   */
  updateOverrides(updates: Record<string, string>): void {
    const existing = this.loadOverrides();
    const merged = { ...existing, ...updates };

    // Remove entries with empty string to allow "unsetting" overrides
    for (const [key, val] of Object.entries(merged)) {
      if (val === '') {
        delete merged[key];
      }
    }

    this.saveOverrides(merged);
  }
}

/**
 * Mask a value for display: show first and last characters, mask the rest.
 * Short values (<=3 chars) are fully masked.
 */
export function maskValue(value: string): string {
  if (value.length === 0) return '';
  if (value.length <= 3) return '*'.repeat(value.length);
  return value[0] + '*'.repeat(value.length - 2) + value[value.length - 1];
}
