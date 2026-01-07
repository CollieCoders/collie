import fg from "fast-glob";
import { parseCollie, type Diagnostic, type SourceSpan } from "@collie-lang/compiler";
import fs from "node:fs/promises";
import path from "node:path";
import pc from "picocolors";
import { toDisplayPath } from "./fs-utils";
import { formatDiagnosticLine, printSummary } from "./output";

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

export interface TemplateInfo {
  id: string;
  filePath: string;
  displayPath: string;
  span?: SourceSpan;
}

export interface TemplateScanResult {
  files: string[];
  templates: TemplateInfo[];
  diagnostics: Diagnostic[];
  lineCache: LineCache;
}

export async function scanTemplates(patterns: string[]): Promise<TemplateScanResult> {
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
  const templates: TemplateInfo[] = [];

  for (const file of files) {
    const displayPath = toDisplayPath(file);
    try {
      const source = await fs.readFile(file, "utf8");
      lineCache.set(displayPath, source.split(/\r?\n/));

      const parseResult = parseCollie(source, { filename: file });
      for (const diag of parseResult.diagnostics) {
        const range = diag.range ?? diag.span;
        const normalized: Diagnostic = {
          ...diag,
          file: diag.file
            ? toDisplayPath(path.isAbsolute(diag.file) ? diag.file : path.resolve(path.dirname(file), diag.file))
            : displayPath,
          filePath: diag.filePath
            ? toDisplayPath(
                path.isAbsolute(diag.filePath) ? diag.filePath : path.resolve(path.dirname(file), diag.filePath)
              )
            : displayPath,
          range
        };
        diagnostics.push(normalized);
      }

      for (const template of parseResult.templates) {
        templates.push({
          id: template.id,
          filePath: file,
          displayPath,
          span: template.span
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      diagnostics.push({
        severity: "error",
        message,
        file: displayPath,
        filePath: displayPath
      });
    }
  }

  return { files, templates, diagnostics, lineCache };
}

export function buildDuplicateDiagnostics(templates: TemplateInfo[]): Diagnostic[] {
  const duplicates = new Map<string, TemplateInfo[]>();
  for (const template of templates) {
    const list = duplicates.get(template.id) ?? [];
    list.push(template);
    duplicates.set(template.id, list);
  }

  const diagnostics: Diagnostic[] = [];
  for (const [id, locations] of duplicates) {
    const uniqueFiles = new Set(locations.map((location) => location.filePath));
    if (uniqueFiles.size <= 1) {
      continue;
    }

    for (const location of locations) {
      const otherLocations = locations
        .filter((entry) => entry !== location)
        .map((entry) => formatTemplateLocation(entry))
        .join(", ");
      const suffix = otherLocations ? ` Also defined in ${otherLocations}.` : "";
      diagnostics.push({
        severity: "error",
        code: "COLLIE703",
        message: `Duplicate template id "${id}".${suffix}`,
        file: location.displayPath,
        filePath: location.displayPath,
        range: location.span
      });
    }
  }

  return diagnostics;
}

function formatTemplateLocation(template: TemplateInfo): string {
  const span = template.span;
  if (span) {
    return `${template.displayPath}:${span.start.line}:${span.start.col}`;
  }
  return template.displayPath;
}

export async function check(patterns: string[], options: CheckOptions = {}): Promise<CheckResult> {
  const scan = await scanTemplates(patterns);
  const diagnostics: Diagnostic[] = [];
  const filesWithErrors = new Set<string>();
  const filesWithWarnings = new Set<string>();
  let errorCount = 0;
  let warningCount = 0;

  for (const diag of scan.diagnostics) {
    const fileLabel = diag.filePath ?? diag.file;
    if (diag.severity === "error") {
      if (fileLabel) {
        filesWithErrors.add(fileLabel);
      }
      errorCount++;
      diagnostics.push(diag);
    } else {
      warningCount++;
      if (fileLabel) {
        filesWithWarnings.add(fileLabel);
      }
      if (!options.noWarnings) {
        diagnostics.push(diag);
      }
    }
  }

  const duplicateDiagnostics = buildDuplicateDiagnostics(scan.templates);
  for (const diag of duplicateDiagnostics) {
    const fileLabel = diag.filePath ?? diag.file;
    if (fileLabel) {
      filesWithErrors.add(fileLabel);
    }
    errorCount++;
    diagnostics.push(diag);
  }

  const result: CheckResult = {
    totalFiles: scan.files.length,
    filesWithErrors: filesWithErrors.size,
    filesWithWarnings: filesWithWarnings.size,
    diagnostics,
    errorCount,
    warningCount
  };

  if ((options.format ?? "text") === "json") {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(pc.cyan(`Checking ${scan.files.length} file${scan.files.length === 1 ? "" : "s"}...\n`));
    printTextDiagnostics(result, options, scan.lineCache);
  }

  return result;
}

function printTextDiagnostics(result: CheckResult, options: CheckOptions, lineCache: LineCache): void {
  const hasDiagnostics = result.diagnostics.length > 0;

  if (hasDiagnostics) {
    for (const diag of result.diagnostics) {
      const message = formatDiagnosticLine(diag);
      const writer = diag.severity === "warning" ? pc.yellow : pc.red;
      console.log(writer(message));

      const range = diag.range ?? diag.span;
      const fileLabel = diag.filePath ?? diag.file;
      if (options.verbose && range && fileLabel) {
        const lines = lineCache.get(fileLabel);
        if (lines) {
          const index = Math.max(0, range.start.line - 1);
          const text = lines[index] ?? "";
          const markerStart = Math.max(0, range.start.col - 1);
          const width = Math.max(1, range.end.col - range.start.col);
          const indicator = `${" ".repeat(markerStart)}${"^".repeat(width)}`;

          console.log(pc.dim(`  ${text}`));
          console.log(pc.dim(`  ${indicator}`));
        }
      }

      if (options.verbose) {
        console.log("");
      }
    }
    if (!options.verbose) {
      console.log("");
    }
  }

  const warningCount = options.noWarnings ? 0 : result.warningCount;
  const hasWarnings = warningCount > 0;
  const hasErrors = result.errorCount > 0;

  const summaryParts: string[] = [];
  if (hasErrors) {
    summaryParts.push(`${result.errorCount} error${result.errorCount === 1 ? "" : "s"}`);
  }
  if (hasWarnings) {
    summaryParts.push(`${warningCount} warning${warningCount === 1 ? "" : "s"}`);
  }

  const summarySuffix = summaryParts.length > 0 ? ` with ${summaryParts.join(" and ")}` : " with no issues";
  const summary = `Checked ${result.totalFiles} file${result.totalFiles === 1 ? "" : "s"}${summarySuffix}`;

  if (hasErrors) {
    printSummary("error", summary, "no files changed", "fix the errors above and rerun collie check");
  } else if (hasWarnings) {
    printSummary("warning", summary, "no files changed", "review the warnings above");
  } else {
    printSummary("success", summary, "no files changed", "run collie build when you are ready to compile");
  }
}
