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

`id` must match a template id discovered by `@collie-lang/vite`. Inputs are forwarded to the template's `render(__inputs)` function (use the `inputs` prop explicitly or pass inputs directly as props); `fallback` renders while the template module loads. Unknown ids throw a helpful error listing known ids.
