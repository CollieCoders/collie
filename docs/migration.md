# Migration Guide

## Migrating Collie Projects Between Frameworks

Collie templates (`.collie` files) are framework-agnostic and can be used in both Vite and Next.js projects without modification. Only your build tooling changes.

> ⚠️ **Legacy workflow warning**  
> This guide still presumes `.collie` files are imported as React components. The new registry-oriented workflow with `<Collie id="...">` is documented in `ARCHITECTURE.md`. Treat the import-based examples below as temporarily deprecated and slated for revision.

## From Vite to Next.js

### 1. Update Dependencies

```bash
# remove Vite-specific tooling
pnpm remove vite @vitejs/plugin-react @collie-lang/vite

# install Next.js + Collie packages
pnpm add next react react-dom
pnpm add -D @collie-lang/next @collie-lang/webpack
```

### 2. Update Configuration

Replace `vite.config.ts` with `next.config.js` (or `.ts` / `.mjs`):

```javascript
const { withCollie } = require('@collie-lang/next');

module.exports = withCollie({
  reactStrictMode: true,
});
```

### 3. Restructure Project

Move files to the Next.js layout:

- `src/main.tsx` ➜ `src/app/layout.tsx`
- `src/App.tsx` ➜ `src/app/page.tsx`
- Keep `.collie` components under `src/components/`

### 4. Update Imports

No changes needed! Collie imports continue to work:

```ts
import Card from '@/components/Card.collie';
```

## From Next.js to Vite

### 1. Update Dependencies

```bash
pnpm remove next @collie-lang/next @collie-lang/webpack
pnpm add vite @vitejs/plugin-react
pnpm add -D @collie-lang/vite
```

### 2. Update Configuration

Create `vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import collie from '@collie-lang/vite';

export default defineConfig({
  plugins: [collie(), react()],
});
```

### 3. Restructure Project

- `src/app/layout.tsx` ➜ `src/App.tsx`
- Create `src/main.tsx` that renders `<App />`
- Add `index.html` with a root element

### 4. Update Imports

Still no changes. Collie components continue compiling via the Vite plugin.

## Framework-Specific Features

Some features are unique to each framework:

- **Next.js only:** React Server Components, Server Actions, App Router, ISR, Image/Font optimizations.
- **Vite only:** Lightning-fast native dev server, extremely simple configuration, ESBuild-first toolchain.

Keep your Collie components pure and avoid framework-specific APIs when you plan to share them between projects.

## Best Practices

1. **Keep components pure** – pass data via props.
2. **Test in both environments** if you ship shared components.
3. **Use the CLI** (`collie init --vite` or `collie init --nextjs`) to ensure configs stay up to date.
