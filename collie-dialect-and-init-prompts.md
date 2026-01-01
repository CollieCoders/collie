## Context & End Goal

We want Collie to support **project-level dialect + lint-style enforcement** in a way that’s professional, predictable, and editor-friendly:

* **Dialect enforcement** for directive tokens (`@if/#if`, `@else/@elseIf`, `@for`, header directives like `id` variants).
* **Props rules** (declared props become locals, missing/unused props diagnostics, style preference).
* **CSS strategy** seeded by `collie init` (especially Tailwind detection) so the VS Code extension can avoid expensive/noisy diagnostics.
* **Compiler diagnostics must be structured** (code, message, range, severity) and ideally include quick-fix metadata (replacement text) so the extension can provide code actions without re-implementing logic.

Design principle: **Parse broadly, enforce narrowly.** The parser should recognize all supported spellings; dialect config should only change diagnostics and optional normalization suggestions.

---

### Stage 1 — Config schema, normalization, and stable internal shape

**Work to do**

1. Define/extend the Collie config schema to include:

   * `css.strategy`: `"tailwind" | "global" | "unknown"` (start with these; keep it small)
   * `css.diagnostics.unknownClass`: `"off" | "info" | "warn" | "error"` (default depends on strategy)
   * `dialect.tokens`: map of token kinds to rules:

     * token kinds: `if`, `else`, `elseIf`, `for`, `id`
     * each rule: `preferred`, `allow[]`, `onDisallowed`
   * `dialect.normalizeOnFormat`: boolean (default true)
   * `dialect.normalizeOnBuild`: boolean (default false)
   * `dialect.props`: rules for intra-file props diagnostics:

     * `allowPropsNamespace` (default true)
     * `allowDeclaredLocals` (default true)
     * `requireDeclarationForLocals` (default true if allowDeclaredLocals)
     * `requirePropsBlockWhen.enabled/minUniquePropsUsed/severity` (default enabled=false)
     * `preferAccessStyle`: `"locals" | "namespace" | "either"` (default `"either"` or `"locals"`—pick one and document)
     * `diagnostics`: missing/unused/style codes severity controls
2. Implement a config normalization function that:

   * Applies defaults
   * Validates enums
   * Normalizes token rules:

     * Ensures `preferred` is in `allow` (or adds it automatically)
     * De-duplicates and sorts allow lists
     * Ensures `onDisallowed` is set (default `"error"` for directive tokens; `id` can default `"warn"`)
3. Ensure the compiler can resolve config per file (whatever your existing model is) and returns the normalized config.

**Acceptance criteria**

* There is a single canonical internal config object used by the compiler pipeline.
* Invalid config values produce a clear diagnostic/error at config load time (not a crash later).

#### Complete: 100%

### Notes

* If config is JS (`collie.config.js`), ensure schema validation works without forcing ESM/CJS changes.
* If Collie already has a `defineConfig`, update types accordingly.

---

### Stage 2 — `collie init` CSS strategy detection + config seeding

**Work to do**

1. Enhance `collie init` to detect Tailwind using cheap signals (no heavy scanning):

   * `tailwind.config.{js,cjs,mjs,ts}` exists in project root (or workspace root)
   * `package.json` deps/devDeps include `tailwindcss`
   * `postcss.config.*` contains `tailwindcss`
   * Optional: a small scan of top-level CSS files for `@tailwind base/components/utilities`
2. Based on detection:

   * If Tailwind detected: set `css.strategy = "tailwind"` and set `css.diagnostics.unknownClass = "off"` by default.
   * If not detected: set `css.strategy = "global"` and set `css.diagnostics.unknownClass = "warn"` by default.
   * If detection is uncertain or project structure is weird: `css.strategy = "unknown"` and `unknownClass = "off"`.
3. Make the init output explicitly state what was detected and where to override it.
4. Ensure the generated config file includes the new fields in a clean, non-overwhelming form (don’t dump every possible option).

**Acceptance criteria**

* Running `collie init` on a Tailwind repo yields a config that disables unknown-class diagnostics by default.
* Running `collie init` on a non-Tailwind repo yields a config that enables unknown-class diagnostics (warn) by default.
* Users can edit the values and the compiler uses them.

#### Complete: 100%

### Notes

* Detection must be fast; avoid scanning thousands of files.
* In monorepos, choose a sensible root: directory where `collie init` is executed.

---

### Stage 3 — Dialect enforcement for directive tokens (parse-first, enforce-second)

#### Complete: 90%

**Work to do**

1. Update the parser/AST to record the *spelling used* for each directive token occurrence:

   * `if`, `else`, `elseIf`, `for`
   * header directive `id` (record which variant was used: `id`, `id=`, `id:`, `#id`, etc.)
2. Add a post-parse “dialect enforcement pass” that:

   * Checks each occurrence:

     * If used spelling not in `allow`: emit diagnostic `dialect.token.disallowed`

       * severity uses the config’s `onDisallowed`
       * message should mention preferred spelling and show what was used
       * include a suggested fix replacement of the token spelling to `preferred` (or the closest allowed)
     * If used spelling is allowed but not preferred: emit diagnostic `dialect.token.nonPreferred`

       * severity should be configurable (either reuse `onDisallowed` or add `onNonPreferred`; if adding, update Stage 1 schema)
       * include suggested replacement to preferred
3. Ensure diagnostics include:

   * stable diagnostic `code`
   * file path
   * range (start/end)
   * severity
   * message
   * optional `fix` metadata (replacement text + range)

**Acceptance criteria**

* Compiler emits correct diagnostics for token spellings based on config.
* Preferred token quick-fix metadata exists for the extension to use.

### Notes

* Keep supported spellings bounded to what Collie already accepts (do not invent arbitrary new tokens).
* Make sure missing/invalid config doesn’t break parsing; enforcement should gracefully no-op.
* Dialect enforcement currently runs only when a normalized `dialect` config is passed into `parseCollie`/`compileTo*`. CLI wiring to load config is still needed.
* `info` severity maps to `warning` in compiler diagnostics until the severity enum is expanded.

---

### Stage 4 — Props intra-file analysis + diagnostics (no TypeScript cross-file yet)

#### Complete: 85%

**Work to do**

1. Parse the `props` block into a symbol table:

   * capture prop names
   * optionally capture the type annotation if present (string form is fine; no need to type-check)
2. Track prop usage in template/expressions:

   * usage via `props.foo` (namespace access)
   * usage via bare identifier `foo` / `foo.bar` (local access)
3. Apply configured rules from `dialect.props`:

   * If `requireDeclarationForLocals` and a bare prop-like identifier is used but not declared in `props` block: diagnostic `props.missingDeclaration`
   * If a prop is declared in `props` block but never used: diagnostic `props.unusedDeclaration`
   * If `preferAccessStyle` is `"locals"` and code uses `props.foo`: diagnostic `props.style.nonPreferred` (and vice versa)
   * If `requirePropsBlockWhen.enabled` and number of unique props used (locals or namespace) meets threshold but there’s no `props` block: diagnostic `props.block.recommendedOrRequired`
4. Include fix metadata where reasonable:

   * missing declaration: suggest “add to props block” (the extension can implement this as a code action; compiler can include minimal metadata: prop name + insertion hint)
   * unused declaration: suggest removal range if you can compute it reliably
   * style preference: replacement of `props.foo` ↔ `foo` is not always safe; only offer fix if you can guarantee correctness (otherwise omit fix)

**Acceptance criteria**

* Props diagnostics work purely within one `.collie` file and are stable.
* No heavy TS program / cross-file analysis in this stage.

### Notes

* Be conservative about auto-fixes that could change semantics.
* If Collie already has some prop diagnostics, extend/refactor to fit these codes and config-driven severities.
* Prop usage spans are best-effort (no attribute value spans; template-literal expressions are not parsed).
* Unused prop diagnostics do not include removal fixes yet.
* Props diagnostics run only when a normalized `dialect` config is passed into `parseCollie`/`compileTo*`.

---

### Stage 5 — Structured diagnostics output contract (compiler-side)

#### Complete: 100%

**Work to do**

1. Standardize the compiler diagnostic shape so it can be consumed by the VS Code extension without guesswork:

   * `code`, `message`, `severity`, `range`, `filePath`
   * optional `fix` object: `{ range, replacementText }`
   * optional `data` object for non-text fixes (e.g., `{ kind: "addPropDeclaration", propName: "selectedUser" }`)
2. Ensure all dialect + props diagnostics use this shape consistently.
3. If there’s an existing JSON output mode or language server protocol adapter, update it to include the new fields.

**Acceptance criteria**

* The extension can implement code actions purely from diagnostic payloads (when fix/data is provided).
* Diagnostics remain stable across versions (codes don’t churn).

### Notes

* If you already have an LSP server, align the output with LSP conventions (but keep internal shape stable).

---

### Stage 6 — (Optional now, enables later) “Resolved config export” for tooling

#### Complete: 0%

**Work to do**

1. Add a CLI subcommand or internal API that returns the normalized config for a given file (or project root):

   * Example: `collie config --print --file path/to/file.collie`
2. This is used by the VS Code extension to avoid running arbitrary JS config parsing logic in-process.
3. Make output available in `json` mode.

**Acceptance criteria**

* Extension can query resolved config cheaply (optional integration stage on extension side).
* If omitted, extension can still read config directly (but this stage improves “enterprise feel”).

### Notes

* Keep this optional if it’s too much for now; it’s a strong DX lever later.
