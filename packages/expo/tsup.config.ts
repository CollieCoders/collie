import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/metro-transformer.ts"],
  format: ["cjs", "esm"],
  dts: true,
  sourcemap: true,
  splitting: false,
  clean: true,
  target: "es2022"
});
