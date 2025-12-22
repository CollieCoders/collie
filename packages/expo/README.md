# @collie-lang/expo

Metro transformer utilities for compiling `.collie` files inside Expo / React Native projects.

## Installation

```bash
pnpm add -D @collie-lang/expo
```

> Metro already ships with `metro-react-native-babel-transformer`. The Collie transformer wraps it, so no extra configuration is required.

## Usage

```js
// metro.config.js
const { withCollieMetro } = require("@collie-lang/expo");

module.exports = withCollieMetro({});
```

This helper:

- Adds `collie` to the resolver extensions.
- Points Metro at the Collie-aware transformer so `.collie` files compile to React components on the fly.

If you prefer manual control, add the transformer path and resolver entries yourself:

```js
const { createCollieMetroTransformer } = require("@collie-lang/expo");

module.exports = {
  transformer: {
    babelTransformerPath: require.resolve("@collie-lang/expo/metro-transformer")
  },
  resolver: {
    sourceExts: ["js", "jsx", "ts", "tsx", "json", "collie"]
  }
};
```
