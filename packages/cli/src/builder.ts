import fg from "fast-glob";
import { compileToTsx, type Diagnostic, type TsxCompileOptions } from "@collie-lang/compiler";
import fs from "node:fs/promises";
import path from "node:path";
import pc from "picocolors";
import { resolveOutputPath, toDisplayPath } from "./fs-utils";
import { formatDiagnosticLine, printSummary } from "./output";

export interface BuildOptions {
  outDir?: string;
  sourcemap?: boolean;
  jsxRuntime?: "automatic" | "classic";
  verbose?: boolean;
  quiet?: boolean;
}

export interface BuildResult {
  totalFiles: number;
  successfulFiles: number;
  errors: Array<{ file: string; diagnostics: Diagnostic[] }>;
}

interface CompileFileResult {
  success: boolean;
  outputPath?: string;
  diagnostics: Diagnostic[];
}

export async function build(input: string, options: BuildOptions = {}): Promise<BuildResult> {
  const resolvedInput = path.resolve(process.cwd(), input);
  let stats;
  try {
    stats = await fs.stat(resolvedInput);
  } catch {
    throw new Error(`Input path does not exist: ${input}`);
  }

  const isDirectory = stats.isDirectory();
  const baseDir = isDirectory ? resolvedInput : path.dirname(resolvedInput);
  const outDir = options.outDir ? path.resolve(process.cwd(), options.outDir) : undefined;

  const files = isDirectory
    ? (await fg("**/*.collie", { cwd: resolvedInput, absolute: true })).sort()
    : [resolvedInput];

  if (!files.length) {
    if (!options.quiet) {
      printSummary(
        "warning",
        `No .collie files found under ${toDisplayPath(resolvedInput)}`,
        undefined,
        "add a .collie file or adjust the input path"
      );
    }
    return { totalFiles: 0, successfulFiles: 0, errors: [] };
  }

  if (!options.quiet) {
    console.log(pc.cyan(`Compiling ${toDisplayPath(resolvedInput)}...`));
    console.log("");
  }

  const result: BuildResult = {
    totalFiles: files.length,
    successfulFiles: 0,
    errors: []
  };

  for (const file of files) {
    const compileResult = await compileSingleFile(file, baseDir, outDir, options);
    if (compileResult.success) {
      result.successfulFiles++;
      if (!options.quiet) {
        console.log(pc.green(`✔ ${toDisplayPath(file)} → ${toDisplayPath(compileResult.outputPath!)}`));
      }
      if (options.verbose) {
        logDiagnostics(file, compileResult.diagnostics.filter((d) => d.severity === "warning"));
      }
    } else {
      result.errors.push({ file, diagnostics: compileResult.diagnostics });
      logDiagnostics(file, compileResult.diagnostics, true);
    }
  }

  if (!options.quiet) {
    console.log("");
    if (result.errors.length === 0) {
      const changeDetail = outDir
        ? `wrote ${result.successfulFiles} .tsx file${result.successfulFiles === 1 ? "" : "s"} to ${toDisplayPath(outDir)}`
        : `wrote ${result.successfulFiles} .tsx file${result.successfulFiles === 1 ? "" : "s"} next to the source files`;
      printSummary(
        "success",
        `Compiled ${result.totalFiles} .collie file${result.totalFiles === 1 ? "" : "s"}`,
        changeDetail,
        "import the generated .tsx files in your app"
      );
    } else {
      const changeDetail =
        result.successfulFiles > 0
          ? `wrote ${result.successfulFiles} .tsx file${result.successfulFiles === 1 ? "" : "s"} before failing`
          : undefined;
      printSummary(
        "error",
        `Build failed with ${result.errors.length} error${result.errors.length === 1 ? "" : "s"}`,
        changeDetail,
        "fix the errors above and rerun collie build"
      );
    }
  }

  return result;
}

async function compileSingleFile(
  filepath: string,
  baseDir: string,
  outDir: string | undefined,
  options: BuildOptions
): Promise<CompileFileResult> {
  try {
    const source = await fs.readFile(filepath, "utf8");
    const componentName = path.basename(filepath, path.extname(filepath));

    const compileOptions: TsxCompileOptions = {
      filename: filepath,
      componentNameHint: componentName,
      jsxRuntime: options.jsxRuntime ?? "automatic"
    };

    const result = compileToTsx(source, compileOptions);
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    if (errors.length) {
      return { success: false, diagnostics: errors };
    }

    const outputPath = resolveOutputPath(filepath, baseDir, outDir);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, result.code, "utf8");
    if (options.sourcemap && result.map) {
      await fs.writeFile(`${outputPath}.map`, JSON.stringify(result.map), "utf8");
    }

    return { success: true, outputPath, diagnostics: result.diagnostics };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      diagnostics: [
        {
          severity: "error",
          message,
          file: filepath
        }
      ]
    };
  }
}

function logDiagnostics(file: string, diagnostics: Diagnostic[], force = false): void {
  if (!diagnostics.length) {
    return;
  }

  for (const diag of diagnostics) {
    if (!force && diag.severity !== "warning") {
      continue;
    }
    const displayFile = diag.file ? toDisplayPath(diag.file) : toDisplayPath(file);
    const message = formatDiagnosticLine({ ...diag, file: displayFile }, toDisplayPath(file));
    const writer = diag.severity === "warning" ? pc.yellow : pc.red;
    console[diag.severity === "warning" ? "warn" : "error"](writer(message));
  }
}
