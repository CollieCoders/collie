import path from "node:path";
import type { Plugin } from "vite";
import { compile } from "@collie-lang/compiler";

function toComponentNameHint(id: string): string {
  const base = path.basename(id).replace(/\.[^.]+$/, "");
  return `${base.replace(/[^a-zA-Z0-9_$]/g, "")}Template`;
}

export default function colliePlugin(): Plugin {
  return {
    name: "collie",
    enforce: "pre",

    transform(source, id) {
      if (!id.endsWith(".collie")) return;

      const result = compile(source, {
        filename: id,
        componentNameHint: toComponentNameHint(id),
        jsxRuntime: "automatic"
      });

      const errors = result.diagnostics.filter((d) => d.severity === "error");
      if (errors.length) {
        const first = errors[0];
        const where = first.span ? `:${first.span.start.line}:${first.span.start.col}` : "";
        throw new Error(`[collie] ${id}${where} ${first.message}`);
      }

      return { code: result.code, map: result.map ?? null };
    }
  };
}
