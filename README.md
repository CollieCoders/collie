# Collie — A Modern, JSX-Compatible Template Language for React

**Collie** is an indentation-based, JSX-adjacent template language designed for React applications.  
It brings the readability of Pug, the structure of modern component systems, and the full power of TSX—without the noise.

Collie templates compile directly to **clean, predictable JSX/TSX**, integrate seamlessly with **Vite**, and work flawlessly inside any modern React stack.

> ⚠️ **Legacy workflow (deprecated)**  
> This README currently references the previous `.collie` → component import flow. See `ARCHITECTURE.md` for the new registry-based `<Collie id="...">` runtime. Direct `.collie` imports and component-name-based addressing will be removed in later stages.

---

<p align="center">
  <img src="assets/readme/collie-hero.png" width="600" />
</p>

<p align="center"><em>Placeholder — A screenshot comparing a Collie template on the left with the compiled JSX output on the right.</em></p>

---

## 🚀 Why Collie?

JSX is powerful—but also noisy, deeply nested, and difficult to scan. Collie focuses on:

### **1. Cleaner syntax**
No closing tags. No angle-bracket soup. Just indentation.

### **2. First-class React compatibility**
Every `.collie` file compiles to JSX or TSX that you can drop directly into your components.

### **3. Built-in ergonomics**
- `#props` block for typed props  
- `#classes` block for class alias bundles  
- `@if / @elseIf / @else / @for` directives  
- Pipe text (`| Some text`)  
- Multi-level selectors (`div.card.primary`)  

### **4. Seamless tooling**
- **Vite plugin** (`@collie-lang/vite`)  
- **CLI** (`collie build`, `collie check`, etc.)  
- **Full VS Code extension** (syntax, semantic tokens, formatting, diagnostics, conversions)

### **5. Zero-runtime templates**
Collie compiles to JSX—no custom runtime, no hydration weirdness, no proprietary component model.

---

## ✨ Example

### `Welcome.collie`

```collie
#props
  name: string
  isMember: boolean

#classes
  cta = "bg-sky-600 text-white px-4 py-2 rounded"
  subtle = "opacity-80"

div.hero
  h1 {{ name }}
  p.subtle
    Welcome to our site!

  @if (isMember)
    button.cta
      Member Dashboard
  @else
    button.cta
      Join Now
```

This compiles to idiomatic TSX with clean indentation, no surprises.

---

## 📦 Packages in This Monorepo

This repo uses **pnpm workspaces** and contains all official Collie tooling:

```
packages/
  compiler   – Collie parser, AST, printer, and JSX generator
  vite       – Vite plugin for `.collie` → JSX transforms
  webpack    – Webpack loader used by other tooling (e.g. Next.js)
  next       – Next.js plugin that wires the loader into the framework
  cli        – Collie CLI (build, watch, validate, scaffold projects)
```

Additional packages may be added in the future as Collie grows (language server, testing helpers, playground, etc.).

## ✅ Supported Frameworks

- **Vite** via `@collie-lang/vite`
- **Next.js** via `@collie-lang/next`
- Webpack-based environments can also consume `.collie` files directly through `@collie-lang/webpack`.

---

## 🔧 Installation

### Quick Start (CLI)

```bash
# Existing Vite project
pnpm dlx @collie-lang/cli init --vite

# Scaffold a brand new Next.js project with Collie support
pnpm dlx @collie-lang/cli init --nextjs my-collie-next-app
```

### Manual Setup — Vite

> ⚠️ **Deprecated setup**  
> The steps below describe the legacy behavior of importing `.collie` files as React components. Refer to `ARCHITECTURE.md` to learn the new `<Collie id="...">` + `virtual:collie/registry` workflow; this section will be reworked in a later stage.

1. Install the Vite plugin:

```bash
pnpm add -D @collie-lang/vite
```

2. Enable it in `vite.config.ts`:

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import collie from '@collie-lang/vite'

export default defineConfig({
  plugins: [
    collie(),
    react()
  ]
})
```

3. Import `.collie` files anywhere in your app.

```tsx
import Welcome from './components/Welcome.collie'

export default function App() {
  return (
    <>
      <Welcome name="Josh" isMember={true} />
    </>
  )
}
```

### Manual Setup — Next.js

1. Install the Next.js plugin (and the underlying loader):

```bash
pnpm add -D @collie-lang/next @collie-lang/webpack
```

2. Wrap your Next.js config:

```js
// next.config.js
const { withCollie } = require('@collie-lang/next');

module.exports = withCollie({
  reactStrictMode: true,
});
```

3. Add `collie.d.ts` so TypeScript understands `.collie` imports:

```ts
// src/collie.d.ts
declare module '*.collie' {
  import type { ComponentType } from 'react';
  const Component: ComponentType<Record<string, unknown>>;
  export default Component;
}
```

4. Import `.collie` files in either the App Router or Pages Router.

---

## 🛠️ Core Technologies

### **Compiler (`@collie-lang/compiler`)**

* Tokenizer & grammar rules
* AST builder
* Error recovery for malformed templates
* JSX/TSX code generator
* Pretty-printing / formatting

The compiler is intended to be:

* **Predictable** → Same output for same input, no magic
* **Serializable** → AST nodes are pure objects
* **Composable** → CLI, Vite, and IDE tooling share the same pipeline

### **Vite Plugin (`@collie-lang/vite`)**

* On-demand `.collie` → JSX transforms
* Sourcemaps for accurate file/line tracking
* Fast mode (no formatting) for dev server
* Full printer mode for production builds

### **CLI (`@collie-lang/cli`)**

Commands include:

```
collie build        Compile an entire template directory
collie check        Validate Collie files without generating output
collie format       Format .collie files using the printer
collie watch        Recompile on file changes
```

TODO: Add links once documentation is live (`collie-lang.org/cli`).

---

## 🧪 Examples

- [`examples/vite-react-ts`](examples/vite-react-ts) – starter Vite + React + TS project
- [`examples/nextjs-app-router`](examples/nextjs-app-router) – fully configured Next.js 14 App Router project that consumes Collie components

Additional guides live under [`docs/`](docs), including a [framework migration guide](docs/migration.md).

---

## 🧬 Language Overview

Collie is opinionated but not restrictive:

### **Blocks**

* `#props` — typed props for the component
* `#classes` — reusable Tailwind-style bundles
* `#slots` — (coming soon) slot declarations

### **Selectors**

```
div.card.primary
button.cta.large
MyComponent.box
```

### **Expressions**

```collie
h2 {{ user.name }}
p {{ items.length }} items
```

### **Directives**

```collie
if @if (isVisible)
  ...
@elseIf (shouldWarn)
  ...
@else
  ...
```

### **Loops**

```collie
@for (item of items)
  li {{ item }}
```

### **Pipe Text**

```collie
p
  | This is a paragraph of text.
```

A full language reference will live at **collie-lang.org** (in progress).

---

## ⚡ Tooling Ecosystem

### **VS Code Extension**

The recommended editor integration:

* Syntax highlighting
* Semantic tokens
* Hover support
* Completions
* Diagnostics
* Formatter
* JSX ⇄ Collie conversion

> Marketplace link: (TODO — add link once published)

### **Playground (Coming Soon)**

A browser-based playground at **[https://collie-lang.org/play](https://collie-lang.org/play)** will allow:

* Live Collie → JSX preview
* AST explorer
* Printer/formatter playground
* Error reporting visualizer

---

## 📁 Project Structure

```
collie/
  packages/
    compiler/   – Collie parser, AST, JSX generator, printer
    cli/        – CLI wrapper around the compiler
    vite/       – Vite plugin for React/Vite projects
  examples/
    basic/      – Simple starter examples
  example.collie
  example.tsx
```

---

## 🧪 Testing

Collie uses a snapshot-style testing strategy:

* AST snapshots
* JSX generation snapshots
* Formatter output snapshots
* Error recovery cases

Run all tests:

```bash
pnpm test
```

Run tests in a specific package:

```bash
cd packages/compiler
pnpm test
```

---

## 🗺️ Roadmap

Collie is evolving rapidly. Upcoming features include:

### **Language**

* Slots
* Inline JavaScript expressions
* Spread attributes (`...attrs`)
* Layout components
* Enhanced conditional syntax

### **Tooling**

* Dedicated **language server**
* DevTools panel for Collie templates
* React Server Components support
* Automatic prop typing from Collie → TSX

### **Developer Experience**

* Official documentation at `collie-lang.org`
* Full examples gallery
* Recipe book for real-world component patterns

---

## 📣 Contributing

Contributions are very welcome.

If you're building something with Collie, please open an issue and share what you're making—we’d love real-world feedback to shape future language decisions.

### Development Setup

```bash
pnpm install
pnpm -w build
pnpm --filter @collie-lang/compiler test
```

### Issues

When reporting a bug, please include:

* The `.collie` input
* The generated JSX (if any)
* Expected vs actual output
* Your environment (Node, pnpm, OS)

---

## 📝 License

Collie is MIT licensed.

---

<p align="center">
  <img src="assets/readme/collie-logo.png" width="120" />
</p>

<p align="center"><em>Placeholder – Small logo for branding in the README footer.</em></p>
