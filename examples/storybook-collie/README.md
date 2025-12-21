# Storybook + Collie Example

This example shows how to wire `.collie` files into a Storybook project using `@collie-lang/storybook`.

```bash
pnpm install
pnpm storybook
```

The `.storybook/main.ts` file wraps the Storybook config with `withCollieStorybook`, so stories can import `.collie` templates directly.
