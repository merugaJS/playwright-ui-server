import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCli } from './cli.js';
import { scanProject } from './project-scanner.js';
import { createApp } from './app.js';
import { setupWebSocket } from './ws.js';
import { startWatcher } from './watcher.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getVersion(): string {
  const candidates = [
    path.resolve(__dirname, '../package.json'),
    path.resolve(__dirname, '../../package.json'),
    path.resolve(__dirname, '../../../package.json'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8')).version ?? '0.0.0';
    } catch {}
  }
  return '0.0.0';
}

async function main() {
  const options = parseCli(process.argv);

  const resolvedDir = path.resolve(options.dir);
  if (!fs.existsSync(resolvedDir)) {
    console.error(`\n  ⚠️  Directory not found: ${resolvedDir}\n`);
    process.exit(1);
  }

  const projectInfo = scanProject(options.dir);

  console.log(`\n  🎭 Playwright UI Server v${getVersion()}\n`);
  console.log(`  Project: ${projectInfo.rootDir}`);
  console.log(`  Config:  ${projectInfo.configPath ?? 'not found (using defaults)'}`);
  console.log(`  Tests:   ${projectInfo.testFiles.length} file(s) discovered`);
  console.log(`  Pages:   ${projectInfo.pageObjectFiles.length} page object(s) discovered\n`);

  const app = createApp(projectInfo);
  const server = http.createServer(app);

  // WebSocket for real-time sync
  setupWebSocket(server);

  // File watcher for external changes
  startWatcher(projectInfo);

  // Catch EADDRINUSE from both HTTP and WebSocket servers
  process.on('uncaughtException', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n  ❌ Port ${options.port} is already in use. Try a different port with: playwright-ui-server -p <port>\n`);
      process.exit(1);
    }
    console.error('Unexpected error:', err);
    process.exit(1);
  });

  server.listen(options.port, () => {
    const url = `http://localhost:${options.port}`;
    console.log(`  Dashboard: ${url}`);
    console.log(`  WebSocket: ws://localhost:${options.port}/ws`);
    console.log(`  Watching:  ${projectInfo.config.testDir}\n`);

    // Open browser (unless --no-open)
    if (options.open) {
      import('open').then(({ default: open }) => open(url)).catch(() => {});
    }
  });
}

main().catch((err) => {
  console.error('Failed to start playwright-ui-server:', err);
  process.exit(1);
});
