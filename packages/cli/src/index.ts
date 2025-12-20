import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fg from "fast-glob";
import { diffLines } from "diff";
import pc from "picocolors";
import { formatSource } from "./formatter";
import type { Diagnostic } from "@collie-lang/compiler";
import { watch as watchCollie } from "./watcher";
import { build as runBuild } from "./builder";

type PackageManager = "pnpm" | "yarn" | "npm";

const VITE_CONFIG_FILES = ["vite.config.ts", "vite.config.mts", "vite.config.js", "vite.config.mjs"] as const;
const CLI_PACKAGE_VERSION = readCliPackageVersion();
const COLLIE_DEPENDENCIES =
  CLI_PACKAGE_VERSION === "latest"
    ? ["@collie-lang/compiler", "@collie-lang/vite"]
    : [`@collie-lang/compiler@${CLI_PACKAGE_VERSION}`, `@collie-lang/vite@${CLI_PACKAGE_VERSION}`];

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    printHelp();
    return;
  }

  if (cmd === "format") {
    try {
      await runFormat(args.slice(1));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(pc.red(`[collie] ${message}`));
      process.exit(1);
    }
    return;
  }

  if (cmd === "watch") {
    const watchArgs = args.slice(1);
    const inputPath = watchArgs[0];
    if (!inputPath) {
      throw new Error("No input path provided. Usage: collie watch <path>");
    }
    const flagArgs = watchArgs.slice(1);
    const options = {
      outDir: getFlag(flagArgs, "--outDir"),
      sourcemap: hasFlag(flagArgs, "--sourcemap"),
      ext: getFlag(flagArgs, "--ext"),
      jsxRuntime: parseJsxRuntime(getFlag(flagArgs, "--jsx")),
      verbose: hasFlag(flagArgs, "--verbose", "-v")
    };
    await watchCollie(inputPath, options);
    return;
  }

  if (cmd === "build") {
    const buildArgs = args.slice(1);
    const inputPath = buildArgs[0];
    if (!inputPath) {
      throw new Error("No input path provided. Usage: collie build <path>");
    }
    const flagArgs = buildArgs.slice(1);
    const verbose = hasFlag(flagArgs, "--verbose", "-v");
    const quiet = hasFlag(flagArgs, "--quiet", "-q");
    if (verbose && quiet) {
      throw new Error("Cannot use --quiet and --verbose together.");
    }
    const options = {
      outDir: getFlag(flagArgs, "--outDir"),
      sourcemap: hasFlag(flagArgs, "--sourcemap"),
      jsxRuntime: parseJsxRuntime(getFlag(flagArgs, "--jsx")),
      verbose,
      quiet
    };
    const result = await runBuild(inputPath, options);
    if (result.errors.length > 0) {
      process.exitCode = 1;
    }
    return;
  }

  if (cmd === "init") {
    try {
      await runInit();
      console.log(pc.green("✔ Collie is ready! Add a .collie file and import it in your Vite app."));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(pc.red(`[collie] ${message}`));
      process.exit(1);
    }
    return;
  }

  console.error(pc.red(`Unknown command: ${cmd}`));
  process.exit(1);
}

function printHelp() {
  console.log(`${pc.bold("collie")}

Commands:
  collie init     Initialize Collie in a Vite+React project
  collie format   Format Collie templates (collie format \"src/**/*.collie\" --write)
  collie watch    Watch and compile templates (collie watch src --outDir dist)
  collie build    Compile templates once (collie build src --outDir dist)
`);
}

async function runInit(): Promise<void> {
  const projectRoot = process.cwd();
  const packageJsonPath = path.join(projectRoot, "package.json");
  if (!existsSync(packageJsonPath)) {
    throw new Error("package.json not found. Run this inside a Vite+React project.");
  }

  const pkgJsonRaw = await fs.readFile(packageJsonPath, "utf8");
  const projectPackage = JSON.parse(pkgJsonRaw);
  const viteInfo = getViteDependencyInfo(projectPackage);

  const pkgManager = detectPackageManager(projectRoot);
  console.log(pc.cyan(`Installing dev dependencies with ${pkgManager}...`));
  await installDevDependencies(pkgManager, projectRoot, COLLIE_DEPENDENCIES);

  const configPath = findViteConfigFile(projectRoot);
  if (!configPath) {
    throw new Error(
      "Could not find a Vite config (vite.config.ts/mts/js/mjs). Add collie() manually to your plugins."
    );
  }

  const relativeConfig = path.relative(projectRoot, configPath);
  console.log(pc.cyan(`Patching ${relativeConfig || path.basename(configPath)}...`));
  await patchViteConfig(configPath);

  console.log(pc.cyan("Writing src/collie.d.ts..."));
  await ensureCollieDeclaration(projectRoot);

  maybeWarnAboutViteVersion(viteInfo);
  printNextSteps(pkgManager, configPath);
}

function detectPackageManager(root: string): PackageManager {
  if (existsSync(path.join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(path.join(root, "yarn.lock"))) return "yarn";
  return "npm";
}

async function installDevDependencies(packageManager: PackageManager, cwd: string, deps: string[]): Promise<void> {
  const argsByManager: Record<PackageManager, string[]> = {
    pnpm: ["add", "-D", ...deps],
    yarn: ["add", "-D", ...deps],
    npm: ["install", "-D", ...deps]
  };

  await runCommand(packageManager, argsByManager[packageManager], cwd);
}

async function patchViteConfig(configPath: string): Promise<void> {
  let contents = await fs.readFile(configPath, "utf8");
  let changed = false;

  if (!contents.includes("@collie-lang/vite")) {
    contents = injectImport(contents);
    changed = true;
  }

  if (!/\bcollie\s*\(/.test(contents)) {
    const updated = injectColliePlugin(contents);
    if (!updated) {
      throw new Error(
        "Could not find a plugins array in your Vite config. Add collie() manually to your plugins list."
      );
    }
    contents = updated;
    changed = true;
  }

  if (changed) {
    await fs.writeFile(configPath, contents, "utf8");
  }
}

function injectColliePlugin(source: string): string | null {
  const pluginPattern = /plugins\s*[:=]\s*\[/g;
  let match: RegExpExecArray | null;

  while ((match = pluginPattern.exec(source)) !== null) {
    const bracketIndex = match.index + match[0].length - 1;
    const updated = insertPluginIntoArray(source, bracketIndex);
    if (updated) {
      return updated;
    }
  }

  return null;
}

function insertPluginIntoArray(source: string, bracketStart: number): string | null {
  const bracketEnd = findMatchingBracket(source, bracketStart);
  if (bracketEnd === -1) return null;

  const before = source.slice(0, bracketStart + 1);
  const inside = source.slice(bracketStart + 1, bracketEnd);
  const after = source.slice(bracketEnd);
  const trimmedInside = inside.trim();

  const lineStart = source.lastIndexOf("\n", bracketStart);
  const indentMatch = source.slice(lineStart + 1, bracketStart).match(/^\s*/);
  const baseIndent = indentMatch ? indentMatch[0] : "";
  const entryIndent = `${baseIndent}  `;

  if (!trimmedInside) {
    const insertion = `\n${entryIndent}collie()\n${baseIndent}`;
    return `${before}${insertion}${after}`;
  }

  const afterOpenIndex = bracketStart + 1;
  const rest = source.slice(afterOpenIndex, bracketEnd);
  const leadingWhitespaceMatch = rest.match(/^\s*/);
  const leadingWhitespace = leadingWhitespaceMatch ? leadingWhitespaceMatch[0] : "";
  const isMultiline = leadingWhitespace.includes("\n");
  const insertText = isMultiline
    ? `\n${entryIndent}collie(),`
    : ` collie(),${needsTrailingSpace(rest) ? " " : ""}`;

  return `${source.slice(0, afterOpenIndex)}${insertText}${source.slice(afterOpenIndex)}`;
}

function needsTrailingSpace(rest: string): boolean {
  const trimmed = rest.trimStart();
  if (!trimmed.length) return false;
  const nextChar = trimmed[0];
  return nextChar !== "," && nextChar !== " ";
}

function findMatchingBracket(text: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    const char = text[i];
    if (char === "[") depth++;
    else if (char === "]") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

async function ensureCollieDeclaration(root: string): Promise<void> {
  const target = path.join(root, "src", "collie.d.ts");
  if (existsSync(target)) return;
  await fs.mkdir(path.dirname(target), { recursive: true });

  const declaration = `// Allows importing Collie templates as React components.
// Customize this typing if your templates expose specific props.
declare module "*.collie" {
  import type { ComponentType } from "react";
  const component: ComponentType<Record<string, unknown>>;
  export default component;
}
`;

  await fs.writeFile(target, declaration, "utf8");
}

function findViteConfigFile(root: string): string | null {
  for (const file of VITE_CONFIG_FILES) {
    const candidate = path.join(root, file);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function injectImport(source: string): string {
  const importStatement = `import collie from "@collie-lang/vite";\n`;
  const importMatches = [...source.matchAll(/^import.*$/gm)];
  const insertPos =
    importMatches.length > 0 ? computeInsertPos(source, importMatches[importMatches.length - 1]) : 0;
  return source.slice(0, insertPos) + importStatement + source.slice(insertPos);
}

function computeInsertPos(content: string, match: RegExpMatchArray): number {
  let pos = (match.index ?? 0) + match[0].length;
  if (content[pos] === "\r") pos += 1;
  if (content[pos] === "\n") pos += 1;
  return pos;
}

function readCliPackageVersion(): string {
  try {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const pkgPath = path.resolve(dir, "..", "package.json");
    const raw = readFileSync(pkgPath, "utf8");
    const pkg = JSON.parse(raw);
    return typeof pkg.version === "string" ? pkg.version : "latest";
  } catch {
    return "latest";
  }
}

function getViteDependencyInfo(pkg: Record<string, any>): { range: string; major: number | null } | null {
  const spec =
    (pkg.devDependencies && pkg.devDependencies.vite) ||
    (pkg.dependencies && pkg.dependencies.vite) ||
    null;
  if (!spec) return null;
  const normalized = spec.replace(/^workspace:/, "").replace(/^[~^>=<\s]*/, "");
  const match = normalized.match(/(\d+)(?:\.\d+)?/);
  return { range: spec, major: match ? Number(match[1]) : null };
}

function maybeWarnAboutViteVersion(info: { range: string; major: number | null } | null): void {
  if (info?.major && info.major < 7) {
    console.log(
      pc.yellow(
        `! Detected Vite ${info.range}. Collie works best with Vite 7+. Consider upgrading if you run into issues.`
      )
    );
  }
}

function printNextSteps(pkgManager: PackageManager, configPath: string): void {
  const devCommand = formatDevCommand(pkgManager);
  console.log("");
  console.log(pc.green("Next steps:"));
  console.log(`  - Create a Collie template under src (e.g. src/Hello.collie).`);
  console.log(`  - Import it in your React app and run ${devCommand} to start Vite.`);
  console.log(`  - Need to adjust plugins later? Edit ${path.basename(configPath)}.`);
}

function formatDevCommand(pkgManager: PackageManager): string {
  if (pkgManager === "pnpm") return "pnpm dev";
  if (pkgManager === "yarn") return "yarn dev";
  return "npm run dev";
}

function runCommand(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

interface FormatFlags {
  write: boolean;
  check: boolean;
  diff: boolean;
  indent: number;
  config?: string;
}

async function runFormat(args: string[]): Promise<void> {
  const { patterns, flags } = parseFormatArgs(args);
  if (patterns.length === 0) {
    throw new Error("No file patterns provided. Usage: collie format <files...>");
  }

  const cwd = process.cwd();
  const files = await fg(patterns, { cwd, onlyFiles: true, unique: true });
  if (!files.length) {
    console.log(pc.yellow("No files found"));
    return;
  }

  files.sort();
  let written = 0;
  let needsFormatting = 0;
  let failures = 0;

  for (const file of files) {
    let contents: string;
    try {
      contents = await fs.readFile(file, "utf8");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(pc.red(`[collie] Failed to read ${file}: ${message}`));
      failures++;
      continue;
    }

    let result;
    try {
      result = formatSource(contents, { indent: flags.indent });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(pc.red(`[collie] Failed to format ${file}: ${message}`));
      failures++;
      continue;
    }

    if (!result.success) {
      printDiagnostics(file, result.diagnostics);
      failures++;
      continue;
    }

    const changed = result.formatted !== contents;

    if (flags.diff && changed) {
      printDiff(file, contents, result.formatted);
    }

    if (flags.check) {
      if (changed) {
        console.log(pc.red(`${file} needs formatting`));
        needsFormatting++;
      } else {
        console.log(pc.green(`${file} is formatted`));
      }
      continue;
    }

    if (flags.write) {
      if (changed) {
        await fs.writeFile(file, result.formatted, "utf8");
        written++;
        console.log(pc.green(`Formatted ${file}`));
      } else {
        console.log(pc.dim(`${file} already formatted`));
      }
      continue;
    }

    if (!flags.diff) {
      process.stdout.write(result.formatted);
    }
  }

  if (flags.check) {
    if (needsFormatting > 0) {
      console.log(pc.red(`\n✖ ${needsFormatting} file${needsFormatting === 1 ? "" : "s"} need formatting`));
      console.log(pc.dim("Run: collie format --write to fix"));
      process.exitCode = 1;
    } else {
      console.log(pc.green("All files formatted"));
    }
  } else if (flags.write) {
    console.log(pc.green(`Formatted ${written} file${written === 1 ? "" : "s"}`));
  }

  if (failures > 0) {
    process.exitCode = 1;
  }
}

function parseFormatArgs(args: string[]): { patterns: string[]; flags: FormatFlags } {
  const flags: FormatFlags = { write: false, check: false, diff: false, indent: 2 };
  const patterns: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--write" || arg === "-w") {
      flags.write = true;
      continue;
    }
    if (arg === "--check" || arg === "-c") {
      flags.check = true;
      continue;
    }
    if (arg === "--diff" || arg === "-d") {
      flags.diff = true;
      continue;
    }
    if (arg === "--indent") {
      const value = args[i + 1];
      if (!value) {
        throw new Error("--indent flag expects a number.");
      }
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < 1) {
        throw new Error("Indent width must be a positive integer.");
      }
      flags.indent = Math.floor(parsed);
      i++;
      continue;
    }
    if (arg === "--config") {
      const value = args[i + 1];
      if (!value) {
        throw new Error("--config flag expects a path.");
      }
      flags.config = value;
      i++;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    patterns.push(arg);
  }

  if (flags.write && flags.check) {
    throw new Error("Cannot use --write and --check together.");
  }

  return { patterns, flags };
}

function printDiagnostics(file: string, diagnostics: Diagnostic[]): void {
  for (const diag of diagnostics) {
    const location = diag.span ? `${diag.span.start.line}:${diag.span.start.col}` : "";
    const prefix = location ? `${file}:${location}` : file;
    const codeSuffix = diag.code ? ` (${diag.code})` : "";
    const message = `${prefix} ${diag.message}${codeSuffix}`;
    if (diag.severity === "warning") {
      console.warn(pc.yellow(message));
    } else {
      console.error(pc.red(message));
    }
  }
}

function printDiff(file: string, before: string, after: string): void {
  console.log(pc.cyan(`diff -- ${file}`));
  const diff = diffLines(before, after);
  for (const part of diff) {
    const prefix = part.added ? "+" : part.removed ? "-" : " ";
    const color = part.added ? pc.green : part.removed ? pc.red : pc.dim;
    const lines = part.value.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (i === lines.length - 1 && line === "") {
        continue;
      }
      console.log(color(`${prefix}${line}`));
    }
  }
}

function getFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  const value = args[index + 1];
  if (!value || value.startsWith("-")) {
    throw new Error(`${flag} flag expects a value.`);
  }
  return value;
}

function hasFlag(args: string[], ...names: string[]): boolean {
  return names.some((name) => args.includes(name));
}

function parseJsxRuntime(value?: string): "automatic" | "classic" {
  if (!value) {
    return "automatic";
  }
  if (value === "automatic" || value === "classic") {
    return value;
  }
  throw new Error('Invalid --jsx flag. Use "automatic" or "classic".');
}

main().catch((error) => {
  console.error(pc.red(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
