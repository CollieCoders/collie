import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "tsup";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: {
    entry: ["src/index.ts"],
    tsconfig: path.resolve(__dirname, "tsconfig.json")
  },
  sourcemap: true,
  clean: true,
  target: "es2022",
  tsconfig: path.resolve(__dirname, "tsconfig.json")
});
