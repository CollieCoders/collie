import chokidar from "chokidar";
import { compileToTsx, type Diagnostic, type TsxCompileOptions } from "@collie-lang/compiler";
import fs from "node:fs/promises";
import path from "node:path";
import pc from "picocolors";
import { resolveOutputPath, toDisplayPath } from "./fs-utils";

export interface WatchOptions {
  outDir?: string;
  sourcemap?: boolean;
  ext?: string;
  jsxRuntime?: "automatic" | "classic";
  verbose?: boolean;
}

export async function watch(inputPath: string, options: WatchOptions = {}): Promise<void> {
  const resolvedInput = path.resolve(process.cwd(), inputPath);
  let stats;
  try {
    stats = await fs.stat(resolvedInput);
  } catch {
    throw new Error(`Input path does not exist: ${inputPath}`);
  }

  const isDirectory = stats.isDirectory();
  const ext = normalizeExtension(options.ext);
  const baseDir = isDirectory ? resolvedInput : path.dirname(resolvedInput);
  const outDir = options.outDir ? path.resolve(process.cwd(), options.outDir) : undefined;
  const pattern = isDirectory ? path.join(resolvedInput, `**/*${ext}`) : resolvedInput;

  console.log(pc.cyan(`Watching ${toDisplayPath(resolvedInput)} for changes...\n`));

  const watcher = chokidar.watch(pattern, {
    ignored: /node_modules/,
    persistent: true,
    ignoreInitial: false
  });

  watcher.on("add", (file) => {
    void compileFile(file, baseDir, outDir, options);
  });
  watcher.on("change", (file) => {
    if (options.verbose) {
      console.log(pc.gray(`[${getTimestamp()}] Changed: ${toDisplayPath(file)}`));
    }
    void compileFile(file, baseDir, outDir, options);
  });
  watcher.on("unlink", (file) => {
    void deleteCompiledFile(file, baseDir, outDir, options);
  });
  watcher.on("ready", () => {
    console.log(pc.green("\nWatching for file changes...\n"));
  });

  await new Promise<void>((resolve, reject) => {
    watcher.on("close", resolve);
    watcher.on("error", (error) => {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(pc.red(`[collie] Watcher error: ${err.message}`));
      reject(err);
    });
    process.once("SIGINT", () => {
      console.log(pc.yellow("\nStopping watch mode..."));
      watcher.close().catch((error) => {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error(pc.red(`[collie] Failed to stop watcher: ${err.message}`));
        reject(err);
      });
    });
  });
}

async function compileFile(
  filepath: string,
  baseDir: string,
  outDir: string | undefined,
  options: WatchOptions
): Promise<void> {
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
      logDiagnostics(filepath, errors);
      return;
    }

    const outputPath = resolveOutputPath(filepath, baseDir, outDir);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, result.code, "utf8");
    if (options.sourcemap && result.map) {
      await fs.writeFile(`${outputPath}.map`, JSON.stringify(result.map), "utf8");
    }

    console.log(pc.green(`[${getTimestamp()}] Compiled ${toDisplayPath(filepath)} → ${toDisplayPath(outputPath)}`));

    const warnings = result.diagnostics.filter((d) => d.severity === "warning");
    if (warnings.length) {
      logDiagnostics(filepath, warnings);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(pc.red(`[collie] Failed to compile ${toDisplayPath(filepath)}: ${message}`));
  }
}

async function deleteCompiledFile(
  filepath: string,
  baseDir: string,
  outDir: string | undefined,
  options: WatchOptions
): Promise<void> {
  try {
    const outputPath = resolveOutputPath(filepath, baseDir, outDir);
    await fs.unlink(outputPath);
    if (options.sourcemap) {
      await fs.unlink(`${outputPath}.map`).catch(() => {});
    }
    console.log(pc.yellow(`[${getTimestamp()}] Deleted ${toDisplayPath(outputPath)}`));
  } catch {
    // Ignore if file doesn't exist
  }
}

function logDiagnostics(file: string, diagnostics: Diagnostic[]): void {
  for (const diag of diagnostics) {
    const range = diag.range ?? diag.span;
    const fileLabel = diag.filePath ?? diag.file ?? file;
    const location = range ? `${range.start.line}:${range.start.col}` : "";
    const prefix = location ? `${toDisplayPath(fileLabel)}:${location}` : toDisplayPath(fileLabel);
    const code = diag.code ? ` (${diag.code})` : "";
    const writer = diag.severity === "warning" ? pc.yellow : pc.red;
    console[diag.severity === "warning" ? "warn" : "error"](
      writer(`${prefix ? `${prefix}: ` : ""}${diag.severity}${code}: ${diag.message}`)
    );
  }
}

function normalizeExtension(ext?: string): string {
  if (!ext || !ext.trim()) {
    return ".collie";
  }
  return ext.startsWith(".") ? ext : `.${ext}`;
}

function getTimestamp(): string {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}
