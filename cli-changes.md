# Context & Problem
The Collie CLI command `npx collie init` currently creates `collie.config.ts` and attempts to wire Collie into `vite.config.*`, but it does **not** proactively check for required `@collie-lang/*` dependencies and install any that are missing.

We want `collie init` to behave like a good “doctor + initializer” for Vite projects:
1) User runs `npx collie init`
2) CLI verifies it’s a **Vite project** (keep this simple: just check for a `vite.config.*` file)
3) If it’s a Vite project, CLI checks for all required `@collie-lang/*` deps; if any are missing, it installs all missing ones
4) The rest of the init flow stays the same (create/overwrite Collie config as it currently does; patch Vite config as it currently does)

# Do NOT write tests
- Do NOT add or modify tests.
- Do NOT add a new test framework.
- Do NOT change existing test setup.

# Required behavior (must implement)
## A) Determine “Vite project” by presence of config file
- Treat the project as a Vite project if **any** of these exist at the project root:
  - `vite.config.ts`
  - `vite.config.js`
  - `vite.config.mjs`
  - `vite.config.cjs`
- If none exist:
  - Print a clear error message (red) indicating `collie init` currently requires a Vite project and that no `vite.config.*` was found.
  - Exit with a non-zero code (throw or `process.exit(1)` depending on existing CLI patterns).

## B) Required `@collie-lang/*` packages
When a Vite project is detected, ensure these packages are present:

### runtime dependency (dependencies)
- `@collie-lang/react`  ✅ must be in `"dependencies"` (NOT devDependencies)

### build tooling (devDependencies)
- `@collie-lang/vite`
- `@collie-lang/compiler`
- `@collie-lang/config`

Notes:
- `@collie-lang/cli` is already present because the user ran `npx collie init` / installed it, but do not assume; do not “install cli” unless you truly need it (you probably don’t).
- If a required package is present but in the wrong section (ex: `@collie-lang/react` is in devDependencies), treat that as “not satisfied” and fix it by moving it to the correct bucket (installing to the correct bucket is acceptable; we don’t need to manually edit package.json if the package manager command will do it).
- If `package.json` is missing, fail with a clear message (this init flow assumes a node project).

## C) Install missing required packages (only if needed)
- Compute missing packages by reading `package.json`:
  - Treat `dependencies` and `devDependencies` as the only places to check.
- If any required packages are missing or in the wrong bucket:
  - Install the missing runtime dep(s) and missing dev dep(s) using the detected package manager.
  - Do this **before** continuing to the rest of the init flow (before writing config / patching Vite config).

### Package manager detection and commands
- Use existing package manager detection logic in the CLI (there is already `detectPackageManager(root)` in `packages/cli/src/index.ts`).
- Use existing spawn helper `runCommand(command, args, cwd)` already in `packages/cli/src/index.ts`.
- Commands must be:
  - npm:
    - runtime deps: `npm i <pkgs...>`
    - dev deps: `npm i -D <pkgs...>`
  - pnpm:
    - runtime deps: `pnpm add <pkgs...>`
    - dev deps: `pnpm add -D <pkgs...>`
  - yarn:
    - runtime deps: `yarn add <pkgs...>`
    - dev deps: `yarn add -D <pkgs...>`

### Version pinning (keep packages in sync)
- Prefer installing required `@collie-lang/*` packages at the **same version range** as the installed `@collie-lang/cli` in the user’s project (read it from package.json `devDependencies` or `dependencies`).
  - Example: if `@collie-lang/cli` is `^0.7.8`, install `@collie-lang/react@^0.7.8`, `@collie-lang/vite@^0.7.8`, etc.
- If `@collie-lang/cli` is not found in package.json for some reason, fall back to installing without an explicit version (let the package manager choose latest).
- Be resilient to odd specs like `workspace:*` or `file:` — in those cases, just install without pinning (or use the same spec if it’s safe).

## D) Respect `--no-install` if already supported
- `runInit` already accepts `noInstall?: boolean` in `InitOptions`.
- If `noInstall` is true:
  - Do NOT install anything.
  - Print a warning listing the missing packages and the exact install command(s) the user should run (based on detected package manager), then continue the init process as-is.

## E) Rest of the init flow must remain the same
After the dependency check/install step:
- Continue with the existing behavior:
  - create/update `collie.config.ts` as currently implemented
  - patch `vite.config.*` as currently implemented

# Where to implement
- Primary implementation should be in:
  - `packages/cli/src/index.ts`
- Add small helper functions in that same file if it keeps things clean (don’t create new files unless absolutely necessary).
- Do NOT edit build artifacts like `packages/cli/dist/**` (those are generated).

# Acceptance criteria
- Running `npx collie init` in a project with `vite.config.ts` but missing some required `@collie-lang/*` packages installs the missing ones in the correct buckets, then continues init normally.
- Running `npx collie init` in a folder with no `vite.config.*` fails fast with a clear error and non-zero exit code.
- `--no-install` mode does not install packages; it prints actionable commands and still performs the non-install parts of init.
- No tests added/modified.

# Implementation guidance (strong suggestions)
- Add a function like `findViteConfigPath(projectRoot): string | null` that checks the 4 possible filenames.
- Add a function like `getCollieVersionSpec(packageJson): string | null` that returns the installed `@collie-lang/cli` spec if present and usable.
- Add a function like `computeMissingCollieDeps(packageJson)` that returns:
  - `missingRuntime: string[]` (for dependencies)
  - `missingDev: string[]` (for devDependencies)
  - and handles “present but wrong bucket”.
- Add a function like `installPackages(packageManager, runtimePkgs, devPkgs, cwd)` that calls `runCommand` with the right args.