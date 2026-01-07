import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "tsup";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  platform: "node",
  target: "node18",
  external: ["typescript"],
  dts: {
    entry: ["src/index.ts"],
    tsconfig: path.resolve(__dirname, "tsconfig.json"),
    compilerOptions: {
      composite: false,
      rootDir: path.resolve(__dirname, "../.."),
    },
  },
  sourcemap: true,
  clean: true,
  tsconfig: path.resolve(__dirname, "tsconfig.json"),
});
