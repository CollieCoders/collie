# Collie Architecture (Registry + `<Collie id>` Runtime)

This repo uses a **registry-driven runtime model**. Every `.collie` file describes **one or more templates** addressed by a global ID, and React renders them via a single, prop-aware `<Collie id="...">` component. Direct `.collie` imports are not supported.

## Template files

* A `.collie` file is a container of **template blocks**.
* Each template block **must** begin with a line like:

  ```
  #id Blog.navbar
  ```

* Anything before the very first `#id` is considered invalid content.
* The block body is everything that follows until the next `#id` or end of file.
* A file that contains zero `#id` blocks is a parsing error.

## ID rules

* IDs are **global within the project**—no two templates may share the same ID.
* IDs are case-sensitive and must follow the practical grammar `^[A-Za-z][A-Za-z0-9._-]*$`.
* The Vite plugin enforces uniqueness and will error with locations when duplicates are detected.

## Build-time registry (`@collie-lang/vite`)

* The Vite plugin discovers every `.collie` file via its configured glob (default `**/*.collie`).
* It splits files into template units, validates IDs, and compiles each unit to a module exporting:

  ```ts
  export function render(props: any) { ... }
  ```

* The plugin exposes a virtual module `virtual:collie/registry` that exports:

  ```ts
  export const registry: Record<
    string,
    () => Promise<{ render: (props: any) => any }>
  > = { ... }
  ```

  Each entry lazily loads the compiled template by ID.

## Runtime (`@collie-lang/react`)

* Runtime-only package.
* Exports a `<Collie id="...">` component that:
  * Looks up `registry[id]` from `virtual:collie/registry`.
  * Throws a dev-time error for unknown IDs and optionally reports close matches.
  * Loads the template module lazily, calls `render(props)`, and renders the result.
* Props are passed through directly, so templates can refer to any runtime value supplied via `props`.

## Props from day one

* Props are **mandatory** from the beginning.
* Template expressions resolve from `props` (or a destructured equivalent) so you can safely read `props.title`, `props.user`, etc.
* The runtime `<Collie>` component forwards every prop except `id` to the rendered template.

## Minimal example

### `components/nav.collie`

```collie
#id nav
div.nav
  span.logo Welcome
  a(href=props.link) Blog

#id nav.auth
div.auth
  span Hello, {{ props.user }}
  button Sign out
```

### React usage

```tsx
import { Collie } from '@collie-lang/react'

export function App() {
  return (
    <Collie
      id="nav.auth"
      user="Jamie"
      link="/blog"
    />
  )
}
```

The `Collie` component looks up `nav.auth` in the registry, loads the compiled `render(props)` module, and renders it with the provided props.

Direct `.collie` imports are disabled. The registry workflow is the only supported integration.
