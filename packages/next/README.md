# @collie-lang/next

Next.js plugin for Collie template language.

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

Wrap interactive Collie templates inside a client module:

```tsx
// components/CounterWrapper.tsx
'use client';
import CounterTemplate from './Counter.collie';
import { useState } from 'react';

export default function CounterWrapper() {
  const [count, setCount] = useState(0);
  return <CounterTemplate count={count} onIncrement={() => setCount(count + 1)} />;
}
```
