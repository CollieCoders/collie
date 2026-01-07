# @collie-lang/next

Next.js plugin for Collie template language.

> ⚠️ **Deprecated workflow note**  
> This README still documents the legacy `.collie` import model. The new registry + `<Collie id="...">` runtime is described in `ARCHITECTURE.md`, and the old component imports / component-name-derived addressing will be replaced in a future stage.

## Installation

```bash
npm install --save-dev @collie-lang/next
```

## Usage

In your `next.config.js`:

```javascript
const { withCollie } = require('@collie-lang/next');

module.exports = withCollie({
  // Your Next.js config here
});
```

Or with ES modules (`next.config.mjs`):

```javascript
import { withCollie } from '@collie-lang/next';

export default withCollie({
  // Your Next.js config here
});
```

## TypeScript Support

Create a `collie.d.ts` file in your project root or `src` directory:

```typescript
declare module '*.collie' {
  import type { ComponentType } from 'react';
  const Component: ComponentType<Record<string, unknown>>;
  export default Component;
}
```

## Advanced Configuration

### Custom Webpack Overrides

```js
const { withCollie } = require('@collie-lang/next');

module.exports = withCollie({
  webpack(config, options) {
    // mutate config as needed
    if (!options.isServer) {
      config.resolve.fallback ??= {};
    }
    return config;
  },
});
```

### Composing with Other Plugins

```js
const { withCollie } = require('@collie-lang/next');
const withBundleAnalyzer = require('@next/bundle-analyzer')();

module.exports = withBundleAnalyzer(
  withCollie({
    reactStrictMode: true,
  })
);
```

## Routing Modes

Collie components work with both routers:

```tsx
// App Router (app/page.tsx)
import Welcome from '@/components/Welcome.collie';
export default function Page() {
  return <Welcome />;
}

// Pages Router (pages/index.tsx)
import Welcome from '@/components/Welcome.collie';
export default function Page() {
  return <Welcome />;
}
```

## Server Components

Collie templates can be rendered on the server:

```collie
// components/Server.collie
export default function Server(props)
  div
    h1 Server says: {props.message}
```

```tsx
// app/page.tsx
import Server from '@/components/Server.collie';

export default async function Page() {
  const data = await fetchData();
  return <Server message={data.message} />;
}
```

## Client Components

Mark a Collie template as a client component with the `@client` directive:

```collie
// components/Counter.collie
@client
props
  count: number
  onIncrement: () => void

div.counter
  button(onClick={onIncrement})
    "Count: {count}"
```

Collie will emit `"use client";` at the top of the generated module automatically, so you can import `Counter.collie` directly inside App or Pages Router files.
