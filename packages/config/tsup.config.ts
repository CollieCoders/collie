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
    entry: ["src/index.ts"],
    tsconfig: path.resolve(__dirname, "tsconfig.json"),
  },

  sourcemap: true,
  clean: true,
  splitting: false,
  tsconfig: path.resolve(__dirname, "tsconfig.json"),

  // Optional: if you don’t want tsup to inline deps at all for config, you can do:
  // external: [/^[^.\/]/, /^node:/],
});
