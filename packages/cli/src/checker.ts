import fg from "fast-glob";
import { parseCollie, type Diagnostic } from "@collie-lang/compiler";
import fs from "node:fs/promises";
import path from "node:path";
import pc from "picocolors";
import { toDisplayPath } from "./fs-utils";

export interface CheckOptions {
  verbose?: boolean;
  format?: "text" | "json";
  noWarnings?: boolean;
  maxWarnings?: number;
}

export interface CheckResult {
  totalFiles: number;
  filesWithErrors: number;
  filesWithWarnings: number;
  diagnostics: Diagnostic[];
  errorCount: number;
  warningCount: number;
}

type LineCache = Map<string, string[]>;

export async function check(patterns: string[], options: CheckOptions = {}): Promise<CheckResult> {
  const files = await fg(patterns, {
    absolute: true,
    onlyFiles: true,
    dot: false,
    unique: true
  });

  if (files.length === 0) {
    throw new Error("No .collie files found for the provided patterns.");
  }

  const lineCache: LineCache = new Map();
  const diagnostics: Diagnostic[] = [];
  const filesWithErrors = new Set<string>();
  const filesWithWarnings = new Set<string>();
  let errorCount = 0;
  let warningCount = 0;

  for (const file of files) {
    const displayPath = toDisplayPath(file);
    try {
      const source = await fs.readFile(file, "utf8");
      lineCache.set(displayPath, source.split(/\r?\n/));

      const parseResult = parseCollie(source);
      for (const diag of parseResult.diagnostics) {
        const normalized: Diagnostic = {
          ...diag,
          file: diag.file
            ? toDisplayPath(path.isAbsolute(diag.file) ? diag.file : path.resolve(path.dirname(file), diag.file))
            : displayPath
        };

        if (normalized.severity === "error") {
          filesWithErrors.add(displayPath);
          errorCount++;
          diagnostics.push(normalized);
        } else if (!options.noWarnings) {
          diagnostics.push(normalized);
        }

        if (normalized.severity === "warning") {
          warningCount++;
          filesWithWarnings.add(displayPath);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failure: Diagnostic = {
        severity: "error",
        message,
        file: displayPath
      };
      diagnostics.push(failure);
      filesWithErrors.add(displayPath);
      errorCount++;
    }
  }

  const result: CheckResult = {
    totalFiles: files.length,
    filesWithErrors: filesWithErrors.size,
    filesWithWarnings: filesWithWarnings.size,
    diagnostics,
    errorCount,
    warningCount
  };

  if ((options.format ?? "text") === "json") {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(pc.cyan(`Checking ${files.length} file${files.length === 1 ? "" : "s"}...\n`));
    printTextDiagnostics(result, options, lineCache);
  }

  return result;
}

function printTextDiagnostics(result: CheckResult, options: CheckOptions, lineCache: LineCache): void {
  if (result.diagnostics.length === 0) {
    console.log(pc.green("✔ All files passed validation"));
    return;
  }

  for (const diag of result.diagnostics) {
    const fileLabel = diag.file ?? "<unknown>";
    const code = diag.code ? ` ${diag.code}` : "";
    const location =
      diag.span && diag.file
        ? `${fileLabel}:${diag.span.start.line}:${diag.span.start.col}`
        : fileLabel;
    const icon = diag.severity === "error" ? pc.red("error") : pc.yellow("warning");

    console.log(pc.gray(location));
    console.log(`  ${icon}${code}: ${diag.message}`);

    if (options.verbose && diag.span && diag.file) {
      const lines = lineCache.get(diag.file);
      if (lines) {
        const index = Math.max(0, diag.span.start.line - 1);
        const text = lines[index] ?? "";
        const markerStart = Math.max(0, diag.span.start.col - 1);
        const width = Math.max(1, diag.span.end.col - diag.span.start.col);
        const indicator = `${" ".repeat(markerStart)}${"^".repeat(width)}`;

        console.log(pc.dim(`    ${text}`));
        console.log(pc.dim(`    ${indicator}`));
      }
    }

    console.log("");
  }

  const parts: string[] = [];
  if (result.errorCount > 0) {
    parts.push(pc.red(`${result.errorCount} error${result.errorCount === 1 ? "" : "s"}`));
  }
  if (!options.noWarnings && result.warningCount > 0) {
    parts.push(pc.yellow(`${result.warningCount} warning${result.warningCount === 1 ? "" : "s"}`));
  }

  const summary =
    parts.length > 0
      ? `✖ Found ${parts.join(", ")} in ${result.filesWithErrors + result.filesWithWarnings} file${
          result.filesWithErrors + result.filesWithWarnings === 1 ? "" : "s"
        }`
      : "✔ All files passed validation";

  if (parts.length > 0) {
    console.log(pc.red(summary));
  } else {
    console.log(pc.green(summary));
  }
}
