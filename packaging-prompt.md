# Context & Problem
We have a pnpm monorepo (`collie`) containing multiple publishable packages under `packages/*`. We removed pnpm workspace protocol usage (`workspace:*`) and replaced internal references with semver, and we reset all package versions to `1.1.1`. Nothing has been published publicly yet.

We need:
1) A thorough audit of every `packages/*/package.json` to ensure dependencies vs devDependencies vs peerDependencies are correct and consistent for npm consumption.
2) A reliable local testing flow so we can test changes from this monorepo inside an external, npm-based Vite template repo without publishing packages to npm and WITHOUT using `workspace:*` and WITHOUT using `npm link`.

IMPORTANT:
- The `collie` repo uses pnpm.
- The template repo uses npm.
- We cannot rely on workspace protocol or npm linking.
- The local test flow must be repeatable and not fragile (no type duplication from multiple Vite installs).
- Do NOT write tests.

# Do NOT write tests
- Do NOT add or modify tests.
- Do NOT change any test snapshots.
- Do NOT add new CI workflows.

# Tasks

## A) Package.json dependency classification audit (packages/*)
For each package under `packages/*`:
1) Ensure `dependencies` includes ONLY runtime-required packages.
2) Ensure `devDependencies` includes build tooling and type tooling (tsup, typescript when only for build, @types/*, vitest, etc.)
3) Ensure `peerDependencies` is used for host/framework packages where the consumer must provide the instance:
   - `@collie-lang/vite` => peerDependency on `vite` (keep broad major support if intended)
   - `@collie-lang/webpack` => peerDependency on `webpack`
   - `@collie-lang/next` => peerDependency on `next`
   - `@collie-lang/react` => peerDependency on `react` (and optionally `react-dom` only if truly required by runtime)
4) It is OK to also list a peer dependency as a devDependency for local development (common practice).
5) Ensure no package.json contains any `workspace:` references anywhere (dependencies/dev/peer/optional).
6) Ensure each publishable package has:
   - `files: ["dist"]` (or equivalent) so installs don’t pull source tree junk
   - `main/module/types/exports` pointing at dist outputs (already mostly present; verify)
   - a `prepack` script that builds before packing (to guarantee dist exists in tarballs)

Add/standardize:
- `scripts.prepack`: run the package build (ex: `pnpm run build`)
- `scripts.clean`: ok as-is
- keep versions at `1.1.1` everywhere

Be conservative: do not reshuffle dependencies unless it’s clearly wrong.

## B) Implement “local tarball publishing” flow for npm template testing (NO npm link)
Add a root-level script that:
1) Builds all publishable packages (not private ones like tests unless needed).
2) Produces npm-compatible `.tgz` tarballs for each publishable package into a deterministic folder:
   - e.g. `./.local-packs/`
3) Prints (and optionally writes) a copy/pastable install command that can be run inside the external template repo.

Requirements:
- The tarballs must be created in a way npm understands (`npm pack`), even though this repo uses pnpm.
- The process must not require publishing to npm registry.
- The tarballs must include built dist outputs (use `prepack` + build).
- It must install cleanly in an npm project (no `workspace:` / no pnpm-specific protocol).
- The flow must avoid the “two Vite type universes” issue; the plugin must rely on the template’s Vite via peerDependencies.

Implementation idea:
- Add a Node script: `scripts/local-pack.mjs`
  - Enumerate `packages/*/package.json`
  - Skip `private: true`
  - Run `pnpm -r --filter ... build` (or per-package build) to ensure dist exists
  - Run `npm pack --silent --pack-destination <root>/.local-packs` inside each package directory
  - Emit the list of tarballs created (absolute or relative paths)
  - Emit a single recommended npm install command for the template:
    - `npm i -D <tgz paths for build-time packages like @collie-lang/vite> ...`
    - and `npm i <tgz paths for runtime packages like @collie-lang/react> ...`
  - Also write a machine-readable manifest: `./.local-packs/manifest.json` with packageName -> tgz filename mapping
- Add root scripts:
  - `pnpm local:pack` => runs `node scripts/local-pack.mjs`
  - `pnpm local:clean` => deletes `./.local-packs`

Do NOT use `npm link`. Do NOT add workspace protocol back.

## C) Developer ergonomics
Add a short doc snippet in the collie repo README (or a new `docs/local-testing.md`) describing:
- `pnpm local:pack`
- then in the template repo: `npm install <tgz paths>`
Keep it minimal.

# Acceptance Criteria
- Every `packages/*/package.json` is free of `workspace:` protocol.
- Host packages (`vite`, `webpack`, `next`, `react`) are peers where appropriate.
- Publishable packages can be `npm pack`’d successfully and installed in an npm project without errors.
- A single command flow exists:
  1) `pnpm local:pack` in collie repo
  2) `npm install ...tgz...` in template repo
- No npm linking required.
- No tests added/changed.
- The solution is stable and repeatable.