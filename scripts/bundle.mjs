#!/usr/bin/env node
/**
 * Bundle playwright-ui-server into a single distributable npm package.
 *
 * 1. Builds all workspace packages (core, server, ui)
 * 2. Uses esbuild to bundle server + core into a single JS file
 * 3. Copies the pre-built UI dist into dist/ui/
 */

import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function run(cmd) {
  console.log(`  $ ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
}

console.log('\n📦 Bundling playwright-ui-server for npm publish\n');

// Step 1: Clean
console.log('1. Cleaning dist/');
if (existsSync(path.join(ROOT, 'dist'))) {
  rmSync(path.join(ROOT, 'dist'), { recursive: true });
}
mkdirSync(path.join(ROOT, 'dist'), { recursive: true });

// Step 2: Build workspace packages
console.log('\n2. Building workspace packages...');
run('pnpm run build');

// Step 3: Bundle server + core with esbuild
console.log('\n3. Bundling server + core into dist/server.mjs...');
await esbuild.build({
  entryPoints: [path.join(ROOT, 'packages/server/dist/index.js')],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  outfile: path.join(ROOT, 'dist/server.mjs'),
  external: [
    'express',
    'ws',
    'chokidar',
    'commander',
    'open',
    'ts-morph',
    'zod',
    // Node built-ins
    'node:*',
    'path',
    'fs',
    'http',
    'url',
    'crypto',
    'child_process',
    'os',
    'events',
    'stream',
    'util',
    'net',
    'tls',
    'assert',
    'buffer',
    'querystring',
    'string_decoder',
  ],
  banner: {
    js: '// playwright-ui-server v0.1.0 - bundled for npm',
  },
});

// Step 4: Copy UI dist
console.log('\n4. Copying UI assets to dist/ui/...');
cpSync(
  path.join(ROOT, 'packages/ui/dist'),
  path.join(ROOT, 'dist/ui'),
  { recursive: true },
);

// Step 5: Verify output
console.log('\n5. Verifying bundle...');
const serverBundle = path.join(ROOT, 'dist/server.mjs');
const uiIndex = path.join(ROOT, 'dist/ui/index.html');

if (!existsSync(serverBundle)) {
  console.error('❌ dist/server.mjs not found!');
  process.exit(1);
}
if (!existsSync(uiIndex)) {
  console.error('❌ dist/ui/index.html not found!');
  process.exit(1);
}

const bundleSize = (statSync(serverBundle).size / 1024).toFixed(0);
console.log(`  ✅ dist/server.mjs — ${bundleSize} KB`);
console.log('  ✅ dist/ui/ — ready');

console.log('\n✨ Bundle complete! Ready for: npm publish\n');
