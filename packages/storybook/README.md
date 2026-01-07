# @collie-lang/storybook

Storybook adapter that teaches both Webpack- and Vite-powered Storybook projects how to load `.collie` files.

## Installation

```bash
pnpm add -D @collie-lang/storybook @collie-lang/webpack @collie-lang/vite
```

## Usage (Vite builder)

```ts
// .storybook/main.ts
import type { StorybookConfig } from "@storybook/react-vite";
import { withCollieStorybook } from "@collie-lang/storybook";

const config: StorybookConfig = withCollieStorybook({
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: [],
  framework: {
    name: "@storybook/react-vite",
    options: {}
  }
});

export default config;
```

## Usage (Webpack builder)

```js
// .storybook/main.js
const { withCollieStorybook } = require("@collie-lang/storybook");

module.exports = withCollieStorybook({
  stories: ["../src/**/*.stories.@(js|jsx|ts|tsx)"],
  addons: [],
  framework: {
    name: "@storybook/react-webpack5",
    options: {}
  }
});
```

Both builders automatically:

- Add `.collie` to the resolver extensions.
- Register the Collie loader/plugin so stories can import `.collie` components alongside JSX.
