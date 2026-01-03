# Collie Refactor Plan — Registry + `<Collie id>` Runtime (Vite-first, props from day 1)

## IMPORTANT

**Repo Rules**:
Do NOT preserve legacy `.collie` import-as-component semantics, and do NOT introduce compatibility shims unless explicitly asked.

## Context & Problem

Collie is changing from:

* **Old model:** Each `.collie` file compiles into an importable React component (component name derived from React component / filename). This causes **naming conflicts**, awkward `-1` behavior, and forces 1 template per file.

to:

* **New model (MVP):** `.collie` files contain **one or more templates**, each starting with a required `#id <templateId>` marker. Vite builds a **build-time registry** (IDs → compiled template modules). React uses a single runtime component:

```tsx
import { Collie } from '@collie-lang/react'

<Collie id="Blog.navbar" title="Hello" user={user} />
```

**Props are non-negotiable from day 1.** Templates must accept props and use them in expressions/interpolations.

We’ll focus only on the **collie repo** (compiler, vite plugin, CLI/docs), and only Vite integration for now.

---

## Architectural Contract to Lock In

### Template file format

* A `.collie` file is a container of **one or more** template blocks.
* Each template block begins with a line:

```
#id <id>
```

* The template body is everything after that line until the next `#id` or EOF.
* `#id` is **mandatory**:

  * Any non-whitespace content before the first `#id` is an error.
  * A `.collie` file with no `#id` blocks is an error.

### ID rules

* IDs are **global** across project: no duplicates anywhere.
* IDs are **case-sensitive**.
* Recommended grammar (practical, CSS-ish):

  * `^[A-Za-z][A-Za-z0-9._-]*$`
* PascalCase is **not required** (remove any PascalCase enforcement/diagnostics).

### Vite plugin (`@collie-lang/vite`)

* Tooling only.

* Discovers `.collie` files via glob.

* Parses all template blocks.

* Compiles each template to a module exporting `render(props)`.

* Emits a virtual module:

  * `virtual:collie/registry` exporting `registry: Record<string, () => Promise<{ render: (props:any)=>any }>>`

* Enforces global uniqueness (hard error listing duplicates + locations).

* HMR: invalidate registry + affected templates; full reload is acceptable early as long as no infinite loop.

### React runtime (`@collie-lang/react`)

* Runtime-only package (React side).
* Exports `<Collie id="...">` component.
* Looks up registry by id and renders `render(props)` result.
* Must support props from day 1.

### CLI/docs

* Must stop describing `.collie` as “importable React components.”
* Must teach `<Collie id>` and multi-template files.

---

# Stage A0 — Freeze the Contract in Repo Docs

**Complete: 0%**

### Why this stage exists

Codex (and future you) will otherwise “half-preserve” old architecture and create Frankenstein integration. This stage is the single source of truth that prevents drift.

### Scope

Docs + high-level API decisions only. No code refactor yet.

### Deliverables

1. **`ARCHITECTURE.md`** at repo root describing:

   * Multi-template `.collie` format (`#id` blocks)
   * Mandatory `#id` rule (no implicit template)
   * Global unique IDs
   * Vite plugin registry and `virtual:collie/registry`
   * React runtime package `@collie-lang/react` exporting `Collie`
   * Props must be supported from day 1
   * A minimal example:

     * `.collie` file with two `#id` blocks
     * React usage with `<Collie id="...">` and props

2. Identify and **mark as deprecated in docs** the old workflow:

   * importing `.collie` as a React component
   * component-name-based template addressing

### Expected Outcome

Anyone reading the repo can correctly explain “how Collie works” in 60 seconds, and Codex has an unambiguous target contract to implement.

### Acceptance Criteria

* `ARCHITECTURE.md` exists and is coherent and specific.
* Any “getting started” docs/examples that currently demonstrate importing `.collie` components are flagged for update in later stages (or updated now if tiny).

---

# Stage A1 — Compiler Parser: Multi-template Units + Mandatory IDs + New ID Validation

**Complete: 0%**

### Why this stage exists

Everything else depends on the compiler being able to parse **multiple** templates per file and enforce mandatory IDs without PascalCase limitations.

### Scope

Update parsing + AST packaging so compilation can operate on template units.

### Deliverables

1. **New parse output shape** that supports multiple templates, e.g.:

   * `ParseResult { templates: TemplateUnit[], diagnostics: Diagnostic[] }`
   * `TemplateUnit { id, rawId, span, ast, diagnostics }`

2. **Parser rules implemented**

   * File is split into blocks by `#id <id>` markers.
   * Any non-whitespace before first `#id` → error diagnostic.
   * Missing id value after `#id` → error.
   * Invalid id format (regex above) → error.
   * Duplicate `#id` within the same file → error.

3. **Remove PascalCase enforcement**

   * Delete/disable “ID must be PascalCase” validation and diagnostics.

4. **Diagnostics improvements**

   * Diagnostics should include filename and line/col.
   * When relevant, include template id in messages (e.g. `In template "Blog.navbar": ...`).

### Expected Outcome

Given a `.collie` file containing N templates, parser returns N `TemplateUnit`s with independent ASTs and diagnostics.

### Acceptance Criteria

* Parsing a file with two `#id` blocks yields two template units.
* Parsing a file with content before first `#id` yields an error.
* Parsing invalid IDs yields errors.
* Duplicate `#id` in one file yields an error.
* Repo still builds (or at least TypeScript compiles) after changes.

---

# Stage A2 — Compiler Compilation API: Compile Template Units to Module With `render(props)`

**Complete: 0%**

### Why this stage exists

The runtime and registry need a stable compiled shape. We can’t keep “file → named React component” as the primary product.

### Scope

Create/reshape compilation entry points to compile one template unit into a module exporting `render(props)`.

### Deliverables

1. **New compilation entry point(s)** (names flexible; outcome is not):

   * `compileTemplate(unit, options) -> { code, map?, diagnostics, meta }`
   * Must produce code that exports:

     * `export function render(props: any) { ... }`
     * return value should be React-compatible (ReactNode).

2. **Preserve old APIs only as wrappers**

   * If existing packages call `compileToTsx(...)` etc:

     * keep them temporarily but implement them via:

       * parse → take first template unit → compileTemplate
     * mark them deprecated internally (comments) so you don’t regress.

3. **Meta/data**

   * Each compiled output must carry meta including:

     * `id`, `rawId`, `filename`, maybe `span`.

### Expected Outcome

Compiler can compile a single template unit into a module that the Vite plugin can `import()` and call `render(props)`.

### Acceptance Criteria

* There exists a compiler function that takes a template unit and returns a JS/TS module string exporting `render(props)`.
* The module compiles in TS (or is valid JS if you emit JS).
* Existing build pipelines that depend on compiler don’t break unexpectedly (or are updated as part of this stage).

---

# Stage A3 — Props Plumbing: Ensure Template Expressions Resolve From `props`

# Stage A3a — Props Plumbing Prep: Identify Expression Resolution + Define Prop Binding Contract

**Complete: 0%**

### Why this stage exists

Before changing codegen semantics, we need to **pin down exactly how expressions and variables are resolved today** (where “locals” come from, how interpolation nodes are emitted, etc.). This prevents an expensive model from wasting tokens searching or guessing, and it prevents partially correct “props support” that breaks edge cases.

This stage is intentionally **investigative + small-scope**.

### Scope

* Read and pinpoint the **single canonical place(s)** in the compiler where:

  * expressions are parsed
  * interpolation nodes are represented in AST
  * expression identifiers are resolved to runtime values
  * template rendering code is emitted
* Decide the exact **prop binding rule** we will implement (and document it succinctly).

### Deliverables

1. **Map the current flow**

   * Document (briefly, in comments or a short note in `ARCHITECTURE.md`) the key functions/files involved in:

     * parsing expressions/interpolations
     * resolving identifiers
     * generating code for dynamic values

2. **Define the prop binding contract (MVP)**
   Choose one contract and commit to it:

   **Contract (recommended):**

   * The compiled template exports `render(props: any)`.
   * Template expressions resolve identifiers against:

     1. **`props`** (primary)
     2. optionally a small built-in set (if you already support helpers like `classNames`, etc.)
   * For MVP, keep it simple:

     * Identifiers like `title` become `props.title` in generated code.
     * If you already have destructuring/lambda patterns, you may destructure once at top:

       * `const p = props ?? {};`
       * or `const { title, user } = props ?? {};`
     * But do **not** introduce a large scope system.

   **Behavior for missing props:**

   * Access should not throw.
   * Use `props?.title` / `(props ?? {}).title` or equivalent.

3. **Confirm how props should be surfaced to templates**

   * If Collie supports JS expressions already, confirm whether “bare identifiers” should map to `props.<id>` (recommended).
   * If Collie supports something like `$props.title` today (or similar), decide whether to keep it. (My recommendation: bare identifiers → props, and no required prefix.)

4. **Add a short “Props in templates” note to `ARCHITECTURE.md`**

   * 5–10 lines max:

     * how to pass props from React
     * how identifiers resolve
     * missing prop behavior

### Expected Outcome

You have a **clear, written** binding contract and a **known set of code locations** to change in A3b/A3c. No guessing.

### Acceptance Criteria

* You can point to the exact file(s)/function(s) that:

  * generate code for interpolations/expressions
  * decide how identifiers are emitted
* `ARCHITECTURE.md` includes the short props binding rule.
* No behavior changes yet (this stage can be done with minimal or zero code changes besides docs/comments).

---

# Stage A3b — Props Plumbing Core: Implement `props`-backed Identifier Resolution in Codegen

**Complete: 0%**

### Why this stage exists

This is the actual semantic change: templates must use runtime-provided props, reliably, across all expression/interpolation contexts.

### Scope

* Implement the contract defined in A3a by updating compiler codegen so that:

  * the compiled template’s `render(props)` uses `props` as the source of identifiers
  * every interpolation/expression path that emits identifiers follows the same rule
* Keep the implementation **minimal and consistent**.

### Deliverables

1. **Single source of truth for identifier emission**

   * Introduce or update a helper that emits identifier references, so you don’t have five slightly different implementations.
   * Example concept (names don’t matter):

     * `emitIdentifier(name) -> "props?.<name>"` (or equivalent)
   * Ensure it is used everywhere identifiers are emitted in expression contexts.

2. **Update expression/interpolation emission**

   * For any AST node representing:

     * interpolation (`{ expr }` style)
     * attribute bindings
     * conditional expressions
     * loops / iterators (if present)
   * Ensure identifiers in those expressions resolve to `props` per the contract.

3. **Non-throwing access**

   * Ensure missing props don’t throw:

     * use `props && props.x` or optional-chaining where you can.
   * Don’t overcomplicate; the goal is not perfect type safety yet, just correct runtime behavior.

4. **Preserve existing semantics where props aren’t relevant**

   * Static text remains static
   * Existing built-in directives/helpers remain unchanged unless they conflict with identifier resolution.
   * Don’t accidentally rename/repurpose existing runtime variables without intent.

### Expected Outcome

Templates can access runtime-provided values naturally and consistently via bare identifiers (or whatever contract you set), and generated code is consistent across contexts.

### Acceptance Criteria

* A template referencing `title` (in the Collie expression syntax you support) results in generated code that reads from `props.title` (or your chosen equivalent).
* No runtime exception occurs when `props` is `undefined` or missing the field.
* The change applies consistently across:

  * interpolation in text content
  * attribute values
  * any conditional/loop contexts that support expressions
* Build succeeds.

---

# Stage A3c — Props Plumbing Hardening: Sweep for Edge Cases + Normalize Output

**Complete: 0%**

### Why this stage exists

After the core change, there will be 1–3 “forgotten” emission paths (attributes, special directives, rare node types). This stage is a mechanical sweep to prevent “props mostly works” vibes.

### Scope

* Repo-wide search for remaining identifier emission / expression handling
* Normalize to the helper(s) introduced in A3b
* Add minimal manual verification via fixtures/examples (not tests)

### Deliverables

1. **Sweep and unify**

   * Search for code paths that still emit raw identifiers without props mapping.
   * Migrate them to the A3b helper.
   * Ensure there’s exactly one consistent mapping rule.

2. **Update at least one example/fixture**

   * Add or update a small example `.collie` file in an examples folder (or existing fixture) that demonstrates:

     * interpolation from props
     * attribute binding from props
     * conditional usage (if supported)
   * You are **not writing tests**, just ensuring there’s something concrete to run/inspect.

3. **Improve error messages if needed**

   * If expression parsing fails, ensure diagnostics are not misleading (especially if you changed scope rules).

### Expected Outcome

Props support feels “real” rather than fragile, and the compiler has one consistent strategy for emitting identifiers.

### Acceptance Criteria

* Grep/search shows no obvious remaining “raw identifier” emission paths that bypass props.
* Example/fixture demonstrates props working in at least:

  * text interpolation
  * attribute binding
* Build succeeds and output is stable.

---

# Stage A4 — Add `@collie-lang/react` Package: Runtime `<Collie id>` Component

**Complete: 0%**

### Why this stage exists

React users must import one stable component and render by ID. This eliminates naming conflicts and makes Collie usage searchable (`<Collie`).

### Scope

Introduce a new workspace package that is published as `@collie-lang/react`.

### Deliverables

1. **New package**

   * Location: `packages/collie-react` (or similar consistent naming)
   * Published name: `@collie-lang/react`
   * Exports:

     * `Collie` component
     * minimal types (e.g. `CollieProps`)

2. **Runtime behavior**

   * Imports `registry` from `virtual:collie/registry`
   * On render:

     * resolve loader: `const load = registry[id]`
     * if missing:

       * throw helpful error (dev) with known IDs or suggestions
     * load module (lazy):

       * `const mod = await load()`
       * render: `return mod.render(restProps)` (ensure `id` is not forwarded)
   * Provide a loading fallback:

     * simplest MVP: render `null` until module loads
     * nicer: allow `<Collie id="..." fallback={<Spinner/>} />` (optional)

3. **Error quality**

   * When id not found, error should include:

     * requested id
     * a few “closest matches” (optional but recommended)
     * count of known IDs in dev (optional)

### Expected Outcome

React code compiles and runs using `<Collie id="...">` and props.

### Acceptance Criteria

* Package builds.
* A minimal Vite React app can import `{ Collie }` from `@collie-lang/react` (once plugin is updated in later stage).
* Runtime errors are understandable when id is wrong.

---

# Stage A5 — Early Quarantine: Disable Legacy `.collie` Import-as-Component Flows

# Stage A5a — Vite Plugin Core: Build Registry + Enforce Global Unique IDs (No HMR Polish Yet)

**Complete: 0%**

### Why this stage exists

This is the foundational Vite shift. It establishes the build-time registry without getting bogged down in HMR complexities. You want a working registry first, then you tune dev behavior.

### Scope

* `.collie` discovery (glob)
* parse templates
* enforce global uniqueness
* implement `virtual:collie/registry`
* implement deterministic internal IDs for template modules
* minimal viable dev server behavior (no fancy invalidation yet)

### Deliverables

1. **Discovery + parsing**

   * Discover `.collie` files (default `**/*.collie`, exclude node_modules/dist/outDir/etc.)
   * Parse each file into template units (multi-template) using the new compiler API.

2. **Global unique ID enforcement**

   * Build `Map<templateId, { file, line, col }>`
   * On duplicates, throw a single clear error listing:

     * the duplicated id
     * both/all file locations

3. **Virtual module: `virtual:collie/registry`**

   * Implement Vite plugin hooks (`resolveId`/`load`) so that importing `virtual:collie/registry` yields something like:

     ```ts
     export const registry = {
       "Blog.navbar": () => import("virtual:collie/template/Blog.navbar"),
       ...
     }
     ```

   * (You may need to encode IDs for valid module IDs; see below.)

4. **Virtual template modules**

   * Provide a virtual module per template, e.g.:

     * `virtual:collie/template/<encodedId>`
   * `load()` for that module returns compiled code exporting:

     * `export function render(props) { ... }`
   * Ensure that compiled template modules are independent (no naming conflict).

5. **Encoding strategy (important)**

   * IDs like `Blog.navbar` may be used in module IDs; Vite generally tolerates it, but safest is:

     * encode to URL-safe base64 or simple percent encoding.
   * Provide helper functions:

     * `encodeTemplateId(id) -> string`
     * `decodeTemplateId(encoded) -> string` (if needed)

### Expected Outcome

* Registry virtual module exists.
* Templates compile to virtual modules.
* Global ID uniqueness enforced.
* No reliance on importing `.collie` from user code.

### Acceptance Criteria

* A small Vite app can import `virtual:collie/registry` (indirectly via runtime later) without errors.
* Duplicate IDs produce a clear hard error with both locations.
* Running Vite dev server works (even if changes require restart—HMR polish comes later).

---

# Stage A5b — Vite Plugin Integration: Make Registry Consumable by `@collie-lang/react` Runtime

## You may ONLY touch/modify the following:

* `packages/vite/src/index.ts`
* `packages/vite/README.md` *(only if you need to clarify the registry export shape; keep minimal)*
* `packages/collie-react/src/index.tsx` *(only if you must adjust runtime expectations to match the registry shape; otherwise leave it alone)*
* `packages/collie-react/src/registry.d.ts` *(only if type contracts need to be updated to match the finalized registry/module shapes)*
* `packages/compiler/src/index.ts` *(only if you need to adjust exported types used by the Vite plugin/runtime boundary; avoid logic changes)*
* `ARCHITECTURE.md` *(only if you need to update the contract description; keep it small)*

## Explicitly **DO NOT** touch:

* `packages/cli/**`
* `packages/config/**`
* `packages/next/**`, `packages/webpack/**`, `packages/expo/**`, `packages/storybook/**`
* `packages/compiler/src/parser.ts`, `packages/compiler/src/codegen.ts`, `packages/compiler/src/props.ts` *(no compiler behavior changes in A5b)*
* `packages/collie-tests/**` *(no fixture changes here)*

**Complete: 0%**

### Why this stage exists

A5a produces the registry. This stage ensures the runtime consumption contract is stable and ergonomic, especially around async loading and module shapes.

### Scope

* align virtual module exports with runtime expectations
* confirm template module shape (`render(props)`)
* smooth over dev/prod differences
* minimal DX improvements

### Deliverables

1. **Lock the registry export shape**

   * `virtual:collie/registry` must export:

     * `registry: Record<string, () => Promise<{ render: (props:any)=>any }>>`

2. **Ensure template module export shape matches**

   * Each template module must export `render(props)`
   * Avoid default exports (reduces ambiguity and legacy patterns)

3. **Ensure stable behavior in dev and build**

   * `vite build` should produce working chunks for dynamic imports
   * registry should not include absolute paths that break across platforms

4. **Optional: expose `virtual:collie/ids`**

   * Not required, but useful:

     * `export const ids = ["..."] as const`
   * Helps future VS Code completions and runtime suggestions.

### Expected Outcome

The runtime component can rely on a stable registry contract and not implement Vite-specific hacks.

### Acceptance Criteria

* `@collie-lang/react` can import the registry and call `registry[id]()` to get a module with `render`.
* `vite build` succeeds and runtime works in production build (manual smoke test).

---

# Stage A5c — Early Quarantine: Hard-Disable Legacy .collie Imports and Component-Export Paths

## You may ONLY touch/modify the following:

* `packages/vite/src/index.ts`
* `packages/vite/README.md` *(only where it shows direct `.collie` imports; keep it limited to “first impression” examples)*
* Top-level docs that directly teach the old import model (only if they exist):

  * `README.md`
  * `docs/migration.md` *(only if it currently mentions legacy imports)*
  * `docs/examples/**` *(only where it demonstrates direct `.collie` import)*
* *(Optional, only if necessary)* `ARCHITECTURE.md` *(add the “direct imports disabled” note; do not rewrite the doc)*

## Explicitly **DO NOT** touch:

* `packages/compiler/**` *(no compiler export reshaping here unless it’s purely comment/deprecation, and even then prefer leaving it for A8)*
* `packages/collie-react/**` *(no runtime changes during quarantine unless required to keep build green)*
* `packages/cli/**`
* `packages/collie-tests/**` *(don’t “fix tests” by changing fixtures in this stage)*
* any non-vite integration packages (`next`, `webpack`, `expo`, `storybook`)

**Complete: 0%**

### Why this stage exists

After A5a/A5b/A5c, the only supported integration is:

* Vite plugin emits:

  * `virtual:collie/registry` (exports `registry`)
  * `virtual:collie/template/<encodedId>` (each exports `render(props)`)
* React runtime uses:

  * `import { Collie } from '@collie-lang/react'`
  * `<Collie id="...">`

The biggest risk now is that legacy code paths still allow `.collie` files to be imported directly as components, or that the Vite plugin still has hooks/branches that compile real `.collie` file paths into React component modules. Codex will “helpfully” reuse those paths during later changes unless we eliminate them decisively.

This stage is a **surgical quarantine**:

* disable or error on direct `.collie` imports now
* remove/cordon component-name derivation now
* keep low-level helpers only if they are clearly unreachable and marked deprecated
* deletion of dead legacy code happens in the final cleanup stage

### Scope

**Only** disable/cordon integration surfaces that conflict with the registry model:

* In `@collie-lang/vite`:

  * block importing real `.collie` file paths from app code
  * ensure only virtual IDs are used to load compiled templates
  * eliminate reachable branches that return component modules
* In docs/examples/templates:

  * remove “import `.collie` as component” examples (first-impression surfaces)
* In compiler exports:

  * prevent legacy-sounding APIs from being “the obvious way,” without necessarily deleting them yet

### Deliverables

## 1) Vite plugin: Explicitly error on direct `.collie` imports

After A5, `.collie` should **not** be imported in user code. Only virtual modules are legal:

* ✅ allowed:

  * `virtual:collie/registry`
  * `virtual:collie/template/<encodedId>`
* ❌ disallowed:

  * any resolved module id that is a real filesystem path ending in `.collie`
  * any `import` that points to `./Something.collie`

### Implementation requirements

* In the plugin’s `resolveId` and/or `load` (wherever you currently intercept `.collie`), detect when:

  * the resolved ID is an actual file path that ends with `.collie`
  * and it is **not** one of your known virtual module IDs

Then throw a Vite error immediately with a **high-signal message**, like:

* Title: `Direct .collie imports are not supported`
* Message includes:

  * the importer file (if available)
  * the attempted import
  * the correct usage:

```tsx
import { Collie } from '@collie-lang/react'
<Collie id="Your.TemplateId" />
```

And mention that templates are discovered automatically by `@collie-lang/vite`.

### Acceptance preference

**Compile-time error** (during dev server transform / build) is preferred over runtime throw.

---

## 2) Vite plugin: Remove or hard-disable reachable legacy “component module” branches

Codex drift usually comes from one of these being left reachable:

* converting `.collie` to TSX component
* exporting `default` React component
* deriving component names based on file name or `#id`
* “compat” plugin behavior that transforms `.collie` imports

### Implementation requirements

* Ensure that `@collie-lang/vite` **no longer** returns React component modules for any `.collie` file path.
* The only code paths that compile Collie templates should be those that serve:

  * `virtual:collie/template/<encodedId>`
* If you want to preserve reference code:

  * move it into `packages/vite/src/legacy/` (or similar)
  * and ensure it is not imported anywhere
  * add a header comment:

  ```ts
  /**
   * @deprecated
   * Legacy direct-import-as-component flow.
   * Intentionally disabled in registry architecture.
   * Do not use or re-enable.
   */
  ```

---

## 3) Registry + template module naming guardrails

To avoid future “accidental import support,” the plugin should have **one clear routing rule**:

* If `id === 'virtual:collie/registry'` → return registry module
* If `id` starts with `'virtual:collie/template/'` → decode and return compiled template module
* Otherwise:

  * if it ends with `.collie` → throw error (deliverable #1)
  * else ignore (let Vite handle)

This makes it very hard for Codex to add new ad-hoc behaviors.

---

## 4) Docs/examples/templates: eliminate legacy import patterns (first-impression surfaces only)

Do a targeted sweep (not a rewrite of everything yet) for:

* README quickstarts
* Vite plugin docs
* example apps

Remove/replace any snippet containing:

* `import X from './Something.collie'`
* `<X />` where X came from `.collie`
* text describing “Collie compiles to a React component you import”

Replace with the new canonical pattern:

* `@collie-lang/react` runtime
* `<Collie id="...">`
* `.collie` discovered automatically by Vite plugin
* multi-template file example with two `#id` blocks

(Full docs polish happens later; this stage is about stopping drift.)

---

## 5) Compiler exports: add “DO NOT USE” markers to legacy-shaped APIs (no deletion yet)

If there are compiler exports that still look like they support the old flow (e.g. “compile file into component”), do **one** of:

* Option A (preferred): make them internal-only (not exported from package root)
* Option B: keep exported but add loud deprecation comments and ensure docs never mention them
* Option C: move into `legacy/` module not referenced by barrel exports

Goal: Codex should not see a friendly public API that implies component-import usage.

---

### Expected Outcome

After this stage:

* Direct importing `.collie` is loudly rejected with actionable guidance.
* The only supported mechanism is the registry + template virtual modules.
* Codex has far fewer opportunities to “preserve legacy behavior,” reducing token waste and integration drift.

### Acceptance Criteria

* In a Vite project, `import Foo from './Foo.collie'` fails with a clear compile-time error telling the user to use `<Collie id="...">`.
* `virtual:collie/registry` and `virtual:collie/template/<encodedId>` still work.
* No README / primary docs show `.collie` direct import patterns.
* No reachable plugin code path compiles real `.collie` filesystem modules into React components.

---

# Stage A5d — Vite Plugin HMR: Targeted Invalidation and No Refresh Loops

## You may ONLY touch/modify the following:

* `packages/vite/src/index.ts`

## Allowed only if strictly required for types (prefer not)

* `packages/vite/package.json` *(only if you must adjust Vite peer dependency metadata; avoid unless a real incompatibility is found)*
* `packages/vite/README.md` *(only if you must document one critical dev-time HMR behavior; keep it tiny)*

## Explicitly **DO NOT** touch:

* `packages/compiler/**` *(no compiler changes while debugging HMR)*
* `packages/collie-react/**`
* `packages/cli/**`
* `packages/collie-tests/**` *(don’t alter tests to “make HMR pass”)*
* top-level docs (`README.md`, `ARCHITECTURE.md`) unless absolutely necessary

**Complete: 0%**

### Why this stage exists

Vite plugin HMR is where “almost works” becomes “developer rage.” Your current extension already suffered from refresh loops; don’t repeat that here. This stage is explicitly about stable dev behavior.

### Scope

* implement HMR updates/invalidation for:

  * registry module
  * template modules derived from a changed `.collie` file
* avoid infinite reload loops
* full reload is allowed only when necessary

### Deliverables

1. **Track dependency relationships**

   * Maintain in-memory mapping:

     * filePath → templateIds
     * templateId → virtual module id

2. **On `.collie` file change**

   * Re-parse templates for that file
   * Update template id list (handle added/removed templates)
   * Invalidate:

     * the template virtual modules from that file
     * the registry module
   * Trigger appropriate HMR updates:

     * Prefer `server.moduleGraph.invalidateModule(...)` + `server.ws.send(...)`
     * If you can’t make it stable quickly, use `full-reload` but ensure it doesn’t loop

3. **No loops**

   * Ensure that the plugin does not:

     * write files into watched directories repeatedly
     * change virtual module IDs on each rebuild
     * cause “registry changed” events continuously

4. **Duplicate ID changes handling**

   * If a file change introduces duplicates:

     * surface error immediately and clearly in dev
     * avoid repeated reload spam

### Expected Outcome

Editing a `.collie` file updates templates in dev without requiring a server restart and without loops.

### Acceptance Criteria

* Editing a `.collie` file causes:

  * new output on screen (if used)
  * no infinite reload / refresh loop
* Adding a new `#id` block in an existing `.collie` file works without restarting.
* Removing an id results in runtime “unknown id” error (expected) and does not crash the dev server.

---

# Stage A6 — Update CLI Commands + Project Templates for New Workflow

## You may ONLY touch/modify the following:

* `packages/cli/src/index.ts`
* `packages/cli/src/checker.ts` *(if ids/explain reuse checker logic)*
* `packages/cli/src/output.ts`
* `packages/cli/src/fs-utils.ts`
* `packages/cli/src/doctor.ts` *(only if you add references/help text to the new commands)*
* `packages/cli/README.md`
* `README.md` *(only if you surface the new commands there)*

## Explicitly **DO NOT** touch:

* `packages/vite/**`
* `packages/collie-react/**`
* `packages/compiler/**`
* `packages/collie-tests/**`
* templates under `packages/cli/templates/**` *(unless you’re explicitly adding the new commands into template docs)*

**Complete: 0%**

### Why this stage exists

CLI/templates are often the first impression. They must reflect the new reality or you’ll lose credibility immediately.

### Scope

Update docs, templates, and CLI commands that assume the old model.

### Deliverables

1. **Scaffold/templates updated**

   * Vite React template should:

     * install `@collie-lang/vite` + `@collie-lang/react`
     * configure Vite plugin in `vite.config.ts`
     * show `.collie` file with multiple template blocks
     * show React usage with `<Collie id="...">` passing props

2. **CLI `check` updated**

   * Must validate:

     * mandatory `#id`
     * invalid IDs
     * duplicates across project (can reuse plugin logic or share helper)
   * Output should show file + location for each issue.

3. **Optional but highly valuable CLI additions**

   * `collie ids` lists all IDs and their locations
   * `collie explain <id>` prints the file and block location for a given id

4. **Docs alignment**

   * Replace any mention of “import `.collie` as component” with `<Collie id>` usage.

### Expected Outcome

A new user running `collie create` (or reading docs) sees the right pattern and can get working immediately.

### Acceptance Criteria

* Generated Vite React project runs with `<Collie id>` and props.
* `collie check` catches missing `#id` and duplicates.
* Docs do not teach the old component-import model.

---

# Stage A7 — Final Cleanup: Delete Legacy Code, Tighten APIs, and Normalize the Repo

## You may ONLY touch/modify the following:

* `packages/vite/src/index.ts` *(remove any remaining legacy paths, delete legacy folder if created)*
* `packages/vite/README.md`
* `packages/compiler/src/index.ts`
* `packages/compiler/src/*` *(only files directly related to deprecated exports/wrappers — do not touch parser/codegen unless removing dead wrapper entry points)*

  * likely candidates (only if they contain legacy wrappers):

    * `packages/compiler/src/convert.ts`
    * `packages/compiler/src/index.ts`
    * `packages/compiler/src/codegen.ts` *(only if removing clearly dead legacy entry points)*
* `packages/collie-react/src/index.tsx` *(only if removing legacy compatibility behaviors)*
* `packages/collie-react/README.md`
* Top-level docs that still mention legacy model:

  * `README.md`
  * `ARCHITECTURE.md`
  * `docs/examples/**`
  * `docs/migration.md`

## Explicitly **DO NOT** touch:

* `packages/cli/src/**` *(unless deleting CLI flags/options that only existed for legacy component-import flow; if so, keep it minimal and limited to those files)*
* `packages/config/**` *(unless you are explicitly deleting config keys tied to the legacy model)*
* `packages/next/**`, `packages/expo/**`, `packages/webpack/**`, `packages/storybook/**`
* `packages/html-runtime/**`
* `packages/collie-tests/**` *(do not “fix failing tests” by changing fixtures broadly; only update fixtures that are explicitly incompatible with the new model, and do it minimally)*

**Complete: 0%**

### Why this stage exists

Once the new system is stable (registry, multi-template parsing, props, runtime component, CLI/docs), you want the repo to read like the new model has always been the model.

This stage is where you:

* **delete** quarantined legacy code (not just disable it)
* remove deprecated wrappers
* simplify public API surface
* ensure there’s no dead or confusing code that could be resurrected later

This is a credibility stage as much as a technical one.

### Scope

* Full removal of legacy code paths that conflict with the new registry model
* Reduce duplication and “two ways to do the same thing”
* Ensure docs, package exports, and examples are consistent

### Deliverables

#### 1) Delete quarantined legacy integration code

Remove the legacy `.collie -> React component module` pipeline entirely.

* Delete `legacy/` modules added in A5 if they exist
* Delete component-name-based compilation helpers that are no longer used
* Delete old Vite plugin hooks/branches that supported direct `.collie` imports (now fully unsupported)

If you want historical reference, rely on:

* a git tag (`pre-registry-refactor`) or branch, not dead code in main

#### 2) Tighten compiler exports around the new model

Your compiler should clearly expose:

* parse-to-template-units API
* compile-template-unit API producing `render(props)`

If you kept old APIs as wrappers:

* remove them now **unless** you intentionally want them for internal tooling
* if kept, rename them to not imply public legacy behavior

Goal: no exported function name should suggest “compile file into component.”

#### 3) Simplify and normalize package boundaries

Make sure the repo communicates clean boundaries:

* `@collie-lang/react` is runtime-only
* `@collie-lang/vite` is plugin-only
* compiler packages are pure (no Vite-specific assumptions)

Remove any leftover cross-contamination:

* react runtime should not import Vite plugin packages
* vite plugin should not export react components

#### 4) Delete stale docs and update all examples

Do one final pass:

* remove references to direct imports
* remove references to “component name derived from React component”
* ensure all examples show:

  * `#id` blocks (mandatory)
  * `<Collie id="...">` usage
  * props passed into templates

#### 5) Repo hygiene: remove dead config/options that only served the legacy flow

If you have configuration keys or CLI flags that only exist to support the old model (e.g. “componentNameStrategy” or “emitComponentModules”), remove them.

If you’re unsure whether a flag is still useful:

* mark it deprecated for removal in the next major — but since you’re pre-launch, you can delete aggressively.

### Expected Outcome

After A8:

* There is **one obvious way** to use Collie (registry + `<Collie id>`).
* The repo is cleaner, smaller, and less confusing.
* Future changes won’t accidentally reintroduce the old model.

### Acceptance Criteria

* No `legacy` folder or unreachable legacy compilation code remains in main branch.
* No Vite plugin path compiles `.collie` into importable React components.
* Compiler exports match the new mental model (template units + `render(props)`).
* Docs/examples consistently teach the new workflow.
* A sample Vite project builds and runs using:

  * multi-template `.collie`
  * `<Collie id>` rendering
  * props passed successfully