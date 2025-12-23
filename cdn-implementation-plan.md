# Collie CDN Runtime Implementation Plan

*Last updated: 2025-12-23*

This document defines a **stage-by-stage**, Codex-executable implementation plan to introduce Collie’s official **CDN-based HTML runtime** (`collie-html-runtime.js`, `collie-convert.js`) along with the required packaging, bundling, versioning, config support, and GitHub automation necessary to publish runtime assets under:

```
https://cdn.collie-lang.org/v1/...    
https://cdn.collie-lang.org/v1.0.0/...
```

This plan also describes minor updates needed in the Collie config system to support choosing between a **local runtime** and a **CDN runtime**.

Codex should follow this plan **exactly**, one stage at a time.

---

## IMPORTANT INSTRUCTIONS (READ FIRST)

### 1. Clarification First

If any part of a stage is ambiguous, contradictory, or not applicable to the current codebase:

1. **Stop.**
2. Output a **numbered list of clarifying questions**.
3. Do **not** modify code until ambiguity is resolved.

### 2. Stage Completion Protocol

For each stage:

1. Implement **all tasks** in that stage.
2. Add a section at the end of the stage in this file:

```
### Implementation Summary (Stage X)
```

and describe:

* What files were added/updated/removed
* Design decisions made
* TODOs left for future stages
* Any failing tests (do NOT fix tests)

3. Update the task status from `Not Started` to a percent complete (e.g. `100% Complete`). If you were not able to 100% implement the task, then explain why (maybe additional things the user needs to do on their end, or something unclear on your end you need clarification on before doing the remainder of it).

### 3. No Tests

Do NOT add tests, change tests, or delete tests unless a future stage explicitly says so.

### 4. Order Matters

Stages must be implemented **in numerical order**.

---

# 🎯 High-Level Goals

The overall outcome of this plan:

### 1. Introduce a new package:

```
packages/html-runtime
```

Containing:

* `src/collie-html-runtime.ts` — browser runtime that:

  * Scans DOM for Collie placeholders (idExact / idSuffix / dataAttribute)
  * Fetches corresponding HTML partial by ID
  * Injects into the DOM
  * Exposes a small browser API (e.g., `window.CollieRuntime.refresh()`)
* `src/collie-convert.ts` (optional for now)

  * Stubbed module (with TODO inside)
  * Later will provide DOM→Collie helper functions

### 2. Add versioned output directories

Bundled JS should generate:

```
dist/v1/collie-html-runtime.js
dist/v1/collie-convert.js

dist/v1.0.0/collie-html-runtime.js
dist/v1.0.0/collie-convert.js
```

(Version taken from `packages/html-runtime/package.json`.)

### 3. Update Collie Config Schema

Inside `@collie-lang/config`, expand `HtmlProjectOptions.runtime` with:

```ts
runtime?: {
  mode?: "local" | "cdn";
  local?: {
    path?: string;
  };
  cdn?: {
    version?: string;       // default = major version, e.g. "v1"
    runtimeUrl?: string;    // optional override
    convertUrl?: string;    // optional override
  };
};
```

### 4. Update Example Configs

Update:

* `docs/examples/config/collie.config.example.ts`
* `docs/examples/config/collie.config.example.js`
* `docs/examples/config/collie.config.example.json`

to include the new `runtime` section with both local + CDN examples.

### 5. Add GitHub Workflow

Add a workflow under:

```
.github/workflows/publish-html-runtime.yml
```

Tasks:

* Trigger on Git tags of the form: `runtime-v*` (ex: `runtime-v1.0.0`)
* Build package `packages/html-runtime`
* Upload output (`dist/*`) as Cloudflare Pages artifact (instructions emitted in Stage 6)
* Optionally publish a GitHub Release

### 6. Add helpful package.json scripts

Inside `packages/html-runtime/package.json`:

* `"build": "tsup src/*.ts --format esm --dts false"`
* `"build:versioned": "node scripts/build-versioned.js"`
* `"prepare-cdn": "pnpm build && pnpm build:versioned"`

Plus a top-level script:

```
pnpm prepare:cdn -w
```

---

# 📦 STAGE 0 — Create `packages/html-runtime` Package Scaffold

## Status: Not Started

**Goal:** Create an empty package ready to accept runtime code.

### Tasks

1. Create directory:

```
packages/html-runtime
```

2. Create `package.json` based on patterns from other Collie packages:

```json
{
  "name": "@collie-lang/html-runtime",
  "version": "1.0.0",
  "private": false,
  "main": "dist/v1/collie-html-runtime.js",
  "module": "dist/v1/collie-html-runtime.js",
  "types": "",
  "files": [
    "dist/"
  ],
  "scripts": {
    "clean": "rimraf dist",
    "build": "tsup src/collie-html-runtime.ts --format esm --out-dir dist/temp",
    "build:versioned": "node scripts/build-versioned.js",
    "prepare-cdn": "pnpm build && pnpm build:versioned"
  },
  "devDependencies": {
    "tsup": "latest",
    "rimraf": "latest"
  }
}
```

3. Create folder structure:

```
packages/html-runtime/
  src/
    collie-html-runtime.ts     // empty stub
    collie-convert.ts          // empty stub
  scripts/
    build-versioned.js         // empty stub (Stage 2)
  dist/                        // ignored by git
```

4. Add placeholder TS files:

```ts
// collie-html-runtime.ts
// TODO: Runtime injection implementation goes in Stage 3.
export function initCollieHtmlRuntime() {
  console.warn("Collie HTML runtime not implemented yet.");
}
export default initCollieHtmlRuntime;
```

```ts
// collie-convert.ts
export function convertDomToCollie() {
  console.warn("convertDomToCollie(): not implemented yet.");
}
```

5. Add `.gitignore` to ignore `dist/` if not globally ignored.

6. Ensure the workspace root `package.json` includes this package.

### Implementation Summary (Stage 0)

*Add after Codex executes.*

---

# 📦 STAGE 1 — Implement Runtime Injection Logic

## Status: Not Started

**Goal:** Implement browser injection logic into `collie-html-runtime.ts`.

### Required Runtime Behavior

1. On load:

   * Wait for `DOMContentLoaded`.
   * Scan DOM for placeholders depending on config:

     * `idExact`
     * `idSuffix`
     * `dataAttribute`

2. Derive partial ID from element:

   * e.g., `hero-collie` → `hero`

3. Construct fetch URL:

   * `"${basePath}/${id}.html"`
   * For now, assume:

     * Local dev base path: `/collie-generated`
     * CDN does not affect fetch path (only script delivery)

4. Fetch partial HTML (e.g. `/collie-generated/hero.html`).

5. Inject into element:

   * `el.innerHTML = html`

6. Expose API:

```ts
window.CollieHtmlRuntime = {
  refresh(): Promise<void>,
  loadPartialById(id: string): Promise<string>
};
```

7. Module entry point:

   * Auto-run `initCollieHtmlRuntime()`.

### Tasks

* Replace stub with full implementation.
* Add micro error-handling (console warnings only).
* Keep file < ~3KB unminified.

### Implementation Summary (Stage 1)

---

# 📦 STAGE 2 — Implement Versioned Build Output (`build-versioned.js`)

## Status: Not Started

**Goal:** Copy the compiled files from `dist/temp/` into versioned directories.

### Requirements

1. Read version from `package.json`, e.g. `"1.0.0"`.

2. Generate:

```
dist/v1/collie-html-runtime.js
dist/v1/collie-convert.js

dist/v1.0.0/collie-html-runtime.js
dist/v1.0.0/collie-convert.js
```

3. Directory structure:

```
dist/
  v1/
    *.js
  v1.0.0/
    *.js
```

4. After copying, delete `dist/temp`.

### Implementation Summary (Stage 2)

---

# 📦 STAGE 3 — Extend Config Schema for CDN Runtime Support

## Status: Not Started

**Goal:** Add runtime mode to `HtmlProjectOptions` inside `@collie-lang/config`.

### Tasks

1. Modify `HtmlProjectOptions`:

```ts
runtime?: {
  mode?: "local" | "cdn";
  local?: {
    path?: string;
  };
  cdn?: {
    version?: string;       // defaults to major version, e.g. "v1"
    runtimeUrl?: string;
    convertUrl?: string;
  };
};
```

2. Update Typescript definitions in `packages/config/src/types.ts`.

3. Update JSON schema (when applicable in later stages).

### Implementation Summary (Stage 3)

---

# 📦 STAGE 4 — Update Example Config Files

## Status: Not Started

**Goal:** Add CDN runtime examples to:

* `docs/examples/config/collie.config.example.ts`
* `docs/examples/config/collie.config.example.js`
* `docs/examples/config/collie.config.example.json`

### Tasks

1. Add both **local** and **cdn** examples:

```ts
html: {
  runtime: {
    mode: "cdn",
    cdn: {
      version: "v1",
      runtimeUrl: "https://cdn.collie-lang.org/v1/collie-html-runtime.js",
      convertUrl: "https://cdn.collie-lang.org/v1/collie-convert.js"
    }
  }
}
```

2. For JSON version:

   * Exclude fields requiring functions.

### Implementation Summary (Stage 4)

---

# 📦 STAGE 5 — Add GitHub Workflow for Publishing Runtime to CDN

## Status: Not Started

**Goal:** Add CI workflow to build and deploy CDN assets.

### Tasks

1. Add file:

```
.github/workflows/publish-html-runtime.yml
```

2. Trigger:

```yaml
on:
  push:
    tags:
      - "runtime-v*"
```

3. Steps:

* `checkout`
* `setup pnpm`
* Install dependencies
* Build:

```
pnpm --filter @collie-lang/html-runtime prepare-cdn
```

* Upload build artifacts to Cloudflare Pages (use Cloudflare’s official GitHub action)

  * The action will require secrets:

    * `CLOUDFLARE_API_TOKEN`
    * `CLOUDFLARE_ACCOUNT_ID`
    * Cloudflare Pages project name (you choose this)

4. Optional: Create GitHub Release for the tag.

### Implementation Summary (Stage 5)

---

# 📦 STAGE 6 — Add Helpful NPM Scripts in Root + Runtime Package

## Status: Not Started

### Tasks

1. In `packages/html-runtime/package.json` ensure:

```json
"scripts": {
  "clean": "rimraf dist",
  "build": "tsup src/*.ts --format esm --out-dir dist/temp",
  "build:versioned": "node scripts/build-versioned.js",
  "prepare-cdn": "pnpm build && pnpm build:versioned"
}
```

2. In workspace root `package.json`:

```json
"scripts": {
  "prepare:cdn": "pnpm --filter @collie-lang/html-runtime prepare-cdn"
}
```

### Implementation Summary (Stage 6)

---

# 📦 STAGE 7 — Future Improvements (Stubs Only)

## Status: Not Started

Codex should create stubs only; do not implement actual logic:

* WebSocket auto-refresh
* DOM mutation observer (auto-inject on dynamic DOM changes)
* CDN distribution for map files / caching / SRI
* Collie-to-DOM dev preview helpers

### Implementation Summary (Stage 7)

