## Context & Problem

The `@collie-lang/vite` plugin provides Collie template discovery and virtual modules (e.g. `virtual:collie/registry`, `virtual:collie/template/*`). In practice:

* Vite’s **dependency pre-bundling** (`optimizeDeps` via esbuild) does **not** run Vite plugin `resolveId/load`, causing failures when deps import `virtual:collie/*`.
* SSR and some build paths may **externalize** runtime packages (notably `@collie-lang/react`), which can lead to Node trying to import `virtual:collie/*` at runtime and crashing.
* Dev FS churn can cause scan instability.
* Some diagnostic formatting uses incorrect file paths, reducing debuggability.
* Direct `.collie` imports should remain unsupported for userland, but internal plugin-importer flows must not self-break.

This plan hardens the Vite MVP while keeping architecture simple.

---

## Do NOT write tests

* Do NOT create or modify test files.
* Do NOT add new test dependencies.
* Do NOT change CI config for tests.

---

## Scope

You may modify files only within:

* `packages/vite/**`

Do NOT modify:

* `packages/compiler/**`
* `packages/react/**` (unless strictly necessary; prefer Vite-side fixes)
* `packages/cli/**`
* `packages/*/templates/**` (unless explicitly called out in a stage)

---

## Acceptance Criteria (global)

* A fresh Vite React app using `@collie-lang/vite` + `@collie-lang/react` can run `vite dev` without:

  * “Could not resolve virtual:collie/registry”
  * “Direct .collie imports are not supported” originating from Collie’s internal virtual modules
* The plugin remains strict about **userland** direct `.collie` imports (still errors with the helpful guidance).
* Diagnostics printed during scan/compile point to the correct `.collie` file (or best available path).
* File watching / HMR does not crash when `.collie` files are created/deleted mid-scan.
* TypeScript builds without warnings like `possibly undefined` in the plugin code.

---

# Stage 1 — Vite Config Hardening (optimizeDeps + SSR)

### Complete: 0%

### Goal

Prevent common runtime/dev failures by ensuring `@collie-lang/react` is handled correctly by Vite:

* Avoid optimizeDeps pre-bundling of `@collie-lang/react` (esbuild can’t resolve virtual modules)
* Avoid SSR externalization of `@collie-lang/react` (Node can’t execute virtual imports)

### Changes

**File:** `packages/vite/src/index.ts`

1. In the plugin object you return, add a `config(userConfig)` hook.

2. Merge without clobbering user settings:

   * Append `@collie-lang/react` to `optimizeDeps.exclude`
   * Append `@collie-lang/react` to `ssr.noExternal` **only if** `ssr.noExternal` is an array (if it’s `true` or regex or something else, preserve it as-is).

3. Ensure de-duplication (use a Set).

### Implementation Notes (recommended snippet shape)

* Read previous config values safely:

  * `const prevExclude = userConfig.optimizeDeps?.exclude ?? []`
  * `const prevNoExternal = userConfig.ssr?.noExternal ?? []`
* Return a partial Vite config object from the `config()` hook.

### Acceptance Criteria

* `vite dev` no longer fails due to virtual module resolution in prebundled `@collie-lang/react`.
* `vite dev --ssr` (or SSR usage in frameworks) does not attempt to run `@collie-lang/react` as an external module that imports virtual ids at runtime.

---

# Stage 2 — Strict Userland `.collie` Imports, Allow Internal Importers

### Complete: 0%

### Goal

Keep the rule: user code must not import `.collie` directly.
But avoid blocking internal Vite analysis paths when the importer is Collie’s own virtual modules.

### Changes

**File:** `packages/vite/src/index.ts`

1. In `resolveId`, only throw the “Direct .collie imports” error when the importer is **not** internal.

Internal importers should be recognized if `importer` starts with:

* `"\0collie:"` or `"collie:"` (handle both)

2. In `load`, if `isCollieFile(cleanId)` and importer is internal, return `null` (don’t throw).
   If not internal, throw the direct import error.

3. Ensure TypeScript narrowing by returning after `this.error(...)` calls.

### Acceptance Criteria

* Userland `import "./App.collie"` still errors with guidance.
* The plugin does not crash due to internal `collie:registry` resolution paths.

---

# Stage 3 — TypeScript “Possibly Undefined” Cleanup

### Complete: 0%

### Goal

Eliminate TS errors like `'record' is possibly 'undefined'` without weakening runtime behavior.

### Changes

**File:** `packages/vite/src/index.ts`

1. In the `VIRTUAL_TEMPLATE_*` branch, after:

* `if (!record) { this.error(...); }`

Add an immediate:

* `return null;`

2. After any other `this.error(...)` inside `load()` (and similar flow-control points), add `return null;` so TS can narrow control-flow.

### Acceptance Criteria

* `pnpm -C packages/vite lint` (or your root `pnpm lint` / `tsc --noEmit`) no longer reports “possibly undefined” for `record` in this package.

---

# Stage 4 — Diagnostic Formatting Correctness

### Complete: 0%

### Goal

When `ensureTemplates()` finds parse/compile errors, the output should correctly reference the actual `.collie` file rather than printing the project root as the file path.

### Changes

**File:** `packages/vite/src/index.ts`

1. Locate the “initial scan / parse” error formatting inside `ensureTemplates` that currently calls something like:

* `formatDiagnostic(root, diag, root)` or any usage where `root` is passed as the file path.

2. Change it to pass the diagnostic’s best file reference:

* Prefer `diag.filePath`
* Then `diag.file`
* Then fallback to `root`

Example logic:

* `const fileForDiag = diag.filePath ?? diag.file ?? root;`
* `formatDiagnostic(fileForDiag, diag, root)`

### Acceptance Criteria

* A parse error inside `src/App.collie` prints an error referencing `src/App.collie` (or equivalent), not the project root.

---

# Stage 5 — Resilient File Scanning Under FS Churn

### Complete: 0%

### Goal

Avoid scan crashes when `.collie` files are created/deleted/renamed while scanning.

### Changes

**File:** `packages/vite/src/index.ts`

1. In `ensureTemplates()`, find the loop that reads `.collie` files:

* `await fs.readFile(filePath, 'utf-8')`

2. Wrap `readFile` in a try/catch:

   * If the error is `ENOENT`, skip that file (`continue`)
   * If anything else, rethrow (or `this.error` via the existing flow)

### Acceptance Criteria

* Rapidly creating/deleting a `.collie` file during dev does not crash Vite.
* Templates still scan and registry still builds on the next pass.

---

## Stage 6 — Packaging Hygiene (Optional but Recommended)

### Complete: 0%

### Goal

Keep the package lean and reduce confusion/diff noise.

### Changes

**Files:** `packages/vite/.gitignore` (or root `.gitignore` if applicable)

1. Ensure the following are ignored (package-local or repo-wide):

* `packages/vite/node_modules`
* `packages/vite/dist`
* `*.tgz` (if you pack locally)

2. Ensure `package.json` `files` field remains restrictive:

* should include only `dist` (and minimal metadata if needed)

### Acceptance Criteria

* Git status isn’t polluted by built output and node_modules.
* `npm publish` content remains correct (dist only).