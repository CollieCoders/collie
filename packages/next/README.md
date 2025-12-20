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
  const Component: React.ComponentType<any>;
  export default Component;
}
```
