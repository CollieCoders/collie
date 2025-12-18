import path from "node:path";
import fs from "node:fs/promises";
import type { Plugin } from "vite";
import { transformWithEsbuild } from "vite";
import type { Diagnostic } from "@collie-lang/compiler";
import { compile } from "@collie-lang/compiler";

type JsxRuntime = "automatic" | "classic";

export interface ColliePluginOptions {
  jsxRuntime?: JsxRuntime;
}

function stripQuery(id: string): string {
  const q = id.indexOf("?");
  return q === -1 ? id : id.slice(0, q);
}

function isCollieFile(id: string): boolean {
  return stripQuery(id).endsWith(".collie");
}

function toComponentNameHint(id: string): string {
  const base = path.basename(stripQuery(id)).replace(/\.[^.]+$/, "");
  return `${base.replace(/[^a-zA-Z0-9_$]/g, "")}Template`;
}

function formatDiagnostic(id: string, diagnostic: Diagnostic): string {
  const file = diagnostic.file ?? stripQuery(id);
  const where = diagnostic.span ? `${diagnostic.span.start.line}:${diagnostic.span.start.col}` : "";
  const location = where ? `${file}:${where}` : file;
  const code = diagnostic.code ? diagnostic.code : "COLLIE";
  return `${location} [${code}] ${diagnostic.message}`;
}

export default function colliePlugin(options: ColliePluginOptions = {}): Plugin {
  let resolvedRuntime: JsxRuntime = options.jsxRuntime ?? "automatic";

  return {
    name: "collie",
    enforce: "pre",

    configResolved() {
      resolvedRuntime = options.jsxRuntime ?? "automatic";
    },

    async load(id) {
      if (!isCollieFile(id)) return null;

      const filePath = stripQuery(id);
      const source = await fs.readFile(filePath, "utf-8");

      const result = compile(source, {
        filename: filePath,
        componentNameHint: toComponentNameHint(filePath),
        jsxRuntime: resolvedRuntime
      });

      const errors = result.diagnostics.filter((d) => d.severity === "error");
      if (errors.length) {
        const formatted = errors.map((diag) => formatDiagnostic(filePath, diag)).join("\n");
        this.error(new Error(`[collie]\n${formatted}`));
      }

      // Compiler output contains JSX. Transform it to plain JS so Rollup can parse.
      const transformed = await transformWithEsbuild(result.code, filePath, {
        loader: "tsx",
        jsx: "automatic",
        jsxImportSource: "react"
      });

      return {
        code: transformed.code,
        map: transformed.map ?? null
      };
    }
  };
}
