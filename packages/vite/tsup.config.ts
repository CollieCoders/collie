import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "tsup";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  platform: "node",
  target: "node18",
  dts: {
    compilerOptions: {
      composite: false,
      rootDir: path.resolve(__dirname, "../.."),
    },
  },
  sourcemap: true,
  clean: true,
  splitting: false,
  external: [
    "vite",
    "rollup",
    "typescript",
  ],
});
