# Collie Demo Flow MVP — Core Repo Requirements

## Context & Problem

We want a crisp end-to-end demo that starts from a brand new Vite + React + TS project and shows:
- Collie can be installed and initialized quickly (with smart dependency checks)
- Vite dev server updates when Collie files change
- Collie produces structured diagnostics (including validation of `#id` format) that the VS Code extension can surface as hover + quick-fix
- Collie supports formatting / auto-fix (so the extension can implement Format Document and Fix All)
- Collie supports a “fallback” path back to TSX (extension copies to clipboard, but conversion logic may live in core)

This document defines what the **core `collie` repo** must provide to enable the demo.
The VS Code extension has its own companion document and owns editor UX and commands.

---

## Demo Starting Point

### Baseline project
- Fresh Vite project: `npm create vite@latest` (React + TypeScript)
- Dev server runs: `pnpm dev` or `npm run dev`

### Demo flow overview (what the audience sees)
1. Install Collie CLI
2. Run `collie init`
   - If required Collie packages are missing, Collie offers to install them and continues
3. Convert TSX selection -> Collie file (extension action, requires core conversion/compile conventions)
4. Edit Collie file and see HMR update in browser
5. Introduce invalid Collie and see diagnostics + quick fix
6. Use Format / Fix All to automatically correct formatting and fixable issues
7. Convert Collie -> TSX copied to clipboard (extension action; may require core conversion API)

---

## Responsibilities in THIS repo (`collie`)

## R1 — CLI: Dependency checks + self-healing installs

**Goal:** Any CLI command (especially `init`) should “just work” in a fresh project by verifying required packages exist and offering to install missing ones.

### R1.1 — What counts as “required packages”
Define a minimal set of packages needed for the demo flow. For example (names are placeholders; use your real package names):
- Collie CLI (already installed)
- Collie compiler package
- Collie runtime / html-runtime package (if required at runtime)
- Collie Vite plugin package (if Vite integration lives there)
- Any shared config/types package required by the above

**Important:** The required set may depend on:
- detected package manager (pnpm/npm/yarn)
- detected framework (Vite + React)
- the command being run (e.g. `collie init` might need fewer deps than `collie dev`)

### R1.2 — Behavior: check-before-run for *all* commands
For any command:
1) Detect project root (where package.json is).
2) Determine required packages for this command + project type.
3) Check whether they’re installed (either in `dependencies`/`devDependencies` OR resolvable from node_modules).
4) If all present → proceed.
5) If missing:
   - prompt user: “Missing required Collie packages: X, Y. Install now?”
   - If **No** → print a clear message and exit with non-error code (graceful exit).
   - If **Yes** → install missing packages, then continue executing the original command.

### R1.3 — Installation details (robustness)
- Detect package manager in this order:
  - lockfile detection (`pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`)
  - fallback to `npm` if unknown
- Install as devDependencies unless you have a strong reason otherwise.
- Provide clear output:
  - what will be installed
  - which package manager command is being run
  - what’s next if install fails

### R1.4 — Failure handling
- If install fails:
  - show the error
  - show the exact command the user can run manually
  - exit with non-zero code (because command truly failed)
- If user declines install:
  - exit gracefully with instructions like:
    - “Install missing deps then rerun: <command>”

**Acceptance checks:**
- In a fresh Vite project with only `collie` CLI installed:
  - `collie init` prompts to install missing required packages
  - choosing “Yes” installs and continues to create config
  - choosing “No” exits without crashing and with clear instructions
- Same behavior applies to at least one other command (so it’s clearly a shared preflight, not special-cased).

---

## R2 — CLI: `collie init` (Vite-based defaults)

**Goal:** In a fresh Vite project, `collie init` produces a working default config.

**Expected behavior:**
- Running `collie init` in a Vite + React + TS project:
  - creates `collie.config.ts` at repo root (or confirms if it already exists)
  - config uses **Vite-based defaults**
  - prints next steps clearly (e.g. “restart dev server if needed”, “extension commands available”, etc.)

**Config defaults should:**
- define input scanning defaults appropriate for Vite projects
  - include `src/**/*` by default
  - include `.collie` files anywhere under `src` (or entire repo if you prefer “architecturally agnostic”)
- define output defaults:
  - output folder strategy consistent with compiler/runtime (avoid watch loops)
- ensure the Vite plugin has enough info to:
  - compile Collie on-demand / watch mode
  - resolve imports used by the “placeholder injection” (extension will inject import + component usage)

**Acceptance checks:**
- Running `collie init` twice is safe (idempotent).
- If config exists, either no-op with message or require an explicit overwrite flag.

---

## R3 — Vite Dev Experience: watch + HMR correctness

**Goal:** After conversion creates a `.collie` file, editing it triggers recompilation and the browser updates.

**Expected behavior:**
- With Vite dev server running, changing a `.collie` file:
  - causes Collie compilation to re-run
  - results in updated JS/TS output that Vite serves
  - browser updates without manual refresh (HMR preferred; full reload acceptable if consistent)

**Constraints:**
- Avoid infinite rebuild loops (compiler writing to a watched folder that triggers itself repeatedly).
- Handle rapid saves without corrupted output.

**Acceptance checks:**
- Edit a text node in `.collie` and save: browser reflects change quickly.
- Multiple rapid saves do not crash watchers.

---

## R4 — Collie parsing + validation that powers diagnostics (and fixes)

**Goal:** Core must produce machine-readable diagnostics and provide fix/format capabilities that the extension can surface.

### R4.1 — `#id` validation rule (demo-specific)

**Rule (for demo):**
- A top-of-file `#id` directive must be **PascalCase**.
  - invalid: `#id my-component`
  - invalid: `#id myComponent`
  - valid: `#id MyComponent`

**Diagnostic behavior:**
- On invalid `#id`, core returns a diagnostic with:
  - file path (if analyzing a file)
  - range (line/column span that highlights the invalid token)
  - severity (Error)
  - message explaining rule and showing corrected value
  - stable code identifier (e.g. `COLLIE_ID_NOT_PASCAL_CASE`)

**Fix metadata behavior (for quick fixes / fix-all):**
- Provide an associated fix payload (or fix provider API) containing:
  - suggested replacement text (PascalCase form)
  - replace range
  - fix id/type so it can be applied individually or as part of fix-all

**Acceptance checks:**
- Invalid `#id` yields diagnostic immediately (on-save is acceptable if consistent).
- Applying fix removes the diagnostic.

### R4.2 — Syntax + formatting diagnostics shape
Even if you only demo `#id`, the plumbing must support:
- syntax errors (unexpected token, indentation errors, malformed directives)
- config errors (missing config, invalid paths)

Diagnostics should ideally include:
- a stable `code`
- a clear `message`
- a `range`
- optionally `relatedInformation` (nice-to-have)

---

## R5 — Formatting + Auto-fix (enables “Format Document” and “Fix All”)

**Goal:** Provide a canonical formatter for Collie files and optionally an auto-fix pipeline for fixable diagnostics.

There are two viable approaches; pick the simplest that matches your current architecture.

### Option A (recommended): One core API that formats + fixes
Provide core functions like:
- `formatCollie(text: string, options?): { formatted: string }`
- `lintCollie(text: string, options?): { diagnostics: Diagnostic[] }`
- `fixCollie(text: string, options?): { fixed: string, appliedFixes: Fix[] }`
- `fixAllCollie(text: string, options?): { fixed: string, appliedFixes: Fix[] }`

Where:
- `formatCollie` is purely formatting (whitespace/indent/quotes) and is always safe.
- `fix*` applies semantic fixes (like PascalCase `#id`) that are safe/obvious.

### Option B: Formatting is the fix-all (minimum viable)
If it’s easier:
- implement a formatter that also normalizes certain constructs (like `#id` casing).
- This is slightly “magical” but demo-friendly.

**Formatting expectations for demo:**
- stable indentation rules
- consistent spacing
- stable output (formatting twice yields same output)
- does not break valid code

**Fix-all expectations for demo:**
- ability to fix multiple instances in a file
- deterministic ordering (top to bottom)
- avoid overlapping edits (apply safely)

**Acceptance checks:**
- Given a Collie file with messy formatting, “format” yields clean formatting.
- Given a Collie file with multiple fixable issues, “fix all” yields a corrected file and removes those diagnostics.

---

## R6 — Conversion API surface (optional but strongly recommended)

The extension wants:
- TSX selection -> Collie syntax
- Collie file -> TSX syntax (clipboard)

Prefer core-owned conversion:

**Recommended core exports:**
- `convertTsxToCollie(tsx: string, options?): { collie: string, meta?: ... }`
- `convertCollieToTsx(collie: string, options?): { tsx: string, meta?: ... }`

**Conversion expectations for demo (minimum viable):**
- preserve text content and basic element structure
- preserve props names/values where possible
- must not generate broken syntax for the demo snippet

---

## R7 — Output conventions that support placeholder injection

Extension will replace selected TSX with a placeholder usage of the newly generated Collie component, requiring predictable import/exports.

Core should define/guarantee:
- export style (default vs named)
- component name derivation (from `#id` or filename)
- typing behavior (if any)
- import path conventions

**Acceptance checks:**
- After extension injects import + JSX usage, project builds.

---

## Demo Risks / Failure Modes to mitigate

- **Watch loop** from compiler output writing into watched folder
- **Flaky rebuild timing** causing browser not to update during demo
- **Diagnostics not structured** (only printed strings)
- **Formatter changes semantics** (avoid; formatting should be safe)
- **Preflight install prompts too chatty** (keep it minimal and confident)

---

## “Done” Definition for Core Repo (Demo Ready)

Core is demo-ready when:
- Any CLI command preflights dependencies and offers to install missing Collie packages
- `collie init` reliably generates `collie.config.ts` for Vite projects
- Editing `.collie` triggers rebuild and browser updates consistently
- Core emits structured diagnostics (with fix metadata) for invalid `#id`
- Core provides either:
  - formatting + fix-all APIs, OR
  - a formatter that can also normalize obvious issues

---

## Do NOT write tests

This demo MVP is about shipping the happy-path flow and editor experience.
Do not add or modify automated tests as part of this MVP work unless explicitly requested later.
