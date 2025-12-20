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
