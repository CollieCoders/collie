# Collie Demo Checklist (MVP)

> **Purpose**
> This checklist is used to manually verify the Collie demo flow after each implementation stage.
> It is intentionally explicit and conservative to catch demo-breaking edge cases early.

---

## A. Fresh Project & Dependency Sanity

### A1. Create a fresh Vite + React + TypeScript project

```bash
npm create vite@latest collie-demo -- --template react-ts
cd collie-demo
```

* ✅ Project scaffolds successfully
* ✅ `npm run dev` works *before* installing Collie

---

### A2. Install **only** the Collie CLI

```bash
npm i -D @collie-lang/cli
```

* ❗ Do **not** install any other `@collie-lang/*` packages manually
* This simulates a real first-time user

---

### A3. Run `collie init` (Dependency Preflight Verification)

```bash
npx collie init
```

Verify **all** of the following:

* ✅ CLI detects missing required `@collie-lang/*` packages
  (compiler, Vite plugin, runtime, config, etc.)
* ✅ CLI prompts clearly:

  > “Missing required Collie packages: … Install now?”
* ✅ Choosing **Yes**:

  * installs required packages as devDependencies
  * continues running `collie init`
* ✅ Choosing **No**:

  * exits gracefully
  * prints clear next-step instructions
* ✅ Re-running `collie init` after installation:

  * does **not** prompt again
  * is idempotent

> ⚠️ If this fails, the demo can break before it starts.

---

## B. `collie init` Output Verification

### B1. Config generation

After `collie init`, verify:

* ✅ `collie.config.ts` exists at project root
* ✅ Config uses Vite-appropriate defaults
* ✅ No duplicate or legacy `.js` config is generated
* ✅ CLI output explains next steps clearly

---

### B2. TypeScript `.collie` module typing

Verify **one** of the following is true:

* ✅ `src/collie.d.ts` (or equivalent) exists and declares `.collie` modules
  **OR**
* ✅ `collie init` prints clear instructions on how `.collie` typings are provided

Then verify:

```bash
npm run build
```

* ✅ TypeScript build succeeds
* ❌ No “Cannot find module '*.collie'” errors

---

## C. Vite Dev Loop & Watch Behavior

### C1. Start dev server

```bash
npm run dev
```

* ✅ Dev server starts cleanly
* ✅ No Collie-related warnings or errors

---

### C2. Verify `.collie` file is imported

* Create or locate a `.collie` file
* Ensure it is **actually imported** by a TSX file used by the app

> ℹ️ Vite will not watch unused files — this is expected.

---

### C3. Edit `.collie` and observe browser update

* Change visible text inside the `.collie` file
* Save the file

Verify:

* ✅ Browser updates within ~1–2 seconds
* ✅ Update occurs without manual refresh
* 📝 Note whether this is:

  * HMR update, or
  * full page reload (both acceptable for MVP)

> ⚠️ If updates are flaky or inconsistent, record behavior.

---

## D. Diagnostics & Fixes (Stage 1+)

### D1. Invalid `#id` diagnostic

In a `.collie` file, set:

```collie
#id my-component
```

Verify:

* ✅ Inline error diagnostic appears
* ✅ Diagnostic highlights only the invalid id portion
* ✅ Error message explains PascalCase requirement

---

### D2. Quick fix (single)

* Hover over the error
* Apply quick fix (e.g. “Convert to PascalCase”)

Verify:

* ✅ `#id` becomes `MyComponent`
* ✅ Diagnostic disappears immediately

---

### D3. Fix-All behavior (Stage 2+)

If multiple fixable issues exist:

* Run “Fix all Collie issues”
  **OR**
* Run “Format Document” (if formatting doubles as fix-all)

Verify:

* ✅ All fixable issues are resolved in one action
* ✅ No overlapping or corrupted edits

---

## E. Formatting (Stage 3+)

### E1. Formatter stability

* Intentionally mess up spacing/indentation in a `.collie` file
* Run format (`collie format` or editor Format Document)

Verify:

* ✅ Formatting is clean and consistent
* ✅ Formatting twice produces identical output
* ❌ No semantic changes to valid code

---

## F. Conversion & Fallback (Stage 7+ / Extension-Driven)

> These steps verify integration expectations from the core side.

### F1. Convert `.collie` → TSX

* Convert a `.collie` file to TSX (via CLI or extension)
* Paste into a TSX file

Verify:

* ✅ TSX compiles
* ✅ Rendered output matches `.collie` version

---

## G. Regression Safety Checks

After **any** stage:

* ✅ `npm run dev` still works
* ✅ `npm run build` still works
* ✅ No new warnings about missing `@collie-lang/*` packages
* ✅ No infinite rebuild loops or runaway CPU usage

---

## Demo Snippet Guidelines (Important)

**Recommended demo snippets:**

* Single component
* Mostly static markup
* Minimal props
* No hooks or complex expressions
* No heavy conditionals

**Known MVP limitations (acceptable):**

* Complex TSX expressions may not round-trip perfectly
* Fix-all coverage may be limited to specific rules (e.g. `#id`)
* Full HMR granularity may be deferred

---

## Core Implementation Pointers (for reference)

* CLI entry & command dispatch
  `packages/cli/src/index.ts`
* Compiler diagnostics & fix metadata
  `packages/compiler/src/diagnostics.ts`
* Parser directive handling (`#id`)
  `packages/compiler/src/parser.ts`
* Formatter implementation
  `packages/cli/src/formatter.ts`
* Vite plugin integration
  `packages/vite/src/index.ts`