import path from "node:path";
import type { LoaderContext } from "webpack";
import type { Diagnostic } from "@collie-lang/compiler";
import { compile } from "@collie-lang/compiler";

function formatDiagnostic(filePath: string, diagnostic: Diagnostic): string {
  const file = diagnostic.file ?? filePath;
  const where = diagnostic.span ? `${diagnostic.span.start.line}:${diagnostic.span.start.col}` : "";
  const location = where ? `${file}:${where}` : file;
  const code = diagnostic.code ? diagnostic.code : "COLLIE";
  return `${location} [${code}] ${diagnostic.message}`;
}

function toComponentNameHint(filePath: string): string {
  const base = path.basename(filePath).replace(/\.[^.]+$/, "");
  return `${base.replace(/[^a-zA-Z0-9_$]/g, "")}Template`;
}

/**
 * Webpack loader for Collie template language.
 * Compiles .collie files to JSX for downstream JSX transformers.
 */
export default function collieLoader(
  this: LoaderContext<Record<string, unknown>>,
  source: string
): void {
  this.cacheable?.(true);

  const callback = this.async();
  const filePath = this.resourcePath;

  try {
    const result = compile(source, {
      filename: filePath,
      componentNameHint: toComponentNameHint(filePath),
      jsxRuntime: "automatic"
    });

    const errors = result.diagnostics.filter((d) => d.severity === "error");
    if (errors.length) {
      const message = errors.map((diag) => formatDiagnostic(filePath, diag)).join("\n");
      callback(new Error(`[collie] Collie compilation failed:\n${message}`));
      return;
    }

    callback(null, result.code, result.map ?? undefined);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    callback(err);
  }
}
