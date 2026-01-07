# Context & Problem
We have a pnpm monorepo (`collie`) with publishable packages under `packages/*`. We recently published some packages, but local builds and runtime usage are failing.

Current failures / symptoms:
1) CLI build warns that `import.meta` is empty in CJS output (CLI currently builds ESM+CJS, but `bin` points to CJS). This is a real runtime risk because the CLI uses `import.meta.url` to locate templates.
2) CLI DTS build fails with TS7016: TypeScript cannot find declarations for `@collie-lang/compiler` and resolves to `packages/compiler/dist/index.js` (implicitly any). So compiler typings/exports/build output are not aligned.
3) We need ONLY these packages stabilized and publishable at version **1.1.2**:
   - `@collie-lang/compiler`
   - `@collie-lang/config`
   - `@collie-lang/vite`
   - `@collie-lang/cli`

Constraints:
- The packages should build cleanly (`pnpm -r build` should succeed, at least for these packages).
- Outputs must be correct for Node tooling packages (compiler/cli/vite).
- Avoid bundling TypeScript into compiler output (it triggers dynamic require shims).
- No workspace protocol, no npm link assumptions.
- Do NOT write tests.

# Do NOT write tests
- Do NOT add tests.
- Do NOT modify existing tests or snapshots.
- Do NOT add CI changes.

# Scope / Allowed files
You may modify ONLY within:
- `packages/compiler/**`
- `packages/config/**`
- `packages/vite/**`
- `packages/cli/**`

You may also modify root tooling files ONLY if strictly necessary to make builds succeed (prefer not).

# Tasks

## A) Make `@collie-lang/compiler` a correct Node tooling library
Goal: It must run in Node without “Dynamic require of fs is not supported” errors, and it must export usable `.d.ts`.

1) Update `packages/compiler/tsup.config.ts`:
   - `platform: "node"`
   - `target: "node18"` (or node20)
   - Output formats: `["esm", "cjs"]` is OK
   - Ensure `dts: true` (or equivalent) produces `dist/index.d.ts`
   - Ensure **TypeScript is NOT bundled**:
     - set `external: ["typescript"]` at minimum
2) Ensure compiler `package.json` exports are consistent:
   - `"main": "./dist/index.cjs"`
   - `"module": "./dist/index.js"` (or `.mjs` if tsup outputs that)
   - `"types": "./dist/index.d.ts"`
   - `"exports".".".types` points to the same `./dist/index.d.ts`
3) Ensure compiler has a valid runtime dependency or peer dependency on `typescript`:
   - Prefer `dependencies.typescript` (simplest) OR `peerDependencies.typescript` + `devDependencies.typescript`
   - Pick the option that makes `npx collie init` work in a fresh npm project without hidden requirements.
4) Verify compiler build output filenames match package.json (`index.js` vs `index.mjs`, etc.). Fix config or package.json so they align.

## B) Make `@collie-lang/config` build cleanly and be Node-safe
Goal: config package must build without esbuild complaining it can’t resolve node builtins.

1) Update `packages/config/tsup.config.ts`:
   - `platform: "node"` (given current build pulls in node builtins)
   - `target: "node18"`
   - `format: ["esm", "cjs"]`
   - `splitting: false`
   - Ensure dts outputs `dist/index.d.ts`
2) Remove devDependencies that are not used by this package build (e.g. `tsx`) if present and unused, to avoid accidental bundling/imports.
3) Ensure package.json `types`/`exports.types` match emitted files.

## C) Make `@collie-lang/vite` correct as a Node-executed Vite plugin
Goal: plugin builds cleanly, relies on consumer’s Vite (peer dep), and has correct Node build settings.

1) Update `packages/vite/tsup.config.ts`:
   - `platform: "node"`
   - `target: "node18"`
   - `format: ["esm", "cjs"]`
   - `splitting: false`
   - `external` should include at least `vite` (and ideally `rollup` too).
   - Keep generating `dist/index.d.ts`
2) Ensure `packages/vite/package.json`:
   - `peerDependencies.vite` stays (supports v4-v7)
   - `devDependencies.vite` is allowed for development
   - exports/types point to correct dist files

## D) Fix `@collie-lang/cli` to avoid import.meta in CJS and fix DTS build
Goal: CLI must run via `bin` (CJS) and build `.d.ts` without TS7016.

1) Change CLI build to **CJS-only** (recommended for executable):
   - Update `packages/cli/tsup.config.ts`:
     - `format: ["cjs"]`
     - `platform: "node"`
     - `target: "node18"`
     - `banner.js: "#!/usr/bin/env node"`
     - `external: [/^node:/, /^[^.\/]/]`
     - `dts: true`
     - `splitting: false`
2) Remove or refactor any usage of `import.meta.url` in CLI source (ex: `src/creator.ts`):
   - The CLI must be able to locate its templates directory reliably when executed via the CJS `bin`.
   - Implement a robust template-path resolver based on `process.argv[1]` (path to executed script) or `__dirname` in the compiled CJS output.
   - Do NOT rely on `import.meta.url` in code that will execute under CJS.
3) Fix TS7016 (compiler types missing):
   - Ensure `@collie-lang/compiler` emits `dist/index.d.ts` and exports it correctly.
   - Ensure CLI imports `@collie-lang/compiler` only through the package root (`@collie-lang/compiler`), not a subpath without types.
   - After fixing compiler, ensure `packages/cli` dts build succeeds.

## E) Versioning + publish readiness (1.1.2)
We want to publish **1.1.2** of these packages.
- Set versions of `compiler`, `config`, `vite`, and `cli` to `1.1.2` (if any are not already).
- Update internal dependency ranges among these four packages to `^1.1.2` where applicable so they stay in sync.
- Ensure each package has:
  - `"files": ["dist"]`
  - `"prepack": "pnpm run build"`
  - `"publishConfig": { "access": "public" }`

## F) Validation steps (must pass)
After changes, these commands must succeed:

1) Build just the four packages:
   - `pnpm -C packages/compiler build`
   - `pnpm -C packages/config build`
   - `pnpm -C packages/vite build`
   - `pnpm -C packages/cli build`

2) Verify dist contents include types where expected:
   - `packages/compiler/dist/index.d.ts` exists
   - `packages/cli/dist/index.d.ts` exists
   - `packages/vite/dist/index.d.ts` exists
   - `packages/config/dist/index.d.ts` exists

3) Smoke-run the CLI from the built output:
   - `node packages/cli/dist/index.cjs --help` (or equivalent)
   - `node packages/cli/dist/index.cjs init` should run far enough to validate template path resolution (no import.meta issues)

# Output Requirements
- Make minimal changes required.
- Keep code clean and direct; avoid overengineering.
- Leave short comments only where future maintainers need context (e.g., why we avoid import.meta in CJS CLI).
- Do NOT write tests.