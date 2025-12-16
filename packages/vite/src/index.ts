import path from "node:path";
import type { Plugin } from "vite";
import type { Diagnostic } from "@collie-lang/compiler";
import { compile } from "@collie-lang/compiler";

function toComponentNameHint(id: string): string {
  const base = path.basename(id).replace(/\.[^.]+$/, "");
  return `${base.replace(/[^a-zA-Z0-9_$]/g, "")}Template`;
}

function formatDiagnostic(id: string, diagnostic: Diagnostic): string {
  const where = diagnostic.span ? `${diagnostic.span.start.line}:${diagnostic.span.start.col}` : "";
  const location = where ? `${id}:${where}` : id;
  const code = diagnostic.code ? diagnostic.code : "COLLIE";
  return `${location} [${code}] ${diagnostic.message}`;
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
        const formatted = errors.map((diag) => formatDiagnostic(id, diag)).join("\n");
        throw new Error(`[collie]\n${formatted}`);
      }

      return { code: result.code, map: result.map ?? null };
    }
  };
}
