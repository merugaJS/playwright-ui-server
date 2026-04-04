/**
 * Scans source files for `process.env.VAR_NAME` and destructured
 * `const { FOO } = process.env` references.
 */

export interface EnvVarReference {
  /** The environment variable name, e.g. "BASE_URL" */
  name: string;
  /** Relative file paths that reference this variable */
  referencedIn: string[];
}

/**
 * Scan a single source string and return the set of env var names found.
 *
 * Handles:
 *  - `process.env.VAR_NAME`
 *  - `process.env['VAR_NAME']` / `process.env["VAR_NAME"]`
 *  - `const { FOO, BAR } = process.env`
 *  - `const { FOO: renamed } = process.env`
 */
export function scanEnvVarsInSource(source: string): string[] {
  const vars = new Set<string>();

  // 1. process.env.VAR_NAME
  const dotAccess = /process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g;
  let match: RegExpExecArray | null;
  while ((match = dotAccess.exec(source)) !== null) {
    vars.add(match[1]);
  }

  // 2. process.env['VAR'] or process.env["VAR"]
  const bracketAccess = /process\.env\[['"]([A-Za-z_][A-Za-z0-9_]*)['"]\]/g;
  while ((match = bracketAccess.exec(source)) !== null) {
    vars.add(match[1]);
  }

  // 3. Destructured: const { FOO, BAR: renamed } = process.env
  const destructured = /(?:const|let|var)\s*\{([^}]+)\}\s*=\s*process\.env/g;
  while ((match = destructured.exec(source)) !== null) {
    const inner = match[1];
    // Split by comma, handle `KEY: alias` pattern — we want the KEY
    const parts = inner.split(',');
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      // "FOO: bar" => FOO, or just "FOO"
      const keyMatch = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)/);
      if (keyMatch) {
        vars.add(keyMatch[1]);
      }
    }
  }

  return [...vars].sort();
}

/**
 * Scan multiple files for env var references.
 *
 * @param files - Array of `{ filePath, content }` where filePath is relative.
 * @returns Deduplicated array of env var references with all files that use each var.
 */
export function scanEnvVars(
  files: { filePath: string; content: string }[],
): EnvVarReference[] {
  const varMap = new Map<string, Set<string>>();

  for (const { filePath, content } of files) {
    const vars = scanEnvVarsInSource(content);
    for (const v of vars) {
      if (!varMap.has(v)) {
        varMap.set(v, new Set());
      }
      varMap.get(v)!.add(filePath);
    }
  }

  return [...varMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, files]) => ({
      name,
      referencedIn: [...files].sort(),
    }));
}
