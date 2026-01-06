import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  platform: "node",
  target: "node18",
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  banner: {
    js: "#!/usr/bin/env node",
  },
  external: [
    /^node:/,
    /^[^.\/]/,
  ],
});
