# Collie Config Implementation Plan

*Last updated: 2025-12-23*

This file defines a **step-by-step implementation plan** for adding a new, modern **Collie configuration system** based on `collie.config.ts|js|json` at the project root.

The goal is to:

* **Remove any legacy config support** (`.collierc`, ad-hoc config loaders, etc.).
* Introduce a **clean, typed config schema** (`CollieConfig`, `CollieProjectConfig`, etc.).
* Provide a small **`@collie-lang/config` module** with:

  * `defineConfig(...)` helper (for typed configs).
  * `loadConfig(...)` utility (for Node/CLI/bundler adapters).
* Support **root config files**:

  * `collie.config.ts`
  * `collie.config.js` / `.mjs` / `.cjs`
  * `collie.config.json`
* Populate **example configs** in:

  * `docs/examples/config/collie.config.example.js`
  * `docs/examples/config/collie.config.example.ts`
  * `docs/examples/config/collie.config.example.json`

This plan is written for an AI coding assistant (e.g. ChatGPT Codex, Roo Code). You should implement it **stage by stage**.

---

## IMPORTANT INSTRUCTIONS (READ FIRST)

### 1. Clarification First

If any stage or step is ambiguous or conflicts with the current codebase:

1. **Stop.**
2. Respond with a **numbered list of clarifying questions**.
3. Do **not** start implementing that stage until the questions are answered.

### 2. Stage Completion Protocol

For each stage:

1. Implement **all** items in that stage.

2. At the end of each stage, at the top of the stage, update the status with a percentage value, like this:

   ```md
   ### Status: 100% Complete
   ```

This way, I can easily identify which stages couldn't be fully implemented, if there were issues, or if there's something on my end preventing it from being 100% complete.

3. At the end of the stage, append a subsection titled:

   ```md
   ### Implementation Summary (Stage X)
   ```

4. In that summary, briefly describe:

   * What was changed (files, modules, APIs).
   * Any important design decisions and tradeoffs.
   * Any TODOs or follow-ups for later stages.

### 3. Do NOT Write Tests

For this plan:

* **Do NOT** add, modify, or delete unit tests, integration tests, or snapshot tests.
* If tests exist and fail due to these changes:

  * Note the failures in the **Implementation Summary**.
  * Do **not** modify the tests unless a future plan explicitly allows it.

### 4. Stick to the Plan

* Implement stages **in numerical order**.
* Do not “sneak in” features from later stages.
* If you discover that an earlier stage must be adjusted for correctness, document this clearly in the **Implementation Summary** for that stage.

---

## High-Level Design

The new config system should:

1. **Remove legacy config support**

   * Any previous `.collierc*` or `collie.config.*` handling must be removed or disabled.

2. **Introduce a new config API** (conceptual shape):

   ```ts
   // @collie-lang/config
   export interface CollieConfig {
     compiler?: CollieCompilerOptions;
     features?: CollieFeatureOptions;
     editor?: CollieEditorOptions;
     projects: CollieProjectConfig[];
   }

   export interface CollieProjectConfig {
     name?: string;
     type: "html" | "react-vite" | "react-next" | "react-generic";
     root?: string;
     tags?: string[];
     input: string | string[];
     output?: {
       dir?: string;
       format?: "jsx" | "tsx";
     };
     html?: HtmlProjectOptions;
     react?: ReactProjectOptions;
   }

   // ...other interfaces as per stages below

   export function defineConfig(config: CollieConfig): CollieConfig {
     return config;
   }

   export async function loadConfig(options?: {
     cwd?: string;
     explicitPath?: string;
   }): Promise<CollieConfig | null> {
     // Implementation in later stages
   }
   ```

3. **Support config files at project root**:

   * Search order (for now):

     1. `collie.config.ts`
     2. `collie.config.js`
     3. `collie.config.mjs`
     4. `collie.config.cjs`
     5. `collie.config.json`

   * **Do NOT** support `.collierc`, `.collierc.json`, `.collierc.js`, etc.

4. **Example configs** in `docs/examples/config/` will be:

   * Comprehensive, including **all supported fields**.
   * Generously filled with realistic values / placeholders.
   * Easy for devs to **delete what they don’t need**, instead of hunting options.

---

## Stage 0 – Remove Legacy Config Support

### Status: 100% Complete

**Goal:** Find and completely remove any existing config file support (e.g. `.collierc`, older `collie.config` implementations) so we can re-introduce the new system from a clean slate.

### Tasks

1. **Search for legacy config references**

   * Search the entire repo for possible legacy config tokens:

     * Strings to search for:

       * `"collierc"`
       * `"collie.config"`
       * `"CollieConfig"`
       * `"loadConfig"`
       * Any previously used config loader module names.
   * Carefully inspect:

     * `packages/*` directories (especially `compiler`, `cli`, or similar).
     * Any `bin/` or `scripts/` directories that might load a config.
     * Any docs mentioning `.collierc`, `.collierc.json`, or older config formats.

2. **Identify and remove legacy config modules**

   * If there is any dedicated module or file whose responsibility is to:

     * Load `.collierc*` files, or
     * Load `collie.config.*` with an older schema,
     * **Remove** that module/file, or:

       * If parts of it are reusable (e.g. generic file resolution utilities), **extract** only the generic utilities and delete the legacy config logic.
   * Update any **exports** from `@collie-lang/compiler` or other packages that expose legacy config APIs so they no longer reference the old config system.

3. **Remove usages of legacy config**

   * For any codepaths that:

     * Automatically load legacy config files, or
     * Depend on the old config structure:

       * Remove their usage.
       * If required for compilation, replace them with **explicit parameters** or TODO comments referencing the new config system to be implemented in later stages.

4. **Update any internal docs/comments**

   * If internal comments or docstrings still reference:

     * `.collierc`
     * Old config behavior
   * Update or remove them so they no longer contradict the new design.

5. **Ensure the repo still builds**

   * After removing code:

     * Make sure TypeScript builds still succeed.
     * If any build errors arise due to missing types/APIs, cleanly remove those references or replace them with temporary TODO comments that point to this plan.

### Implementation Summary (Stage 0)

- Searched the repo for `collierc`, `collie.config`, `CollieConfig`, and `loadConfig` references to confirm no legacy loader modules or exports remain.
- Updated `cli-report.md` to drop the unused `--config` flag reference and replaced the old `.collierc` feature spec with a reboot notice pointing to this staged plan.
- No code changes were required beyond documentation cleanup, leaving the tree ready for Stage 1 to introduce the new `@collie-lang/config` package.

---

## Stage 1 – Introduce `@collie-lang/config` Package & Types

### Status: Not Started

**Goal:** Create a dedicated `@collie-lang/config` module (or equivalent internal module if the repo doesn’t use separate packages) that defines the core config types and a `defineConfig` helper. At this stage, **no config loading from disk yet** – just types and helpers.

> **Note:** If the repo already has a `@collie-lang/config` package, adapt these steps to **reuse and refactor** it instead of creating a new one.

### Tasks

1. **Create the config package/module**

   * If the monorepo uses `packages/*`:

     * Create a new directory: `packages/config`.
     * Add a `package.json` with:

       * `"name": "@collie-lang/config"`
       * `"main"` / `"module"` / `"types"` entries consistent with other packages.
       * `"files"` field mirroring best practice from other Collie packages.
       * Scripts (e.g. `build`, `clean`) **aligned** with existing packages.
   * Create `tsconfig.json` for this package, following the pattern used in other TypeScript packages in the repo.
   * Add any build configuration (`tsup`, etc.) based on the existing monorepo conventions.

2. **Define core config types**

   * In `packages/config/src/types.ts` (or similar), define interfaces:

     * `CollieConfig`
     * `CollieProjectConfig`
     * `CollieCompilerOptions`
     * `CollieFeatureOptions`
     * `CollieEditorOptions`
     * `HtmlProjectOptions`
     * `ReactProjectOptions`

   * Start with a **minimal but forward-compatible subset**, for example:

     ```ts
     export interface CollieConfig {
       compiler?: CollieCompilerOptions;
       features?: CollieFeatureOptions;
       editor?: CollieEditorOptions;
       projects: CollieProjectConfig[];
     }

     export interface CollieProjectConfig {
       name?: string;
       type: "html" | "react-vite" | "react-next" | "react-generic";
       root?: string;
       tags?: string[];
       input: string | string[];
       output?: {
         dir?: string;
         format?: "jsx" | "tsx";
       };
       html?: HtmlProjectOptions;
       react?: ReactProjectOptions;
     }

     export interface CollieCompilerOptions {
       strictIndentation?: boolean;
       prettyPrintHtml?: boolean;
       minifyHtml?: boolean;
       targetJsVersion?: "es2017" | "es2019" | "es2020" | "esnext";
       diagnostics?: {
         treatWarningsAsErrors?: boolean;
         suppress?: string[];
       };
       mode?: "relaxed" | "balanced" | "strict";
       transforms?: {
         html?: (html: string, context: { file: string }) => string;
       };
     }

     export interface HtmlProjectOptions {
       naming?: {
         pattern?: "PascalToSame" | "PascalToKebab" | "fileStem";
       };
       placeholders?: {
         strategy?: "idSuffix" | "dataAttribute";
         suffix?: string;
         attribute?: string;
       };
       injection?: {
         mode: "runtime" | "static";
         template?: string;
         outFile?: string;
       };
       runtime?: {
         emit?: boolean;
         path?: string;
       };
       smartMounts?: {
         enforce?: "warn" | "error" | "off";
         suggestInTemplate?: boolean;
       };
       onMissingPartial?: "error" | "warn" | "silentPlaceholder";
       missingPartialPlaceholder?: string;
     }

     export interface ReactProjectOptions {
       jsxRuntime?: "automatic" | "classic";
       defaultOutput?: "tsx" | "jsx";
       typeChecking?: "strict" | "loose" | "off";
     }

     export interface CollieFeatureOptions {
       presets?: string[];
     }

     export interface CollieEditorOptions {
       defaultIndentSize?: 2 | 4;
       showExperimentalFeaturesInCompletions?: boolean;
       snippets?: {
         enableBuiltins?: boolean;
         groups?: string[];
       };
       diagnostics?: {
         underlineCollieGeneratedRegions?: "off" | "light" | "bold";
       };
     }
     ```

   * **Note:** At this stage, it is OK if some fields are not yet used anywhere; they will be useful for future features and for the example configs.

3. **Add `defineConfig` helper**

   * In `packages/config/src/index.ts`:

     ```ts
     import type { CollieConfig } from "./types";

     export * from "./types";

     export function defineConfig(config: CollieConfig): CollieConfig {
       return config;
     }
     ```

   * This allows users to write:

     ```ts
     import { defineConfig } from "@collie-lang/config";

     export default defineConfig({
       projects: [
         // ...
       ],
     });
     ```

4. **Wire up build & exports**

   * Ensure the config package builds successfully with the existing monorepo build pipeline.
   * Add `@collie-lang/config` to any workspace root config as needed (e.g., root `tsconfig.json`, root build scripts).
   * Verify that importing `@collie-lang/config` from another package (e.g., `@collie-lang/compiler`) works after building.

### Implementation Summary (Stage 1)

*Add after completion of Stage 1.*

---

## Stage 2 – Implement Basic Config Loading (JS/JSON, No TS Yet)

### Status: Not Started

**Goal:** Implement a `loadConfig` function in `@collie-lang/config` that can load **JavaScript and JSON** configs from disk:

* `collie.config.js`
* `collie.config.mjs`
* `collie.config.cjs`
* `collie.config.json`

TS support (`collie.config.ts`) will be added in **Stage 3**.

### Tasks

1. **Define the `loadConfig` API**

   * In `packages/config/src/index.ts`, export:

     ```ts
     export interface LoadConfigOptions {
       cwd?: string;         // defaults to process.cwd()
       explicitPath?: string; // optional explicit path to a config file
     }

     export async function loadConfig(
       options: LoadConfigOptions = {}
     ): Promise<CollieConfig | null> {
       // Implementation in this stage (JS/JSON only)
     }
     ```

2. **Implement file resolution order**

   * Implement a helper (internal to the package) that:

     * Resolves the working directory: `const cwd = options.cwd ?? process.cwd()`.
     * If `explicitPath` is provided:

       * Resolve it to an absolute path.
       * Use exactly that file; do **not** search others.
     * If `explicitPath` is **not** provided:

       * Check for existence (in this order) under `cwd`:

         1. `collie.config.js`
         2. `collie.config.mjs`
         3. `collie.config.cjs`
         4. `collie.config.json`
       * Use the first file that exists.
   * If no file exists, return `null`.

3. **Load JS config files (CJS/ESM)**

   * For `.js`, `.mjs`, `.cjs`:

     * Use dynamic import or `require` as appropriate, following the existing repo’s Node/ESM strategy.

       * If the rest of the repo uses ESM: prefer `import()` and handle default exports.
       * If the repo uses CJS: you may need to use `require` for `.cjs` and `import()` for `.mjs`.
     * Normalize the export:

       * If the module has a `default` export, treat that as the config object.
       * Otherwise, if it exports an object directly, use that.
   * Ensure that the final value is of type `CollieConfig`.

4. **Load JSON config files**

   * For `.json`:

     * Read the file via `fs.promises.readFile`.
     * Parse as JSON.
     * Treat the result as `CollieConfig`.

5. **Basic validation & normalization**

   * Implement a simple runtime validation step **without introducing heavy dependencies** (no need for `zod` unless the repo already uses it).
   * At this stage, it’s enough to:

     * Ensure that `config.projects` exists and is an **array**.
     * Ensure each project has:

       * `type` (string)
       * `input` (string or array of strings)
     * For other fields:

       * Leave them as-is (best effort).
     * If the shape is obviously wrong (e.g. `projects` is not an array):

       * Throw a descriptive error.

6. **Do NOT implement TS support yet**

   * If `explicitPath` or file detection yields `collie.config.ts` in this stage:

     * Throw an error explicitly stating:

       * TS support is not implemented yet and will be added in a later stage.
       * For now, rename to `collie.config.js` or use JSON.

### Implementation Summary (Stage 2)

*Add after completion of Stage 2.*

---

## Stage 3 – Add TS Config Support (`collie.config.ts`)

### Status: Not Started

**Goal:** Extend `loadConfig` so it can also load `collie.config.ts` files from the project root, in addition to JS/JSON files.

Exactly how you implement TS loading may depend on the tooling already present in the repo. The objective is to allow:

```ts
// collie.config.ts
import { defineConfig } from "@collie-lang/config";

export default defineConfig({
  projects: [
    // ...
  ],
});
```

### Tasks

1. **Extend file resolution order**

   * Modify the resolution logic from Stage 2 to check files in **this order**:

     1. `collie.config.ts`
     2. `collie.config.js`
     3. `collie.config.mjs`
     4. `collie.config.cjs`
     5. `collie.config.json`

   * If `explicitPath` is provided, respect it even if it ends with `.ts`.

2. **Choose or reuse a TS loader strategy**

   * Check if the repo already uses a solution for executing TS config or scripts (e.g., `ts-node`, `tsx`, custom `esbuild` wrapper).
   * If there is an existing pattern:

     * **Reuse it** for `collie.config.ts`.
   * If there is no existing pattern:

     * Introduce a lightweight, well-supported solution (e.g., `tsx`) **only in the `@collie-lang/config` package**.
     * Add it as a dependency or devDependency, consistent with repo conventions.

3. **Implement TS config loading**

   * For `collie.config.ts`:

     * Use the chosen TS loader to execute the file in Node.
     * Normalize the export:

       * Prefer `default` export (`export default defineConfig({...})`).
       * Optionally fall back to named exports if necessary (`export const config = defineConfig({...})`), but documenting `default` is sufficient.
   * Ensure the loaded config is validated using the same basic checks as in Stage 2.

4. **Error handling**

   * If TS compilation or execution fails:

     * Throw a descriptive error.
     * Include:

       * The path to the config file.
       * A brief summary of the error (e.g., syntax error, module not found).
   * Make sure this error is clear enough for users to diagnose config issues quickly.

5. **Update any internal docs/comments**

   * Update docstrings or internal comments in `@collie-lang/config` to:

     * Confirm support for `collie.config.ts`, `collie.config.js`, and `collie.config.json`.
     * Explicitly mention that `.collierc*` files are **not** supported.

### Implementation Summary (Stage 3)

*Add after completion of Stage 3.*

---

## Stage 4 – Config Normalization & Helper Utilities

### Status: Not Started

**Goal:** Take loaded config and normalize it into a predictable internal representation that other Collie packages (e.g. compiler, future CLI, bundler adapters) can rely on.

### Tasks

1. **Introduce a normalized config type**

   * In `packages/config/src/types.ts`, add:

     ```ts
     export interface NormalizedCollieConfig extends CollieConfig {
       projects: NormalizedCollieProjectConfig[];
     }

     export interface NormalizedCollieProjectConfig extends CollieProjectConfig {
       name: string;
       root: string;
       input: string[]; // always array
       output: {
         dir?: string;
         format?: "jsx" | "tsx";
       };
       html?: HtmlProjectOptions;
       react?: ReactProjectOptions;
     }
     ```

   * The key idea: provide **guarantees** (e.g. `input` is always an array; `name` and `root` have defaults).

2. **Add `normalizeConfig` helper**

   * In `packages/config/src/normalize.ts` (or similar), create:

     ```ts
     import type {
       CollieConfig,
       NormalizedCollieConfig,
       NormalizedCollieProjectConfig,
     } from "./types";

     export function normalizeConfig(
       config: CollieConfig,
       options: { cwd?: string } = {}
     ): NormalizedCollieConfig {
       // Implement normalization here
     }
     ```

   * Behavior:

     * For each project:

       * Ensure `name`:

         * If missing, derive from `type` + index (e.g. `"html-0"`, `"react-vite-0"`).
       * Ensure `root`:

         * Default to `options.cwd ?? process.cwd()`.
         * Resolve to an absolute path if needed.
       * Normalize `input`:

         * If `string`, wrap into `[string]`.
       * Ensure `output` exists (at least as `{}`).
     * Preserve optional sections (`compiler`, `features`, `editor`) as-is.

3. **Expose normalization from main index**

   * In `packages/config/src/index.ts`, export:

     ```ts
     export * from "./normalize";
     ```

   * So consumers can:

     ```ts
     const config = await loadConfig();
     if (config) {
       const normalized = normalizeConfig(config);
       // ...
     }
     ```

4. **Integrate `normalizeConfig` into `loadConfig` (optional but recommended)**

   * Consider adding an optional function:

     ```ts
     export async function loadAndNormalizeConfig(
       options: LoadConfigOptions = {}
     ): Promise<NormalizedCollieConfig | null> {
       const config = await loadConfig(options);
       if (!config) return null;
       return normalizeConfig(config, { cwd: options.cwd });
     }
     ```

   * This is optional but convenient for future CLI/bundler integration.

### Implementation Summary (Stage 4)

*Add after completion of Stage 4.*

---

## Stage 5 – Re-export Config Utilities from `@collie-lang/compiler` (Optional Integration)

### Status: Not Started

**Goal:** Make the config utilities accessible from `@collie-lang/compiler` as a convenience, without deeply coupling the two packages.

> If the project prefers to keep `@collie-lang/compiler` strictly focused on compilation and leave config handling entirely to `@collie-lang/config`, you may **skip this stage**. If you skip it, clearly note that in the Implementation Summary.

### Tasks

1. **Check compiler’s public API**

   * Inspect `@collie-lang/compiler` exports to see what is considered public.
   * Decide if it’s acceptable for `@collie-lang/compiler` to re-export config utilities.

2. **Optional re-exports**

   * If allowed, add re-exports in `@collie-lang/compiler`:

     ```ts
     // packages/compiler/src/index.ts (or equivalent)
     export {
       type CollieConfig,
       type CollieProjectConfig,
       type NormalizedCollieConfig,
       type NormalizedCollieProjectConfig,
       defineConfig,
       loadConfig,
       loadAndNormalizeConfig,
     } from "@collie-lang/config";
     ```

3. **Document the integration**

   * Add brief inline comments clarifying that:

     * Config loading is implemented in `@collie-lang/config`.
     * `@collie-lang/compiler` re-exports these for convenience.
   * Do **not** add external documentation here; this will go into docs later.

### Implementation Summary (Stage 5)

*Add after completion of Stage 5, including whether you chose to re-export or not.*

---

## Stage 6 – Populate Example Config Files

### Status: Not Started

**Goal:** Fill in the example config files in `docs/examples/config` with **complete, comprehensive, valid** config structures that demonstrate **all available fields/options**, generously filled in.

Target files (already created but currently blank):

* `docs/examples/config/collie.config.example.js`
* `docs/examples/config/collie.config.example.ts`
* `docs/examples/config/collie.config.example.json`

### General Requirements

* Each example must:

  * Be **syntactically valid**.
  * Represent a realistic config for a repo that has:

    * One HTML project (e.g., marketing site using HTML partials).
    * One React+Vite project (e.g., app).
  * Include **all currently supported fields** from:

    * `CollieConfig`
    * `CollieProjectConfig`
    * `CollieCompilerOptions`
    * `CollieFeatureOptions`
    * `CollieEditorOptions`
    * `HtmlProjectOptions`
    * `ReactProjectOptions`
  * Use descriptive placeholder values where real file paths might vary.
  * Prefer **filling in fields** with non-default values rather than omitting them.

* It is acceptable to:

  * Use placeholder strings like `"TODO: adjust path"` or `"./src/collie/**/*.collie"`.
  * Use comments in JS/TS examples to explain the intent of rare options.

### 6.1. `collie.config.example.ts`

1. Implement as a **TS config using `defineConfig`**:

   ```ts
   import { defineConfig } from "@collie-lang/config";

   export default defineConfig({
     compiler: {
       strictIndentation: true,
       prettyPrintHtml: true,
       minifyHtml: false,
       targetJsVersion: "es2019",
       mode: "balanced",
       diagnostics: {
         treatWarningsAsErrors: false,
         suppress: ["unused-class"],
       },
       transforms: {
         html(html, { file }) {
           return `<!-- Collie: ${file} -->\n` + html;
         },
       },
     },
     features: {
       presets: ["landing-page", "docs-site"],
     },
     editor: {
       defaultIndentSize: 2,
       showExperimentalFeaturesInCompletions: false,
       snippets: {
         enableBuiltins: true,
         groups: ["html-partials", "react-components"],
       },
       diagnostics: {
         underlineCollieGeneratedRegions: "light",
       },
     },
     projects: [
       {
         name: "marketing-site",
         type: "html",
         tags: ["public", "landing"],
         root: ".",
         input: "src/collie/**/*.collie",
         output: {
           dir: "public/generated",
           format: "tsx", // may be ignored for HTML, but included for completeness
         },
         html: {
           naming: {
             pattern: "PascalToSame",
           },
           placeholders: {
             strategy: "idSuffix",
             suffix: "-collie",
             attribute: "data-collie-partial",
           },
           injection: {
             mode: "runtime",
             template: "public/index.template.html",
             outFile: "public/index.html",
           },
           runtime: {
             emit: true,
             path: "public/collie-runtime.js",
           },
           smartMounts: {
             enforce: "warn",
             suggestInTemplate: true,
           },
           onMissingPartial: "warn",
           missingPartialPlaceholder:
             "<!-- Missing Collie partial: {name} -->",
         },
       },
       {
         name: "app",
         type: "react-vite",
         tags: ["internal", "app"],
         root: ".",
         input: "src/**/*.collie",
         output: {
           dir: "src/generated", // optional for React
           format: "tsx",
         },
         react: {
           jsxRuntime: "automatic",
           defaultOutput: "tsx",
           typeChecking: "strict",
         },
       },
     ],
   });
   ```

2. Adjust the example to precisely match the types and fields as implemented in earlier stages.

### 6.2. `collie.config.example.js`

1. Implement as **CommonJS or ESM**, matching the repository’s default style.

2. It should contain the **same structure** as the TS example, but without type annotations:

   * If using ESM:

     ```js
     import { defineConfig } from "@collie-lang/config";

     export default defineConfig({
       // same content as TS example, minus types
     });
     ```

   * If using CJS:

     ```js
     const { defineConfig } = require("@collie-lang/config");

     module.exports = defineConfig({
       // same content as TS example, minus types
     });
     ```

3. Keep field names and values aligned with the TS example as closely as possible.

### 6.3. `collie.config.example.json`

1. Implement a **JSON version** of the config with:

   * No functions (e.g. omit `transforms.html`).
   * All fields that can be represented as JSON literals.

2. Use the same values where possible:

   ```json
   {
     "compiler": {
       "strictIndentation": true,
       "prettyPrintHtml": true,
       "minifyHtml": false,
       "targetJsVersion": "es2019",
       "mode": "balanced",
       "diagnostics": {
         "treatWarningsAsErrors": false,
         "suppress": ["unused-class"]
       }
     },
     "features": {
       "presets": ["landing-page", "docs-site"]
     },
     "editor": {
       "defaultIndentSize": 2,
       "showExperimentalFeaturesInCompletions": false,
       "snippets": {
         "enableBuiltins": true,
         "groups": ["html-partials", "react-components"]
       },
       "diagnostics": {
         "underlineCollieGeneratedRegions": "light"
       }
     },
     "projects": [
       {
         "name": "marketing-site",
         "type": "html",
         "tags": ["public", "landing"],
         "root": ".",
         "input": "src/collie/**/*.collie",
         "output": {
           "dir": "public/generated",
           "format": "tsx"
         },
         "html": {
           "naming": {
             "pattern": "PascalToSame"
           },
           "placeholders": {
             "strategy": "idSuffix",
             "suffix": "-collie",
             "attribute": "data-collie-partial"
           },
           "injection": {
             "mode": "runtime",
             "template": "public/index.template.html",
             "outFile": "public/index.html"
           },
           "runtime": {
             "emit": true,
             "path": "public/collie-runtime.js"
           },
           "smartMounts": {
             "enforce": "warn",
             "suggestInTemplate": true
           },
           "onMissingPartial": "warn",
           "missingPartialPlaceholder": "<!-- Missing Collie partial: {name} -->"
         }
       },
       {
         "name": "app",
         "type": "react-vite",
         "tags": ["internal", "app"],
         "root": ".",
         "input": "src/**/*.collie",
         "output": {
           "dir": "src/generated",
           "format": "tsx"
         },
         "react": {
           "jsxRuntime": "automatic",
           "defaultOutput": "tsx",
           "typeChecking": "strict"
         }
       }
     ]
   }
   ```

3. Make sure this JSON is valid and matches the **current** implemented schema (adjust fields if the actual types differ).

### Implementation Summary (Stage 6)

*Add after completion of Stage 6, confirming that:*

* All three example files are populated.
* They are consistent with the current config types.
* Any deviations from the examples in this plan are intentional and documented.
