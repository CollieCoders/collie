Overall MVP readiness: ~35%. The repo already has a working compiler + Vite plugin + CLI command surface, but the demo-critical items (preflight installs, Vite-focused `collie init`, PascalCase `#id` diagnostics with fix metadata, and a formatter/fix-all API for the extension) are either missing or only partially implemented, so the demo flow would break without targeted fixes. `packages/compiler/src/index.ts` `packages/cli/src/index.ts` `packages/vite/src/index.ts`

Per-part completion estimates: Overall 35% | 1) 95% | 2) 30% | 3) 10% | 4) 40% | 5) 30% | 6) 60% | 7) 50% | 8) 100%

## 1. Repo Map (Ownership & Key Entrypoints)
- `packages/cli` — CLI entry/command dispatch (`packages/cli/src/index.ts`), project scaffolding (`packages/cli/src/creator.ts`), templates (`packages/cli/templates/*`), bin entry (`packages/cli/package.json`)
- `packages/compiler` — parser + diagnostics + codegen + compile API (`packages/compiler/src/index.ts`, `packages/compiler/src/parser.ts`, `packages/compiler/src/diagnostics.ts`, `packages/compiler/src/codegen.ts`, `packages/compiler/src/dialect.ts`)
- `packages/config` — config types, load/normalize (`packages/config/src/types.ts`, `packages/config/src/index.ts`, `packages/config/src/normalize.ts`)
- `packages/vite` — Vite plugin for `.collie` (`packages/vite/src/index.ts`)
- `packages/webpack` — Webpack loader (`packages/webpack/src/index.ts`)
- `packages/next` — Next.js wrapper + detection (`packages/next/src/index.ts`, `packages/next/src/detect.ts`)
- `packages/expo` — Metro transformer (`packages/expo/src/index.ts`, `packages/expo/src/metro-transformer.ts`)
- `packages/storybook` — Storybook Vite/Webpack wiring (`packages/storybook/src/index.ts`)
- `packages/html-runtime` — HTML runtime + conversion stub (`packages/html-runtime/src/collie-html-runtime.ts`, `packages/html-runtime/src/collie-convert.ts`)
- `packages/collie-tests` — CLI/Vite test harness (`packages/collie-tests/src/harness/*`, `packages/collie-tests/src/tests/*`)

## 2. Requirement-by-Requirement Traceability (from DEMO_FLOW_MVP.md)

### R1 — CLI preflight dependency checks
Status: ❌ Missing  
Where in code: `packages/cli/src/index.ts`, `packages/cli/src/doctor.ts`  
How it works today: No shared preflight wrapper; dependency checks only exist in `collie doctor` and are not invoked by other commands. `packages/cli/src/doctor.ts` `packages/cli/src/index.ts`  
Gaps / mismatches: No project-root discovery for any command, no prompt to install missing Collie deps, no “continue after install” flow, no graceful “decline install” exit. `packages/cli/src/index.ts`  
Demo risk level: High

### R2 — CLI `collie init` (Vite defaults)
Status: 🟡 Partial  
Where in code: `packages/cli/src/index.ts`  
How it works today: `collie init` writes a minimal config (defaulting to `collie.config.js`) with `projects: [{ type, input: "src/**/*.collie" }]` and CSS detection, and prompts before overwriting. `packages/cli/src/index.ts`  
Gaps / mismatches: Does not generate `collie.config.ts`, does not patch `vite.config`, does not ensure `.collie` typings, and explicitly states it doesn’t install deps or wire frameworks. `packages/cli/src/index.ts`  
Demo risk level: Medium–High

### R3 — Vite dev experience: watch + HMR
Status: 🟡 Partial  
Where in code: `packages/vite/src/index.ts`, `packages/compiler/src/index.ts`  
How it works today: The Vite plugin compiles `.collie` on `load()` via `compileToTsx`, then uses esbuild to output JS; Vite handles file watch. `packages/vite/src/index.ts` `packages/compiler/src/index.ts`  
Gaps / mismatches: No explicit `handleHotUpdate` or HMR policy, no guarantee of full reload vs HMR for `.collie`, and no explicit watch for non-imported files. `packages/vite/src/index.ts`  
Demo risk level: Medium

### R4 — Diagnostics + fix metadata (incl. PascalCase `#id`)
Status: 🟡 Partial  
Where in code: `packages/compiler/src/diagnostics.ts`, `packages/compiler/src/parser.ts`, `packages/compiler/src/dialect.ts`, `packages/cli/src/checker.ts`  
How it works today: Diagnostics include severity, code, and ranges; parser emits spans; `collie check` can output JSON. Fix metadata exists for dialect token normalization. `packages/compiler/src/diagnostics.ts` `packages/compiler/src/parser.ts` `packages/compiler/src/dialect.ts` `packages/cli/src/checker.ts`  
Gaps / mismatches: No PascalCase validation for `#id` or fix suggestion; no stable diagnostic code for that rule; no fix-all pipeline. `packages/compiler/src/parser.ts` `packages/compiler/src/diagnostics.ts`  
Demo risk level: High

### R5 — Formatting + auto-fix
Status: 🟡 Partial  
Where in code: `packages/cli/src/formatter.ts`, `packages/cli/src/index.ts`  
How it works today: CLI formatter parses and serializes Collie, with diagnostics returned on error. `packages/cli/src/formatter.ts` `packages/cli/src/index.ts`  
Gaps / mismatches: Formatter is not exposed as a core API for the extension; there is no fix-all or fix application pipeline. `packages/cli/src/formatter.ts`  
Demo risk level: Medium–High

### R6 — Conversion API surface
Status: 🟡 Partial  
Where in code: `packages/cli/src/converter.ts`, `packages/cli/src/index.ts`, `packages/compiler/src/index.ts`  
How it works today: CLI can convert TSX/JSX to `.collie`; compiler can generate TSX from Collie but not as a dedicated conversion API. `packages/cli/src/converter.ts` `packages/compiler/src/index.ts`  
Gaps / mismatches: No core-exported `convertTsxToCollie` / `convertCollieToTsx` API for the extension. `packages/cli/src/converter.ts` `packages/compiler/src/index.ts`  
Demo risk level: Medium

### R7 — Output conventions for placeholder injection
Status: 🟡 Partial  
Where in code: `packages/compiler/src/codegen.ts`, `packages/compiler/src/index.ts`, `packages/vite/src/index.ts`, `packages/cli/templates/vite-react-ts/src/App.tsx`, `packages/cli/templates/vite-react-ts/src/collie.d.ts`  
How it works today: Compiled modules default-export a component function; Vite plugin uses a filename-based componentNameHint; templates use default imports and a `.collie` module typing. `packages/compiler/src/codegen.ts` `packages/vite/src/index.ts` `packages/cli/templates/vite-react-ts/src/App.tsx` `packages/cli/templates/vite-react-ts/src/collie.d.ts`  
Gaps / mismatches: No explicit convention tying `#id` to component name, and `collie init` doesn’t add `collie.d.ts` or patch Vite config for imports. `packages/compiler/src/index.ts` `packages/cli/src/index.ts`  
Demo risk level: Medium

## 3. CLI Dependency Preflight (Deep Dive)
- Where to implement preflight: wrap command dispatch in `main()` so every command runs through a preflight gate before executing `runInit`, `runCheck`, `runBuild`, etc. `packages/cli/src/index.ts`
- Current package manager detection: lockfile-based detection exists (`pnpm-lock.yaml` → pnpm, `yarn.lock` → yarn, else npm). `packages/cli/src/index.ts`
- Install invocation today: helper exists to install devDependencies with `pnpm add -D` / `yarn add -D` / `npm install -D`. `packages/cli/src/index.ts`
- Safe install strategy for monorepos: preflight should resolve the nearest `package.json` and run installs in that folder (not workspace root), then report the exact command on failure. There is no existing “find nearest package.json” helper. `packages/cli/src/index.ts`
- Current behavior: no preflight is called; only `collie doctor` checks deps and does not install. `packages/cli/src/doctor.ts`

## 4. Diagnostics + Fix Metadata (Deep Dive)
- Diagnostic pipeline: `parseCollie` emits structured diagnostics, and `compileToTsx` normalizes range/file info. `packages/compiler/src/parser.ts` `packages/compiler/src/index.ts`
- Programmatic diagnostic shape: `Diagnostic` supports severity, message, code, span/range, and `fix`. `packages/compiler/src/diagnostics.ts`
- Range reliability: parser uses `createSpan` for line/column offsets; `normalizeDiagnostics` promotes span → range. `packages/compiler/src/parser.ts` `packages/compiler/src/diagnostics.ts` `packages/compiler/src/index.ts`
- Existing fix metadata: dialect token enforcement generates a `fix` payload for preferred tokens. `packages/compiler/src/dialect.ts`
- Smallest change for PascalCase `#id`: add a check in the `#id` parsing block, emit a new stable `DiagnosticCode` with a `fix` replacement range for the `#id` value, and include a normalized PascalCase suggestion. `packages/compiler/src/parser.ts` `packages/compiler/src/diagnostics.ts`
- Minimal fix-all strategy: add a helper that applies non-overlapping `Diagnostic.fix` edits in source-order and expose it as `fixAllCollie`. `packages/compiler/src/diagnostics.ts`

## 5. Formatting / Fix-All Capability (Deep Dive)
- Formatter exists today: CLI uses `formatSource` to parse + serialize Collie. `packages/cli/src/formatter.ts` `packages/cli/src/index.ts`
- Formatter entry points: invoked by `collie format` only; not exported for editor use. `packages/cli/src/index.ts`
- Simplest compatible approach: move `formatSource` into the compiler package (or re-export it) so the extension can call it directly, then implement `fixCollie`/`fixAllCollie` on top of `Diagnostic.fix`. `packages/cli/src/formatter.ts` `packages/compiler/src/diagnostics.ts`
- Recommended strategy: format-only + separate fix pipeline to keep semantic fixes explicit and demo-safe. `packages/cli/src/formatter.ts`
- Tricky syntax to preserve: JSX passthrough blocks and multiline attribute parsing. `packages/cli/src/formatter.ts` `packages/compiler/src/parser.ts`

## 6. Vite Dev Loop & Watch Behavior (Deep Dive)
- Hook into Vite: `.collie` compilation happens inside the Vite plugin `load()` hook. `packages/vite/src/index.ts`
- Rebuild triggers: Vite will re-invoke `load()` when an imported `.collie` file changes; compiled output stays in memory. `packages/vite/src/index.ts`
- Output location: no on-disk output; transformed JS is returned to Vite. `packages/vite/src/index.ts`
- Infinite loop risk: low, since no files are written to watched paths. `packages/vite/src/index.ts`
- HMR vs full reload: not explicitly handled; HMR behavior depends on Vite’s default module invalidation. `packages/vite/src/index.ts`

## 7. Output Conventions for Placeholder Injection
- Compiled export style: default export function with a `Props` type/interface. `packages/compiler/src/codegen.ts`
- Component name derivation today: Vite plugin uses filename + `Template` suffix; `#id` only influences compile metadata, not component naming. `packages/vite/src/index.ts` `packages/compiler/src/index.ts`
- Expected TSX import style: default import of `.collie` files is shown in Vite templates. `packages/cli/templates/vite-react-ts/src/App.tsx`
- Typing output: `.collie` module typing is present in templates but not auto-generated by `collie init`. `packages/cli/templates/vite-react-ts/src/collie.d.ts` `packages/cli/src/index.ts`

## 8. Demo-Ready Minimal Plan (No Over-Engineering)
1. CLI — add a shared preflight wrapper in `packages/cli/src/index.ts` that detects the nearest project root, computes required Collie deps per command + framework, prompts to install, and re-runs the original command or exits gracefully on decline. `packages/cli/src/index.ts`
2. CLI — update `collie init` to default to `collie.config.ts`, include Vite-specific defaults (inputs + output), and call the existing `patchViteConfig`, `ensureCollieDeclaration`, and `installDevDependencies` helpers when Vite is detected. `packages/cli/src/index.ts`
3. Compiler — implement PascalCase `#id` validation with a stable diagnostic code and `fix` metadata, using a precise range for the invalid id value. `packages/compiler/src/parser.ts` `packages/compiler/src/diagnostics.ts`
4. Compiler — expose a formatter API (move or re-export `formatSource`) and add a minimal `fixAllCollie` helper that applies `Diagnostic.fix` entries top-to-bottom. `packages/cli/src/formatter.ts` `packages/compiler/src/diagnostics.ts`
5. Compiler/CLI — surface TSX⇄Collie conversion as core APIs by relocating or re-exporting the CLI converter, while keeping CLI behavior unchanged. `packages/cli/src/converter.ts` `packages/compiler/src/index.ts`
6. Vite plugin — optionally add a `handleHotUpdate` hook to force a consistent full reload or explicit HMR update for `.collie` files to reduce demo flakiness. `packages/vite/src/index.ts`

Breaking changes to avoid: keep CLI command names and flags stable; do not rename existing packages; avoid changing output default export style. `packages/cli/src/index.ts` `packages/compiler/src/codegen.ts`

Top 5 demo derailers:
1. Missing preflight install = `collie init` fails in a fresh Vite project. `packages/cli/src/index.ts`
2. No PascalCase `#id` diagnostic/fix = extension quick-fix demo fails. `packages/compiler/src/parser.ts`
3. Formatter not callable from core = Format Document demo blocked. `packages/cli/src/formatter.ts`
4. HMR behavior not deterministic = dev-loop demo flakiness. `packages/vite/src/index.ts`
5. Missing `.collie` typings or Vite wiring = placeholder injection compile errors. `packages/cli/src/index.ts` `packages/cli/templates/vite-react-ts/src/collie.d.ts`
