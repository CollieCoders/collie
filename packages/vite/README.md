# @collie-lang/vite

Vite plugin that builds the Collie template registry and virtual template modules.

## Install

```bash
pnpm add -D @collie-lang/vite
pnpm add @collie-lang/react
```

## Usage

```ts
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import collie from "@collie-lang/vite";

export default defineConfig({
  plugins: [collie(), react()]
});
```

Create templates with `#id` blocks:

```collie
#id app.hero
div.hero
  h1 {{ title }}

#id app.cta
button.primary {{ label }}
```

Render them via the runtime:

```tsx
import { Collie } from "@collie-lang/react";

export function App() {
  return <Collie id="app.hero" title="Hello" />;
}
```

Direct `.collie` imports are not supported; templates are discovered automatically by the plugin.
