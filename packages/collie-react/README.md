# @collie-lang/react

Runtime `<Collie id="...">` component that loads compiled templates from the Vite registry (`virtual:collie/registry`).

## Usage

```tsx
import { Collie } from '@collie-lang/react'

export function App() {
  return (
    <Collie
      id="Example.header"
      title="Hello"
      link="/docs"
      fallback={<div>Loading...</div>}
    />
  )
}
```

`id` must match a template id discovered by `@collie-lang/vite`. All other props are forwarded to the template's `render(props)` function; `fallback` renders while the template module loads. Unknown ids throw a helpful error listing known ids.
