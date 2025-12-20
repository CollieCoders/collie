# @collie-lang/webpack

Webpack loader for Collie template language.

## Installation

```bash
npm install --save-dev @collie-lang/webpack
```

## Usage

In your `webpack.config.js`:

```javascript
module.exports = {
  module: {
    rules: [
      {
        test: /\.collie$/,
        use: '@collie-lang/webpack'
      }
    ]
  }
};
```

## Next.js

For Next.js projects, use `@collie-lang/next` instead, which configures this loader automatically.

## Advanced Usage

### TypeScript-Friendly Config

```ts
// webpack.config.ts
import type { Configuration } from "webpack";

const config: Configuration = {
  module: {
    rules: [
      {
        test: /\.collie$/,
        use: "@collie-lang/webpack"
      }
    ]
  }
};

export default config;
```

### Loader Options

The loader does not expose custom options. It delegates to `@collie-lang/compiler` using defaults optimized for React/JSX output.

## How It Works

1. Webpack resolves a `.collie` import.
2. The loader reads the source and invokes the Collie compiler (`@collie-lang/compiler`).
3. The compiler emits JSX (no runtime).
4. Your existing JSX/TSX pipeline (Babel, SWC, etc.) handles the rest.

## Source Maps

Source maps are forwarded automatically so errors map back to the original `.collie` files during development.
