# Context & Problem
`collie init` patches `vite.config.*` and currently may inject `collie()` after `react()`, which can break the pipeline when Collie outputs JSX/TSX that React must transform. We must ensure `collie()` runs before React’s plugin, even when the `plugins` array is multiline and contains other plugins before/after React.

Example existing config:

```ts
plugins: [
  otherPlugin1(),
  react(),
  otherPlugin2()
]
```

We must update init patching so it inserts/reorders correctly without mangling formatting.

# Do NOT write tests

* Do NOT add/modify tests.
* Do NOT add new test tooling.

# Required behavior

## 1) CLI: Patch `vite.config.*` plugins array robustly

### Files to detect

Treat the project as Vite if any exist at project root:

* `vite.config.ts`, `vite.config.js`, `vite.config.mjs`, `vite.config.cjs`

### Required imports

Ensure the config includes:

* `import collie from '@collie-lang/vite'` (or equivalent require for CJS if your patcher supports it)
  Do not duplicate the import.

### Plugins array edit rules

Find the `plugins` array in the exported Vite config (supports:

* `defineConfig({ ... })`
* `defineConfig(() => ({ ... }))`
* plain object export)

Then enforce these rules:

1. If `collie()` is missing:

   * If a React plugin call exists in the array (`react(...)` where `react` is imported from `@vitejs/plugin-react` or `@vitejs/plugin-react-swc`):

     * Insert `collie()` **immediately before** the first React plugin call, preserving multiline formatting and indentation.
   * Else (no React plugin call found):

     * Insert `collie()` as the **first** element in the plugins array.

2. If both `collie()` and React plugin call exist:

   * Ensure `collie()` appears **before** the first React plugin call.
   * If `collie()` is currently after React, move only `collie()` (do NOT reorder other plugins).
   * Preserve relative order of all other plugins.

3. Do not duplicate `collie()` if already present.

### Must handle formatting

The patcher must work for:

* inline array: `plugins: [react(), other()]`
* multiline array:

  ```ts
  plugins: [
    otherPlugin1(),
    react(),
    otherPlugin2(),
  ]
  ```
* React call with args:

  * `react({ jsxImportSource: ... })`
* Trailing commas and varying whitespace.

### Implementation approach

Prefer using a real parser:

* If you already use `ts-morph` or the TypeScript compiler API in the CLI, use it here.
* If you do not, add a minimal AST-based edit using TypeScript’s parser (recommended over fragile regex).
* Keep edits minimal: do not reformat the entire file; update only the import and the plugins array elements.

### Fallback (only if needed)

If you cannot confidently locate or edit the plugins array:

* Print a warning telling the user to ensure `collie()` is before `react()`.
* Do NOT attempt a destructive rewrite.

## 2) Vite plugin: Make ordering resilient

In `@collie-lang/vite` plugin definition (likely `packages/vite/src/index.ts`), set:

* `enforce: 'pre'`
  on the plugin object returned by `collie()`.

# Acceptance criteria

* Given a config with `plugins: [other1(), react(), other2()]`, after init it becomes:

  * `plugins: [other1(), collie(), react(), other2()]`
    (same formatting style preserved where possible)
* Given `plugins: [other1(), react(), collie(), other2()]`, after init it becomes:

  * `plugins: [other1(), collie(), react(), other2()]`
* Inline and multiline forms both work.
* No duplicate imports or plugin entries.
* `@collie-lang/vite` has `enforce: 'pre'`.

# Scope

* Modify only necessary CLI init patching code under `packages/cli/src/**`.
* Modify only necessary Vite plugin code under `packages/vite/src/**`.
* Do NOT edit dist/ outputs.