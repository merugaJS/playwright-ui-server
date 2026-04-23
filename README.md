# playwright-ui-server

Visual Playwright test automation builder — see your Playwright tests as interactive flowcharts.

Install in any Playwright project, run `npx playwright-ui-server`, and instantly get a visual dashboard that parses your `.spec.ts` files into drag-and-drop flow diagrams, with live reload, a test runner, a config editor, and page-object editing.

![Flowchart view of a Playwright test](https://raw.githubusercontent.com/merugaJS/playwright-ui-server/main/docs/images/flowchart.png)

---

## Install

```bash
npm install --save-dev playwright-ui-server
```

Or run directly without installing:

```bash
npx playwright-ui-server
```

## Run

From the root of any Playwright project:

```bash
# Start (auto-opens browser)
npx playwright-ui-server

# Custom port
npx playwright-ui-server --port 3000

# Point at another project directory
npx playwright-ui-server --dir ./path/to/project

# Don't auto-open browser
npx playwright-ui-server --no-open
```

**Requirements:** Node.js ≥ 18, a project with `playwright.config.ts`/`.js` and `.spec.ts`/`.test.ts` (or `.js`) files.

---

## Features

### Visual test flows

Each test becomes a left-to-right flowchart. Hooks (`beforeEach`, `afterAll`) show as pills, actions render as typed cards, and the minimap + zoom controls make large tests navigable. The full file is shown as tabs across the top — switch test cases without leaving the canvas.

![Visual flowchart of a homepage test](https://raw.githubusercontent.com/merugaJS/playwright-ui-server/main/docs/images/flowchart.png)

### Page Object editor

Page objects discovered under `pages/`, `page-objects/`, `pom/`, or any `*.page.ts`/`*.page.js` file in your project are parsed into a form view: class name, locators (name / strategy / value), and methods (name / parameters / body). Click a locator or method name in the sidebar to jump straight to it in the editor.

![Page Object editor showing HomePage locators and methods](https://raw.githubusercontent.com/merugaJS/playwright-ui-server/main/docs/images/page-object-editor.png)

### Test runner with history

Run individual tests, a full file, or the whole suite. Live output streams into the Test Runner panel; pass/fail badges appear on test files in the sidebar, and the run history is kept so you can re-open older logs without rerunning.

![Test Runner panel showing a passing run with history](https://raw.githubusercontent.com/merugaJS/playwright-ui-server/main/docs/images/test-runner.png)

### Config editor

Edit `playwright.config.ts` fields — `testDir`, `baseURL`, `timeout`, `retries`, `workers`, `outputDir` — through a form. Project definitions are shown read-only (edit the file directly for those).

![Playwright config editor](https://raw.githubusercontent.com/merugaJS/playwright-ui-server/main/docs/images/config-editor.png)

### Create tests and page objects inline

Hit the `+` next to **Tests** or **Page Objects** in the sidebar to scaffold a new `.spec.ts` or `*.page.ts`. New test files get a `test.describe` block ready to edit; new page objects are generated with the standard class template.

![Inline "Add Page Object" input in the sidebar](https://raw.githubusercontent.com/merugaJS/playwright-ui-server/main/docs/images/add-page-object.png)

### Live reload

A `chokidar` watcher streams filesystem changes over WebSocket, debounced and batched. Edit a test file in your IDE and the flowchart updates without a manual refresh; the reverse is also true — saving a flow writes valid Playwright code back through the ts-morph generator.

---

## UI tour

```
┌─────────────────────────────────────────────────────────────────┐
│ Header: product name, version                                   │
├────────────┬─────────────────────────────────────┬──────────────┤
│  Sidebar   │  Editor (flow / PO / config)        │  Properties  │
│            │                                     │    panel     │
│  • Project │  ┌─ toolbar (undo/redo/save) ────┐  │              │
│  • Tests   │  │                               │  │  Per-node    │
│  • Fixture │  │  Test tabs: TC-001 | TC-002..│  │  fields and  │
│  • Page    │  │                               │  │  delete.     │
│    Objects │  │  Flow canvas (React Flow)     │  │              │
│            │  │                               │  │              │
│  • Config  │  └───────────────────────────────┘  │              │
│            │  Test Runner drawer (bottom)        │              │
└────────────┴─────────────────────────────────────┴──────────────┘
```

### Keyboard shortcuts

| Action | Shortcut |
|--------|----------|
| Delete selected node(s) | `Delete` / `Backspace` |
| Undo | `Ctrl/Cmd + Z` |
| Redo | `Ctrl/Cmd + Shift + Z` or `Ctrl/Cmd + Y` |
| Multi-select | `Shift + click` or drag a selection box |
| Node search | `Ctrl/Cmd + F` |
| Pan canvas | Left-click drag on empty space |
| Zoom | Scroll wheel / zoom controls |

Shortcuts are ignored while your cursor is inside an input field so you can type freely.

---

## Supported Playwright patterns

| Category | Patterns |
|----------|----------|
| **Locators** | `getByRole`, `getByText`, `getByLabel`, `getByTestId`, `getByPlaceholder`, `getByAltText`, `getByTitle`, CSS, XPath, chained locators, frame locators, `.filter()`, `.nth()`, `.first()`, `.last()` |
| **Actions** | click, fill, check, select, hover, press, drag & drop, file upload/download |
| **Assertions** | `toBeVisible`, `toHaveText`, `toHaveURL`, `toHaveTitle`, `toBeEnabled`, `toBeChecked`, `toHaveValue`, `toHaveScreenshot`, soft assertions, custom messages, `.not` negation |
| **Structure** | `describe`, nested describes, `beforeEach`/`afterEach`, `beforeAll`/`afterAll`, `serial`/`parallel` modes, `test.setTimeout`, `test.use`, tags & annotations |
| **Advanced** | network route / mock / abort, API request fixture, data-driven tests, loops (`for`, `while`, `forEach`), conditionals, `try/catch`, multi-tab/context, iframes, page objects, custom fixtures, storage state, cookies |

See `backlog/completed/` in the source tree for the full list of implemented tickets.

---

## Architecture

- **Parser** — [ts-morph](https://ts-morph.com/) turns your TypeScript AST into a `TestFlow` model (Zod-validated).
- **Generator** — writes the model back as Playwright-valid TypeScript/JavaScript.
- **Server** — Express for REST, `chokidar` file watcher, `ws` for WebSocket pushes.
- **UI** — React + [React Flow](https://reactflow.dev/) for the canvas, Zustand for store, React Query for server state, Tailwind for styles.

Everything ships as a single bundle — the published npm package contains `bin/playwright-server.js` and a pre-built `dist/` (server `.mjs` plus UI assets). No separate install step for the UI.

---

## Known issues

See [open issues on GitHub](https://github.com/merugaJS/playwright-ui-server/issues). Most current bugs are tracked there; feel free to add more.

- Found a bug? [Open an issue](https://github.com/merugaJS/playwright-ui-server/issues/new) with repro steps and ideally a screenshot.
- Sending a fix? Fork, branch, open a PR against `main`.

---

## License

MIT
