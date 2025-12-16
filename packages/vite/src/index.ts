import path from "node:path";
import type { Plugin, ResolvedConfig } from "vite";
import type { Diagnostic } from "@collie-lang/compiler";
import { compile } from "@collie-lang/compiler";

type JsxRuntime = "automatic" | "classic";

export interface ColliePluginOptions {
  jsxRuntime?: JsxRuntime;
}

function toComponentNameHint(id: string): string {
  const base = path.basename(id).replace(/\.[^.]+$/, "");
  return `${base.replace(/[^a-zA-Z0-9_$]/g, "")}Template`;
}

function formatDiagnostic(id: string, diagnostic: Diagnostic): string {
  const file = diagnostic.file ?? id;
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
    configResolved(config) {
      resolvedRuntime = options.jsxRuntime ?? inferJsxRuntime(config);
    },

    transform(source, id) {
      if (!id.endsWith(".collie")) return;

      const result = compile(source, {
        filename: id,
        componentNameHint: toComponentNameHint(id),
        jsxRuntime: resolvedRuntime
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

function inferJsxRuntime(config: ResolvedConfig): JsxRuntime {
  const jsx = config.esbuild?.jsx;
  if (jsx === "classic") {
    return "classic";
  }
  return "automatic";
}
