# @collie-lang/compiler

Collie compiler core (MVP stub).

## Class aliases

The compiler understands a top-level `classes` block that acts as a macro table for CSS/Tailwind tokens. Each block must live at indent level 0 and appear before the first real template node (`div`, text, expressions, conditionals). Multiple `classes` blocks are allowed (even when separated by `props`) and all aliases are merged:

```collie
classes
  baseContainer = container.mx-auto.p-6

props
  user: User

classes
  adminPanel = mt-4.bg-red-100.text-red-700

div.$baseContainer.flex
  @if user.role === "admin"
    div.$adminPanel.rounded
      "Admin tools"
```

Alias names follow JS identifier rules and must be indented exactly one level under the block header. Within selector syntax you can reference them via `$aliasName`; the compiler expands them in place so the resulting JSX only contains literal classes (duplicates are preserved). Declaring the same alias twice or referencing an undefined alias produces diagnostics.

Alias handling is a compile-time affordance only. The core compiler does not attempt to synthesize aliases when converting from TSX back to Collie—the VS Code extension (or other tooling) will keep literal classes unless you explicitly opt into aliases.
