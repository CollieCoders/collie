# Collie - Indentation-first templates for React

Collie is an indentation-based template language that compiles to JSX/TSX render modules. This repo hosts the compiler, CLI, Vite plugin, config helpers, and the React runtime.

Direct `.collie` imports are not supported. Use the registry runtime (`<Collie id="..." />`) or compile with the CLI.

## Quick start

New Vite + React app:

```bash
pnpm dlx @collie-lang/cli create my-collie-app
```

Existing Vite project:

```bash
pnpm dlx @collie-lang/cli init
```

## Manual Vite setup

1. Install the plugin and runtime:

```bash
pnpm add -D @collie-lang/vite
pnpm add @collie-lang/react
```

2. Enable the plugin in `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import collie from "@collie-lang/vite";

export default defineConfig({
  plugins: [collie(), react()]
});
```

3. Create a `.collie` file with an id:

```collie
#id app.hero
#inputs
  name
  isMember

classes
  cta = bg-sky-600.text-white.px-4.py-2.rounded

div.hero
  h1 | Hello {{ name }}

  @if (isMember)
    button.$cta | Member Dashboard
  @else
    button.$cta | Join Now
```

4. Render it from React:

```tsx
import { Collie } from "@collie-lang/react";

export function App() {
  return <Collie id="app.hero" name="Josh" isMember />;
}
```

## Language overview

- `#id` blocks define templates and are required. A file can contain multiple `#id` blocks.
- `#inputs` declares input names that will be available as bare identifiers in expressions.
- `classes` defines class alias macros. Use `$aliasName` inside selector classes.
- Elements use lowercase names, components start with an uppercase letter.
- Attributes live in parentheses: `button(type="button" disabled)`.
- Text nodes use `|`, and interpolations use `{{ expression }}`.
- Conditionals use `@if (cond)`, `@elseIf (cond)`, and `@else`.
- Loops use `@for (item in items)`.
- Guards use `?` on an element or component: `div?isVisible`.
- Slots are named blocks inside components: `Card` with `@header`, `@body`, etc.
- JSX passthrough uses `=` on its own line: `= <SomeJSX />`.
- `@client` at the top of a template emits "use client" in the render module.

## CLI

```text
collie build    Compile .collie templates to output files
collie check    Validate .collie templates
collie config   Print resolved Collie config (json)
collie ids      List template ids and their locations
collie explain  Find the file + location for a template id
collie format   Format .collie templates
collie convert  Convert JSX/TSX to .collie templates
collie doctor   Diagnose setup issues
collie init     Create a Collie config and wire Vite when possible
collie watch    Watch and compile templates
collie create   Scaffold a new Collie project
```

## Packages in this monorepo

- `@collie-lang/cli` - Collie command line tools
- `@collie-lang/compiler` - Parser, formatter, and code generators (JSX/TSX and HTML)
- `@collie-lang/config` - Config loading and normalization
- `@collie-lang/react` - Runtime `<Collie id="...">` component
- `@collie-lang/vite` - Vite plugin that builds the template registry

## Testing

```bash
pnpm test
```

Run tests in a specific package:

```bash
pnpm --filter @collie-lang/compiler test
```

## License

MIT
