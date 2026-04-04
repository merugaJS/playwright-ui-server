# playwright-ui-server

Visual Playwright test automation builder — see your Playwright tests as interactive flowcharts.

Install in any Playwright project, run `npx playwright-ui-server`, and instantly get a visual dashboard that parses your `.spec.ts` files into drag-and-drop flow diagrams.

## Install

```bash
npm install playwright-ui-server
```

## Usage

```bash
# Start in your Playwright project directory
npx playwright-ui-server

# Custom port
npx playwright-ui-server -p 3000

# Point to a different project directory
npx playwright-ui-server -d ./path/to/project

# Don't auto-open browser
npx playwright-ui-server --no-open
```

## What it does

- **Parses** your Playwright test files (`.spec.ts`, `.test.ts`) into visual action nodes
- **Displays** tests as interactive flowcharts using React Flow
- **Supports 40+ action types**: clicks, fills, assertions, API requests, network interception, loops, conditionals, try/catch, multi-tab, file uploads, and more
- **Page objects**: auto-discovers and visualizes page object classes with locators and methods
- **Config parsing**: reads your `playwright.config.ts` for projects, timeouts, and settings
- **Live reload**: watches your test files and updates the UI in real-time via WebSocket
- **Code generation**: edit flows visually and generate valid Playwright test code

## Supported Playwright Patterns

| Category | Patterns |
|----------|----------|
| **Locators** | getByRole, getByText, getByLabel, getByTestId, getByPlaceholder, getByAltText, getByTitle, CSS, XPath, chained locators, frame locators |
| **Actions** | click, fill, check, select, hover, press, drag & drop, file upload/download |
| **Assertions** | toBeVisible, toHaveText, toHaveURL, toHaveTitle, toBeEnabled, toBeChecked, toHaveValue, toHaveScreenshot, soft assertions, custom messages |
| **Structure** | describe blocks, beforeEach/afterEach, beforeAll/afterAll, serial/parallel modes, test.setTimeout |
| **Advanced** | network route/mock/abort, API testing (request fixture), data-driven tests, loops, conditionals, try/catch, multi-tab/context, page objects |

## Architecture

- **Parser**: Uses [ts-morph](https://ts-morph.com/) to parse TypeScript AST into structured action nodes
- **Server**: Express + WebSocket + chokidar file watcher
- **UI**: React + React Flow + Zustand + React Query + Tailwind CSS

## Requirements

- Node.js >= 18
- A Playwright project with `.spec.ts` or `.test.ts` files

## License

MIT
