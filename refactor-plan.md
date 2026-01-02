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

**Complete: 0%**

### Why this stage exists

Props are “day 1 mandatory.” This stage ensures the compiled render function can access `props` for interpolations/expressions.

### Scope

Wire variable/expression resolution to `props`. The exact Collie expression syntax already exists in the compiler — update the semantics so it’s props-backed.

### Deliverables

1. **Define the prop resolution rule**

   * If Collie expression references `title`, it should resolve from `props.title` (or destructured `{ title } = props`).
   * Keep it simple and predictable:

     * I recommend destructuring at top of render:

       ```ts
       export function render(props: any) {
         const { title, user } = props ?? {}
         ...
       }
       ```
     * Or always use `props.title`. Either is fine, but be consistent.

2. **Update compiler codegen accordingly**

   * Any place that previously assumed “locals” or an implicit scope must now source from `props` (or from a `ctx` that includes props).

3. **Document it briefly**

   * Add a short section in `ARCHITECTURE.md` about props usage.

### Expected Outcome

Templates can use dynamic values passed from React without hacks or “gimmick” vibes.

### Acceptance Criteria

* You can author a template that references a value (whatever Collie’s expression mechanism is) and have it reflect runtime-provided props.
* No runtime errors due to missing/undefined props access; should fail gracefully (undefined renders nothing or results in empty string depending on semantics).

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

**Complete: 0%**

### Why this stage exists

This refactor’s biggest risk isn’t technical difficulty — it’s **accidental hybrid architecture**.

Once the new registry model is introduced, any remaining “`.collie` imports compile into React components” pathways will mislead Codex (and humans). The result is usually a fragile mashup where:

* some flows resolve templates by **ID**
* other flows still compile `.collie` into a **named component**
* docs/examples get inconsistent
* future changes reintroduce conflicts and confusion

This stage is a **surgical quarantine**: we **disable** legacy integration paths now (so they can’t be accidentally used), but we don’t necessarily delete every last helper yet. Deletion happens later in A8 when everything is proven stable.

### Scope

* Focus on **integration hot paths** most likely to cause hallucinations/drift:

  * `@collie-lang/vite` plugin’s `.collie` import behavior
  * any public docs/examples that still demonstrate legacy usage
  * any “component-name generation” that implies legacy semantics
* Keep low-level compiler helpers if they’re still useful to reference, but ensure no public or common path uses them.

### Deliverables

#### 1) Hard-disable direct `.collie` imports as React components (Vite plugin)

If a user tries:

```ts
import Foo from './Foo.collie'
```

or any form of importing `.collie` directly in application code, they should not get a compiled component anymore.

**Implement one of these approaches (prefer A):**

**A) Vite plugin error on `.collie` import requests**

* In the plugin hooks handling module resolution/loading:

  * If the requested module is a real `.collie` file path (not one of your virtual template module IDs), throw a clear error.
* Error message should explicitly instruct:

  * “Direct importing `.collie` files is not supported. Use `@collie-lang/react` `<Collie id="...">` and ensure `@collie-lang/vite` is installed.”

**B) Vite plugin returns a module that throws**

* If you don’t want to hard-error at compile-time, you can return a JS module that throws at runtime.
* This is inferior for DX, but still prevents “it compiles, so it must be supported.”

**Acceptance preference:** compile-time hard error is best. You want to prevent outdated patterns immediately.

#### 2) Remove “component name derivation” from the active path

Disable/cordon anything in the Vite plugin that:

* derives a component name from file name / React component name / `#id`
* exports default React components from `.collie` compilation
* encourages `.collie` to behave like a JSX component module

This code can:

* be moved into a clearly named file like `legacy/compile-collie-to-component.ts` (not imported anywhere), OR
* be left in place but unreachable and clearly marked deprecated (less ideal)

The goal is: **Codex can’t accidentally reuse it** during later stages.

#### 3) Quarantine legacy APIs with explicit “do not use” signals

If there are compiler APIs that still scream “legacy usage” (like a `compileFileToComponent` style function), you have two safe options:

* **Option 1 (recommended):** keep the function but make it a thin wrapper over the new multi-template/unit compiler and add loud comments:

  * `/** @deprecated Legacy component import flow is not supported. Do not use for new integrations. */`
* **Option 2:** move them into a `legacy/` module not referenced by any exports.

Don’t delete them yet unless you’re 100% sure nothing still uses them.

#### 4) Docs/examples guardrail (minimal but critical)

Do a repo-wide search for legacy usage patterns and remove/replace any that are “first-impression” surfaces:

* `import X from './*.collie'`
* usage like `<X />` where X came from `.collie`
* any docs describing “Collie compiles to a React component you import”

In this stage, it’s OK to:

* replace with a note: “Docs will be updated fully in later stage”
  …but do remove the misleading code examples now.

#### 5) Add a small “Legacy Disabled” note in the architecture doc

Update `ARCHITECTURE.md` with a short explicit statement:

* “Direct importing `.collie` files as components is intentionally unsupported.”
* “The only supported runtime entry point is `<Collie id="...">`.”
* Mention that the legacy behavior is quarantined/removed.

This is mainly to stop future contributors from trying to “add back” the old behavior.

### Expected Outcome

After A5:

* It’s **impossible** (or loudly rejected) to use Collie via direct `.collie` imports.
* The only viable path is the registry + `<Collie id>` model.
* Codex is much less likely to hallucinate old patterns into new code.

### Acceptance Criteria

* Attempting to import a `.collie` file directly in a Vite React app causes a clear error telling users to use `<Collie id>`.
* Vite plugin still supports the new virtual module registry/template flow.
* No docs/examples in primary readme/getting-started areas show direct `.collie` imports.
* Legacy component-name generation is not reachable from the plugin’s normal execution path.

---

# Stage A6 — Rewrite `@collie-lang/vite` to Build Registry + Enforce Global Unique IDs

**Complete: 0%**

### Why this stage exists

This is the “core shift.” It replaces component-name-based import semantics with registry-based id resolution.

### Scope

Refactor Vite plugin to:

* discover `.collie`
* parse all templates
* compile each template unit into a module exporting `render(props)`
* emit `virtual:collie/registry`

### Deliverables

1. **Discovery**

   * Default include: `**/*.collie`
   * Default exclude: `node_modules/**`, `dist/**`, `build/**`, output dirs, and any existing Collie outDir.
   * Use plugin options and/or Collie config if you already have config loading.

2. **Global ID uniqueness**

   * Build a map: `id -> { file, line, col }`
   * If duplicates:

     * throw a single error listing all duplicates and their locations
     * fail the build (dev should show overlay)

3. **Virtual module: `virtual:collie/registry`**

   * Export:

     * `export const registry = { [id]: () => import(compiledPathForId) }`
   * Prefer lazy loaders to enable code splitting.

4. **Template module generation**

   * For each template unit, generate a stable module id/path.
   * Recommend virtual submodules:

     * `virtual:collie/template/<safeEncodedId>`
   * The plugin can implement `resolveId`/`load` for these template module ids and return the compiled code string from compiler.

5. **HMR**

   * On `.collie` file change:

     * re-parse templates from that file
     * update registry content
     * invalidate affected template virtual modules
     * invalidate registry module
   * Full reload acceptable early, but **must not** cause an infinite refresh loop.

6. **Remove conflicting legacy behavior**

   * The plugin should no longer primarily transform `.collie` file imports into components.
   * If you keep a compatibility path internally, it must not be documented and must not interfere with registry.

### Expected Outcome

Vite app can run with:

* `.collie` templates anywhere in repo
* `<Collie id="...">` resolves them via the registry

### Acceptance Criteria

* Build works without importing `.collie` files directly.
* Duplicate IDs throw a clean error listing both locations.
* Editing a `.collie` file updates output in dev without breaking dev server.

---

# Stage A7 — Update CLI Commands + Project Templates for New Workflow

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

# Stage A8 — Final Cleanup: Delete Legacy Code, Tighten APIs, and Normalize the Repo

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