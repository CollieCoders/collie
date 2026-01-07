# Cleanup Plan (Staged) for MVP: CLI + Compiler + Config + Vite

Goal: keep only `packages/cli`, `packages/compiler`, `packages/config`, and `packages/vite` for the Vite-focused MVP. This plan is staged so you can approve/execute each stage independently.

## Stage 0: Current baseline (no changes)
What stays:
- `packages/cli`
- `packages/compiler`
- `packages/config`
- `packages/vite`

What is in scope to remove (later stages):
- `packages/collie-tests`
- `packages/expo`
- `packages/storybook`
- `packages/next`
- `packages/webpack`
- `packages/html-runtime`
- `packages/collie-react`

## Stage 1: Super safe removals
Rationale: these are not referenced by the MVP packages and do not appear in the CLI/Vite workflows.

Packages to remove:
- `packages/collie-tests`
- `packages/expo`
- `packages/storybook`

Checks (manual, optional):
- `pnpm -C packages/config build`
- `pnpm -C packages/compiler build`
- `pnpm -C packages/vite build`
- `pnpm -C packages/cli build`

## Stage 2: Remove Next and Webpack support from the CLI, then remove packages
Rationale: Next/webpack are explicitly referenced by the CLI and templates. Remove references first, then delete packages.

Edits to make (CLI cleanup):
- Remove Next-specific logic and templates:
  - `packages/cli/src/nextjs-setup.ts`
  - Next-related sections in `packages/cli/src/index.ts`
  - Next checks in `packages/cli/src/doctor.ts`
  - `packages/cli/templates/nextjs-*`
- Drop `@collie-lang/next` and `@collie-lang/webpack` from `packages/cli/package.json` dependencies.
- Update CLI help/docs to remove Next/webpack references (if present).

Packages to remove after cleanup:
- `packages/next`
- `packages/webpack`

Checks:
- `pnpm -C packages/cli build`
- `pnpm -C packages/vite build`

## Stage 3: Remove HTML runtime support from CLI and package
Rationale: `@collie-lang/html-runtime` is referenced by CLI dependency lists, but not needed for the Vite-only MVP.

Edits to make (CLI cleanup):
- Remove `@collie-lang/html-runtime` from `COLLIE_VITE_PACKAGES` in `packages/cli/src/index.ts`.
- Drop `@collie-lang/html-runtime` from any CLI messaging/docs.

Package to remove:
- `packages/html-runtime`

Checks:
- `pnpm -C packages/cli build`
- `pnpm -C packages/vite build`

## Stage 4: Decide on React runtime package
Rationale: `packages/collie-react` is not a dependency of `@collie-lang/vite`, but it is referenced in Vite docs and may be part of the default user experience.

Option A (remove it):
- Remove `packages/collie-react`.
- Update `packages/vite/README.md` to remove or replace React runtime references.

Option B (keep it for MVP docs/demo):
- Keep `packages/collie-react`.
- No code changes required.

Checks (if removed):
- `pnpm -C packages/vite build`

## Stage 5: Final verification (post-cleanup)
Run the full MVP build to confirm everything is still publishable:
- `pnpm -C packages/config build`
- `pnpm -C packages/compiler build`
- `pnpm -C packages/vite build`
- `pnpm -C packages/cli build`

## Reference map (for later execution)
- Next references:
  - `packages/cli/src/nextjs-setup.ts`
  - `packages/cli/src/index.ts`
  - `packages/cli/src/doctor.ts`
  - `packages/cli/templates/nextjs-*`
- Webpack references:
  - `packages/cli/package.json` dependencies
- HTML runtime references:
  - `packages/cli/src/index.ts`
- React runtime references:
  - `packages/vite/README.md`
