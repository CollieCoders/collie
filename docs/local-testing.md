# Local Testing Guide

This guide explains how to test Collie packages locally in external npm projects without publishing to npm.

## Overview

The Collie monorepo uses **pnpm**, but you can test packages in **npm-based** projects using npm-compatible tarballs. This approach:

- ✅ Works with npm projects (no pnpm required in the test project)
- ✅ Avoids `npm link` fragility and type conflicts
- ✅ Mirrors real npm install behavior
- ✅ Is repeatable and clean

## Quick Start

### 1. Build and Pack Collie Packages

In the **Collie monorepo** (this repo), run:

```bash
pnpm local:pack
```

This will:
1. Build all publishable packages
2. Create `.tgz` tarballs in `.local-packs/`
3. Generate a `manifest.json`
4. Print install commands

### 2. Install in Your Test Project

Copy the install command(s) printed by `local:pack` and run them in your **external npm project**.

For example:

```bash
# In your Vite + React template project (uses npm)
npm install /absolute/path/to/collie/.local-packs/collie-lang-react-1.1.1.tgz \
            /absolute/path/to/collie/.local-packs/collie-lang-vite-1.1.1.tgz \
            /absolute/path/to/collie/.local-packs/collie-lang-compiler-1.1.1.tgz
```

Or install as dev dependencies for build-time packages:

```bash
npm install -D /path/to/collie/.local-packs/collie-lang-vite-1.1.1.tgz
npm install /path/to/collie/.local-packs/collie-lang-react-1.1.1.tgz
```

### 3. Test Your Changes

Use your test project as normal. The installed packages come from your local builds.

### 4. Iterate

When you make changes to Collie packages:

1. Run `pnpm local:pack` again in the Collie repo
2. Re-run the install command in your test project to update

npm will replace the old tarballs with the new ones.

## Clean Up

To remove generated tarballs in the Collie repo:

```bash
pnpm local:clean
```

## How It Works

- Each publishable package has a `prepack` script that runs `pnpm run build` before packing
- `npm pack` creates standard `.tgz` files that `npm install` understands
- The tarballs include only `dist/` and metadata (no source code)
- Peer dependencies (like `vite`, `react`) must be provided by your test project

## Notes

- Packages must be installed via **absolute or relative paths** to the `.tgz` files
- No need for `workspace:` protocol or `npm link`
- The `.local-packs/` directory is git-ignored
- Tarballs are npm-compatible even though the Collie repo uses pnpm
