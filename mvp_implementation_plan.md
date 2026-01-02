# Collie Demo MVP — Implementation Plan (`collie` repo)

## Context & Problem

We are building a demo flow that starts from a brand-new Vite + React + TS project and demonstrates:
- `collie init` sets up a Vite-friendly Collie config
- the CLI self-heals missing required Collie packages by prompting to install them
- `.collie` changes rebuild and update the dev server reliably
- Collie emits structured diagnostics with *fix metadata* (demo rule: `#id` must be PascalCase)
- core exposes formatting and fix-all so the VS Code extension can implement Format + Fix All
- (optional but preferred) core exposes conversion APIs TSX ⇄ Collie for the extension

Codex previously assessed overall demo readiness as ~35% mostly due to missing “demo glue”:
- CLI preflight install: missing
- `collie init` Vite defaults: partial
- PascalCase `#id` diagnostic + fix: missing
- Formatter/fix-all API for extension: partial
- Optional: enforce deterministic dev-loop/HMR: partial/optional

This plan is optimized for:
- **demo reliability first**
- **minimal changes**
- **no architecture rewrites**
- **no tests**

---

## Hard Constraints

- **Do NOT write tests.**
- Avoid broad refactors, renames, or moving lots of files.
- Prefer surgical additions with clear exports.
- Keep CLI commands/flags stable unless adding new optional flags.

---

## Stage 0 — Baseline Snapshot & Guardrails

**% Complete:** 100%

### Goals
- Establish a stable baseline for demo-critical behavior so changes can be validated quickly.
- Add a tiny “manual verification checklist” you can run after each stage.

### Action Items
1. Create a `docs/demo-checklist.md` (or `DEMO_CHECKLIST.md`) with a short manual checklist:
   - fresh Vite project steps
   - `collie init`
   - run Vite dev server
   - edit `.collie` and verify browser updates
   - introduce invalid `#id` and verify diagnostic/fix available (future stages)
2. Identify the current:
   - CLI entry + dispatch (`packages/cli/src/index.ts`)
   - compiler diagnostics types (`packages/compiler/src/diagnostics.ts`)
   - parser directive handling for `#id` (`packages/compiler/src/parser.ts` or wherever `#id` is parsed)
   - formatter (`packages/cli/src/formatter.ts`)
3. Add a small “demo flags” section in `docs/demo-checklist.md`:
   - recommended demo snippet characteristics (simple, self-contained selection)
   - known limitations (complex TSX expressions may not round-trip perfectly)

### Expected Behavior
- No functional change. This stage only creates documentation and clarifies verification steps.

### Notes
- If anything in the repo makes the demo checklist unclear (e.g., unknown config path conventions), note it and update the checklist.

---

## Stage 1 — PascalCase `#id` Diagnostic + Fix Metadata (Compiler)

**% Complete:** 100%

### Goals
Enable the demo “wow moment”:
- invalid `#id` immediately produces a structured diagnostic (range, code, message)
- diagnostic includes a deterministic fix payload that editors can apply

### Action Items
1. Add a new stable diagnostic code for this rule (example):
   - `COLLIE_ID_NOT_PASCAL_CASE`
2. In the parser logic for the `#id` directive:
   - validate the id value is PascalCase
   - if invalid, emit a `Diagnostic`:
     - `severity: Error`
     - `code: COLLIE_ID_NOT_PASCAL_CASE`
     - message: explain PascalCase requirement and show suggested corrected form
     - range/span should point to the id value token only (not the whole line)
     - attach `fix` metadata:
       - replace-range for the id token
       - replacement text = PascalCase transform result
3. Ensure normalization pipeline preserves:
   - file path (if known)
   - range correctness after normalization
4. Add/verify a minimal PascalCase transformer:
   - deterministic
   - handles `my-id`, `my_id`, `my id`, `myId`, etc. into `MyId`
   - do not get fancy; demo-safe is the priority

### Expected Behavior (Manual Verification)
- Given a `.collie` file:
  - `#id myComponent` ⇒ error diagnostic emitted with fix to `MyComponent`
  - `#id my-component` ⇒ error diagnostic emitted with fix to `MyComponent`
  - `#id MyComponent` ⇒ no diagnostic

### Notes (if not 100%)
- If the parser does not expose a span for the id token, you may need to:
  - store the span during tokenization, or
  - compute it from directive span + offset
  Briefly explain what prevented token-level span precision.

---

## Stage 2 — Fix-All Apply Helper (Compiler)

**% Complete:** 100%

### Goals
Provide a core helper that can apply all non-overlapping `Diagnostic.fix` edits in a file.

This enables:
- extension “Fix all Collie issues”
- CLI future “collie fix” (optional)

### Action Items
1. Implement a utility function in compiler (or a shared package) like:
   - `applyFixes(sourceText: string, fixes: Fix[]): { text: string, applied: Fix[] }`
2. Rules:
   - sort fixes by start position ascending
   - skip overlapping fixes (or stop and return an error list)
   - apply from bottom-to-top (or use offset adjustment), but be consistent and safe
3. Implement:
   - `fixAllFromDiagnostics(sourceText, diagnostics)` that extracts `diagnostic.fix` entries and applies them
4. Make sure `#id` PascalCase fix is included in the list.

### Expected Behavior
- Given multiple fixable issues (at minimum multiple invalid `#id` occurrences if possible, or multiple dialect token normalization issues), fix-all produces corrected output and removes the errors when re-linted.

### Notes (if not 100%)
- If there’s only one fixable rule today, that’s OK for demo MVP; note that fix-all currently targets only a subset of diagnostic codes.

---

## Stage 3 — Expose Formatter as a Core API (Compiler or Shared Package)

**% Complete:** 100%

### Goals
Make formatting callable programmatically by the VS Code extension (without shelling out to CLI).

Codex reported:
- formatter exists under CLI (`packages/cli/src/formatter.ts`)
- not exported for editor usage

### Action Items
1. Identify current formatter entry (`formatSource` or similar).
2. Move the minimal formatting logic to a core/shared location:
   - preferred: `packages/compiler` export
   - acceptable: a small new package `packages/format` if moving is too messy (but avoid if possible)
3. Export a stable API:
   - `formatCollie(sourceText: string, options?): { formatted: string }`
   - options can be minimal (indent size, etc.) or omitted for MVP
4. Keep CLI behavior intact by reusing the same formatter function.
5. Ensure formatting is stable:
   - formatting twice yields same output

### Expected Behavior
- Programmatic calls produce identical output to `collie format`.
- Formatting errors surface clearly (exception or diagnostic list).

### Notes (if not 100%)
- If moving code creates circular deps (CLI ↔ compiler), keep the function in place but re-export it via a dependency-safe module; explain the compromise.

---

## Stage 4 — CLI Preflight Dependency Checks + Prompt-to-Install

**% Complete:** 0% (update after stage)

### Goals
When user runs `collie init` (or any command), Collie:
- detects missing required Collie packages
- prompts to install them
- installs via detected package manager
- continues executing the original command
- exits gracefully if user declines

### Action Items
1. Implement a shared `preflight()` that runs before executing any command:
   - Determine project root (nearest `package.json` from CWD)
   - Detect package manager (lockfile-based + fallback)
   - Determine required packages for the invoked command
     - MVP: for demo, focus on Vite + React projects
2. Required packages (use real package names):
   - compiler
   - vite plugin
   - runtime/html-runtime if required at runtime
   - config package if needed
3. Check installation status:
   - prefer checking `package.json` deps and/or `node_modules` resolution
4. Prompt:
   - “Missing required Collie packages: X, Y. Install now?”
   - If No: print instructions and exit with code 0 (graceful)
   - If Yes: install devDependencies and continue the command
5. Implement install:
   - pnpm: `pnpm add -D ...`
   - npm: `npm i -D ...`
   - yarn: `yarn add -D ...`
6. Ensure “continue original command” does not re-run preflight infinitely:
   - mark that preflight completed once per process
7. Apply preflight to:
   - `init` (mandatory)
   - at least one other command (e.g., `check`) to prove it’s shared

### Expected Behavior
- In a fresh Vite project with only `collie` CLI installed:
  - `collie init` prompts to install missing packages
  - Yes ⇒ installs packages and continues init
  - No ⇒ exits cleanly with next steps

### Notes (if not 100%)
- If monorepo/workspace detection is complex, scope MVP to “single-package Vite repo” and note that workspace roots may require follow-up refinement.

---

## Stage 5 — Upgrade `collie init` to Vite-Friendly Defaults

**% Complete:** 0% (update after stage)

### Goals
Make `collie init` generate the expected demo setup:
- `collie.config.ts` (not .js) with Vite-based defaults
- ensures `.collie` typings exist (or instructs how)
- optional: patches `vite.config` if required by your plugin strategy

### Action Items
1. Modify init to write `collie.config.ts` by default:
   - idempotent behavior on re-run
2. Populate Vite defaults:
   - input glob(s)
   - output strategy consistent with Vite plugin (prefer in-memory; avoid watch loops)
3. Ensure `.collie` module typing is present:
   - either generate `src/collie.d.ts`, or
   - update existing `collie.d.ts` approach from templates
4. If Vite config patching is required:
   - do minimal safe patch (append plugin import + plugin call)
   - avoid AST rewrite if possible; string insertion with guardrails is OK for MVP
5. Print clear success + next steps.

### Expected Behavior
- After init, a fresh Vite project can import `.collie` files without TS type errors.
- Vite dev server recognizes `.collie` files per plugin strategy.

### Notes (if not 100%)
- If patching Vite config reliably is hard, skip it and instead ensure the plugin is installed/configured via an explicit instruction message; note this limitation.

---

## Stage 6 — Optional: Vite Plugin HMR Determinism Hardening

**% Complete:** 0% (update after stage)

### Goals
Reduce demo flakiness by ensuring `.collie` edits consistently update the browser:
- either reliable HMR
- or deterministic full reload

### Action Items
1. Evaluate current behavior in `packages/vite/src/index.ts`:
   - compilation occurs in `load()`
   - no explicit `handleHotUpdate`
2. If you observe flakiness, add a minimal `handleHotUpdate`:
   - invalidate the module
   - optionally trigger full reload for `.collie` changes (demo-safe)
3. Ensure no watch loops (plugin should remain in-memory).

### Expected Behavior
- Editing a `.collie` file always updates the running app quickly.

### Notes (if not 100%)
- If adding HMR hooks introduces instability, revert and rely on Vite’s default invalidation; note observed behavior and why.

---

## Stage 7 — Optional: Core Conversion APIs (TSX ⇄ Collie)

**% Complete:** 0% (update after stage)

### Goals
Expose stable conversion functions for the VS Code extension to call:
- `convertTsxToCollie(tsx: string) => collie: string`
- `convertCollieToTsx(collie: string) => tsx: string`

### Action Items
1. Identify existing converter code:
   - CLI converter: `packages/cli/src/converter.ts`
   - any runtime stubs: `packages/html-runtime/src/collie-convert.ts`
2. Choose a stable home for conversion exports:
   - compiler package preferred, or
   - a small `packages/convert` if necessary
3. Export the minimal APIs above.
4. Keep CLI command behavior unchanged by delegating to the exported functions.

### Expected Behavior
- Extension can call conversion APIs directly (if you choose to integrate that way later).
- CLI continues to work.

### Notes (if not 100%)
- If TSX parsing relies on TS compiler APIs not currently included as a dependency in compiler, you may keep TSX→Collie in extension and only export Collie→TSX; note the dependency reason.

---

## Final Deliverable Definition (“Demo Ready”)

Minimum demo-ready after Stages 1–5:
- CLI can self-install missing required packages and proceed
- `collie init` creates Vite-friendly `collie.config.ts` + typings
- compiler emits PascalCase `#id` diagnostic with fix metadata
- core exposes formatter API + fix-all apply helper

Stages 6–7 are optional hardening / nice-to-haves.
