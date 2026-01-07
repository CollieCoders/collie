# Cleanup Plan (MVP: CLI + Compiler + Config + Vite)

Goal: keep only `packages/cli`, `packages/compiler`, `packages/config`, and `packages/vite` for the Vite-focused MVP. Everything else is evaluated for removal or partial retention, with a focus on safety and known dependencies.

## Super safe removals (no known runtime/build dependencies in the MVP)
These packages are not referenced by the four MVP packages and can be removed without affecting Vite-based CLI workflows.

- `packages/collie-tests`
  - Purpose appears to be internal test fixtures/workflows.
  - No references from `packages/cli`, `packages/compiler`, `packages/config`, or `packages/vite`.
- `packages/expo`
  - Mobile/Expo integration not used by Vite CLI flow.
  - No references from the MVP packages.
- `packages/storybook`
  - Storybook integration not used by Vite CLI flow.
  - No references from the MVP packages.

## Likely removable, but requires cleanup in CLI references/docs/templates
These packages are not needed for the Vite-only MVP, but they are referenced by the CLI or templates. Removing them requires edits (later) to avoid broken references.

- `packages/next`
  - The CLI has Next-specific logic and templates:
    - `packages/cli/src/nextjs-setup.ts`
    - `packages/cli/src/index.ts` (dependency lists and logic for `@collie-lang/next`)
    - `packages/cli/src/doctor.ts` (Next checks)
    - `packages/cli/templates/nextjs-*` (template scaffolding)
  - Removal is fine for a Vite-only MVP, but CLI should be simplified to drop Next commands/templates.
- `packages/webpack`
  - CLI declares a dependency on `@collie-lang/webpack` in `packages/cli/package.json`.
  - Likely tied to Next/legacy webpack usage.
  - Can be removed once CLI references are removed.
- `packages/html-runtime`
  - Referenced by `packages/cli/src/index.ts` as part of `COLLIE_VITE_PACKAGES`.
  - If your Vite MVP does not need a standalone HTML runtime package, this can be removed after updating CLI logic that references it.

## Conditional: may still be useful, but not required for the MVP
These are not used directly by the MVP packages, but they are part of the Vite developer story. Keep only if you still want the default React runtime/usage path.

- `packages/collie-react`
  - Referenced in Vite docs/README as the runtime import.
  - Not a dependency of `@collie-lang/vite` itself.
  - If the MVP is “CLI + Vite plugin only,” you can remove it, but you may want to keep it if the expected user workflow includes React runtime components.

## Notes on what stays (core MVP)
- `packages/cli`
- `packages/compiler`
- `packages/config`
- `packages/vite`

## Suggested order if you later proceed with removals (no code changes now)
1. Remove “super safe” packages: `collie-tests`, `expo`, `storybook`.
2. Clean CLI references to Next/webpack/html-runtime (then remove those packages).
3. Decide on `collie-react` based on whether the MVP should support a React runtime out of the box.

## Quick dependency checkpoints (for later)
- CLI references to non-MVP packages:
  - Next: `packages/cli/src/nextjs-setup.ts`, `packages/cli/src/index.ts`, `packages/cli/src/doctor.ts`, `packages/cli/templates/nextjs-*`
  - Webpack: `packages/cli/package.json` dependencies
  - HTML runtime: `packages/cli/src/index.ts`
- Vite docs mention React runtime:
  - `packages/vite/README.md`

If you want, I can follow this plan and produce a minimal set of edits to remove those packages and clean the CLI references in a second step.
