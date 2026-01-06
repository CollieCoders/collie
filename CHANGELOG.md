# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- compiler: PascalCase `#id` diagnostic with fix metadata.
- compiler: fix-all helpers to apply diagnostic fixes programmatically.
- compiler: `formatCollie` API for programmatic formatting.
- compiler: TSX conversion APIs (`convertTsxToCollie`, `convertCollieToTsx`).
- cli: dependency preflight checks with install prompt for `init` and `check`.
- cli: Vite-ready `collie init` output (`collie.config.ts`, typings, and Vite config patching).
- vite: deterministic full reload handling for `.collie` hot updates.
- docs: Collie demo checklist.

### Changed
- cli formatter now delegates to compiler formatting API.
- compiler now depends on TypeScript at runtime for TSX conversion.
- config: `.cjs` config files load via dynamic import to avoid `import.meta` usage in CJS output.

### Fixed
- config normalization typing that could break DTS builds under strict TypeScript.
- compiler conversion typing for JSX attribute names/values in DTS generation.
