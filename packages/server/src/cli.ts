import { Command } from 'commander';

export interface CliOptions {
  port: number;
  dir: string;
  open: boolean;
}

export function parseCli(argv: string[]): CliOptions {
  const program = new Command();

  program
    .name('playwright-ui-server')
    .description(
      'Visual Playwright test automation builder.\n\n' +
      'Launches a local server that parses your Playwright tests and\n' +
      'displays them as interactive visual flowcharts in the browser.\n\n' +
      'Usage:\n' +
      '  npx playwright-ui-server                  # start in current dir, port 4700\n' +
      '  npx playwright-ui-server -p 3000          # custom port\n' +
      '  npx playwright-ui-server -d ./my-project  # custom project dir\n' +
      '  npx playwright-ui-server --no-open        # don\'t auto-open browser',
    )
    .version('0.1.0')
    .option('-p, --port <number>', 'port to run the server on (default: 4700)', process.env.PORT || '4700')
    .option('-d, --dir <path>', 'playwright project directory (default: current dir)', '.')
    .option('--no-open', 'do not auto-open the browser')
    .parse(argv);

  const opts = program.opts();
  return {
    port: parseInt(opts.port, 10),
    dir: opts.dir,
    open: opts.open !== false,
  };
}
