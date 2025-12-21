# Expo + Collie Example

This example demonstrates how to enable `.collie` components inside an Expo project by wrapping `metro.config.js` with `withCollieMetro`.

```bash
pnpm install
pnpm start
```

`App.tsx` imports `components/Hello.collie`, and `metro.config.js` pulls in the Collie transformer automatically.
