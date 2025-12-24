import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  target: "es2022",
  banner: {
    js: "#!/usr/bin/env node"
  },
  // Externalize all dependencies to keep them in node_modules
  // This prevents bundling TypeScript and other large dependencies
  external: [
    // Node built-ins
    /^node:/,
    // All npm packages
    /^[^.\/]/
  ]
});
