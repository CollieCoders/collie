# Next.js + Collie Example (App Router)

This example demonstrates how to use the Collie template language inside a Next.js 14 application using the App Router.

## Features

- Next.js 14 with the App Router
- TypeScript + strict settings
- Collie template components compiled via `@collie-lang/next`
- Tailwind CSS utilities for styling
- Hot Module Replacement for `.collie` files

## Getting Started

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) once the dev server is running.

## Project Structure

```
src/
├── app/
│   ├── layout.tsx    # Root layout
│   ├── page.tsx      # Home page using Collie components
│   └── globals.css   # Global styles
├── components/
│   ├── Welcome.collie
│   ├── Card.collie
│   └── Navigation.collie
└── collie.d.ts       # TypeScript declarations for .collie modules
```

## Collie Components

- **Welcome.collie** – demonstrates props, conditional rendering, and event handlers
- **Card.collie** – showcases children + optional sections
- **Navigation.collie** – renders a list using `for` loops

## Configuration

The example enables Collie via `@collie-lang/next`:

```javascript
// next.config.js
const { withCollie } = require('@collie-lang/next');

module.exports = withCollie({
  reactStrictMode: true
});
```

## TypeScript Declarations

`src/collie.d.ts` ensures TypeScript understands `.collie` imports:

```typescript
declare module '*.collie' {
  import type { ComponentType } from 'react';
  const Component: ComponentType<Record<string, unknown>>;
  export default Component;
}
```

## Learn More

- [Collie README](../../README.md)
- [Next.js Documentation](https://nextjs.org/docs)
