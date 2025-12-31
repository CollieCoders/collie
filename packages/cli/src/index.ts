import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fg from "fast-glob";
import { diffLines } from "diff";
import pc from "picocolors";
import prompts from "prompts";
import { formatSource } from "./formatter";
import type { Diagnostic } from "@collie-lang/compiler";
import { watch as watchCollie } from "./watcher";
import { build as runBuild } from "./builder";
import { check as runCheck } from "./checker";
import { create as createProject, formatTemplateList } from "./creator";
import { hasNextDependency, setupNextJs } from "./nextjs-setup";
import type { NextDirectoryInfo } from "./nextjs-setup";
import { convertFile } from "./converter";
import { filterDiagnostics, printDoctorResults, runDoctor } from "./doctor";
import { formatDiagnosticLine, printSummary } from "./output";

type PackageManager = "pnpm" | "yarn" | "npm";
type Framework = "vite" | "nextjs";

interface InitOptions {
  framework?: Framework;
  projectName?: string;
  typescript?: boolean;
  packageManager?: PackageManager;
  noInstall?: boolean;
}

const VITE_CONFIG_FILES = ["vite.config.ts", "vite.config.mts", "vite.config.js", "vite.config.mjs"] as const;
const CLI_PACKAGE_INFO = readCliPackageInfo();
const CLI_PACKAGE_VERSION = CLI_PACKAGE_INFO.version;
const CLI_DEPENDENCY_SPECS = CLI_PACKAGE_INFO.dependencies;
const DEFAULT_DEPENDENCY_RANGE = CLI_PACKAGE_VERSION === "latest" ? "latest" : `^${CLI_PACKAGE_VERSION}`;
const COLLIE_COMPILER_DEPENDENCY = formatCollieDependency("@collie-lang/compiler");
const COLLIE_VITE_DEPENDENCY = formatCollieDependency("@collie-lang/vite");
const COLLIE_DEPENDENCIES = [COLLIE_COMPILER_DEPENDENCY, COLLIE_VITE_DEPENDENCY];
const COLLIE_NEXT_DEPENDENCY = formatCollieDependency("@collie-lang/next");
const COLLIE_NEXT_VERSION_RANGE = normalizeDependencyRange(
  CLI_DEPENDENCY_SPECS["@collie-lang/next"],
  DEFAULT_DEPENDENCY_RANGE
);
const PROMPT_OPTIONS = {
  onCancel: () => {
    console.log(pc.yellow("\nCancelled"));
    process.exit(0);
  }
} as const;

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
      printCliError(message);
      process.exit(1);
    }
    return;
  }

  if (cmd === "check") {
    const rest = args.slice(1);
    const patterns = rest.filter((arg) => !arg.startsWith("-"));
    if (patterns.length === 0) {
      throw new Error("No file patterns provided. Usage: collie check <files...>");
    }

    const formatValue = getFlag(rest, "--format");
    const format = formatValue ? validateFormatFlag(formatValue) : "text";
    const maxWarningsValue = getFlag(rest, "--max-warnings");
    let maxWarnings = -1;
    if (maxWarningsValue !== undefined) {
      const parsed = Number(maxWarningsValue);
      if (!Number.isInteger(parsed) || parsed < 0) {
        throw new Error("--max-warnings expects a non-negative integer.");
      }
      maxWarnings = parsed;
    }

    const options = {
      verbose: hasFlag(rest, "--verbose", "-v"),
      format,
      noWarnings: hasFlag(rest, "--no-warnings"),
      maxWarnings: maxWarnings >= 0 ? maxWarnings : undefined
    };

    const result = await runCheck(patterns, options);

    if (result.errorCount > 0) {
      process.exitCode = 1;
    } else if (maxWarnings >= 0 && result.warningCount > maxWarnings) {
      printCliError(
        `Exceeded maximum warnings: ${result.warningCount} warning${result.warningCount === 1 ? "" : "s"} (limit ${maxWarnings})`
      );
      console.error(pc.dim("Next: fix warnings or raise --max-warnings."));
      process.exitCode = 1;
    }
    return;
  }

  if (cmd === "create") {
    const rest = args.slice(1);
    let projectName: string | undefined;
    const flagArgs: string[] = [];
    for (const arg of rest) {
      if (!projectName && !arg.startsWith("-")) {
        projectName = arg;
      } else {
        flagArgs.push(arg);
      }
    }

    const templateListRequested = hasFlag(flagArgs, "--list-templates");
    if (templateListRequested) {
      console.log(pc.bold("Available templates:\n"));
      console.log(formatTemplateList());
      console.log("\nRun collie create <project-name> --template <template> to scaffold with a specific option.\n");
      return;
    }

    const template = getFlag(flagArgs, "--template");
    const typescriptFlag = hasFlag(flagArgs, "--typescript");
    const javascriptFlag = hasFlag(flagArgs, "--javascript");
    if (typescriptFlag && javascriptFlag) {
      throw new Error("Use only one of --typescript or --javascript.");
    }

    const options = {
      projectName,
      template,
      typescript: typescriptFlag ? true : javascriptFlag ? false : undefined,
      packageManager: getFlag(flagArgs, "--package-manager") as "npm" | "yarn" | "pnpm" | undefined,
      noInstall: hasFlag(flagArgs, "--no-install"),
      noGit: hasFlag(flagArgs, "--no-git")
    };

    await createProject(options);
    return;
  }

  if (cmd === "convert") {
    const rest = args.slice(1);
    const patterns = rest.filter((arg) => !arg.startsWith("-"));
    if (patterns.length === 0) {
      throw new Error("No files provided. Usage: collie convert <files...>");
    }
    const write = hasFlag(rest, "--write", "-w");
    const overwrite = hasFlag(rest, "--overwrite");
    const removeOriginal = hasFlag(rest, "--remove-original");
    if (removeOriginal && !write) {
      throw new Error("--remove-original can only be used with --write.");
    }

    const files = await fg(patterns, {
      absolute: false,
      onlyFiles: true,
      unique: true
    });

    if (!files.length) {
      printSummary("warning", "No files matched the provided patterns", undefined, "check the paths and try again");
      return;
    }
    files.sort();

    const options = { write, overwrite, removeOriginal };
    let converted = 0;
    let failed = 0;
    for (const file of files) {
      try {
        const result = await convertFile(file, options);
        if (write) {
          const target = result.outputPath ?? file.replace(/\.[tj]sx?$/, ".collie");
          console.log(pc.green(`✔ Converted ${file} → ${target}`));
          converted++;
        } else {
          console.log(pc.gray(`// Converted from ${file}\n`));
          process.stdout.write(result.collie);
          if (!result.collie.endsWith("\n")) {
            process.stdout.write("\n");
          }
          console.log("");
        }
        for (const warning of result.warnings) {
          console.warn(pc.yellow(`⚠ ${file}: ${warning}`));
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(pc.red(`✖ Failed to convert ${file}: ${message}`));
        process.exitCode = 1;
        failed++;
      }
    }
    if (write) {
      if (failed === 0) {
        printSummary(
          "success",
          `Converted ${converted} file${converted === 1 ? "" : "s"}`,
          `wrote ${converted} .collie file${converted === 1 ? "" : "s"}`,
          "review the generated templates or run collie check"
        );
      } else {
        const changeDetail =
          converted > 0
            ? `wrote ${converted} .collie file${converted === 1 ? "" : "s"} before failing`
            : undefined;
        printSummary(
          "error",
          `Converted ${converted} file${converted === 1 ? "" : "s"} with ${failed} failure${failed === 1 ? "" : "s"}`,
          changeDetail,
          "fix the errors above and rerun collie convert"
        );
      }
    }
    return;
  }

  if (cmd === "doctor") {
    const rest = args.slice(1);
    const jsonOutput = hasFlag(rest, "--json");
    const subsystem = getFlag(rest, "--check");
    const results = await runDoctor({ cwd: process.cwd() });
    const filtered = filterDiagnostics(results, subsystem);
    if (subsystem && filtered.length === 0) {
      printCliError(`Unknown subsystem for --check: ${subsystem}`);
      console.error(pc.dim("Next: run collie doctor to list available checks."));
      process.exit(1);
    }
    if (jsonOutput) {
      console.log(JSON.stringify(filtered, null, 2));
    } else {
      printDoctorResults(filtered);
    }
    if (filtered.some((result) => result.status === "fail")) {
      process.exitCode = 1;
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
    const verboseFlag = hasFlag(flagArgs, "--verbose", "-v");
    const sourcemapFlag = hasFlag(flagArgs, "--sourcemap");
    const jsxFlag = getFlag(flagArgs, "--jsx");
    await watchCollie(inputPath, {
      outDir: getFlag(flagArgs, "--outDir"),
      sourcemap: sourcemapFlag ? true : undefined,
      ext: getFlag(flagArgs, "--ext"),
      jsxRuntime: jsxFlag ? parseJsxRuntime(jsxFlag) : undefined,
      verbose: verboseFlag ? true : undefined
    });
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
    const sourcemapFlag = hasFlag(flagArgs, "--sourcemap");
    const jsxFlag = getFlag(flagArgs, "--jsx");
    const result = await runBuild(inputPath, {
      outDir: getFlag(flagArgs, "--outDir"),
      sourcemap: sourcemapFlag ? true : undefined,
      jsxRuntime: jsxFlag ? parseJsxRuntime(jsxFlag) : undefined,
      verbose: verbose ? true : undefined,
      quiet: quiet ? true : undefined
    });
    if (result.errors.length > 0) {
      process.exitCode = 1;
    }
    return;
  }

  if (cmd === "init") {
    const rest = args.slice(1);
    const flagsNeedingValue = new Set(["--project", "--package-manager", "--framework"]);
    let pendingFlag: string | null = null;
    let positionalProject: string | undefined;
    const extraArgs: string[] = [];

    for (const arg of rest) {
      if (pendingFlag) {
        pendingFlag = null;
        continue;
      }
      if (arg.startsWith("-")) {
        if (flagsNeedingValue.has(arg)) {
          pendingFlag = arg;
        }
        continue;
      }
      if (!positionalProject) {
        positionalProject = arg;
      } else {
        extraArgs.push(arg);
      }
    }

    if (pendingFlag) {
      throw new Error(`${pendingFlag} flag expects a value.`);
    }
    if (extraArgs.length > 0) {
      throw new Error(`Unexpected argument(s): ${extraArgs.join(", ")}`);
    }

    const frameworkValue = getFlag(rest, "--framework");
    const framework =
      (frameworkValue === "vite" || frameworkValue === "nextjs"
        ? frameworkValue
        : undefined) ??
      (hasFlag(rest, "--nextjs") ? "nextjs" : undefined) ??
      (hasFlag(rest, "--vite") ? "vite" : undefined);

    const typescriptFlag = hasFlag(rest, "--typescript");
    const javascriptFlag = hasFlag(rest, "--javascript");
    if (typescriptFlag && javascriptFlag) {
      throw new Error("Use only one of --typescript or --javascript.");
    }

    const packageManagerValue = getFlag(rest, "--package-manager");
    let packageManager: PackageManager | undefined;
    if (packageManagerValue) {
      if (packageManagerValue !== "npm" && packageManagerValue !== "yarn" && packageManagerValue !== "pnpm") {
        throw new Error('Invalid --package-manager value. Use "npm", "yarn", or "pnpm".');
      }
      packageManager = packageManagerValue;
    }

    const projectName = getFlag(rest, "--project") ?? positionalProject;
    const initOptions: InitOptions = {
      framework: framework as Framework | undefined,
      projectName,
      typescript: typescriptFlag ? true : javascriptFlag ? false : undefined,
      packageManager,
      noInstall: hasFlag(rest, "--no-install")
    };

    try {
      await runInit(initOptions);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      printCliError(message);
      process.exit(1);
    }
    return;
  }

  printCliError(`Unknown command: ${cmd}`);
  process.exit(1);
}

function printHelp() {
  console.log(`${pc.bold("collie")}

Usage:
  collie <command> [options]

Commands:
  collie build    Compile .collie templates to .tsx
  collie check    Validate .collie templates
  collie format   Format .collie templates
  collie convert  Convert JSX/TSX to .collie templates
  collie doctor   Diagnose setup issues
  collie init     Initialize Collie in Vite or Next.js projects
  collie watch    Watch and compile templates
  collie create   Scaffold a new Collie project
`);
}

async function runInit(options: InitOptions = {}): Promise<void> {
  const projectRoot = process.cwd();
  const packageJson = await readProjectPackage(projectRoot);
  const detectedFramework = packageJson ? detectFrameworkFromPackage(packageJson) : null;

  let framework = options.framework ?? detectedFramework;
  if (!framework) {
    framework = await promptFramework();
  }

  if (framework === "nextjs") {
    if (!packageJson) {
      throw new Error("package.json not found. Run this inside a Next.js project.");
    }
    if (!hasNextDependency(packageJson)) {
      throw new Error("Not a Next.js project. 'next' not found in package.json");
    }

    console.log(pc.cyan("Detected Next.js project\n"));

    if (options.noInstall) {
      console.log(
        pc.yellow("Skipping dependency installation (--no-install). Install @collie-lang/next manually.")
      );
    } else {
      const packageManager = detectPackageManager(projectRoot);
      console.log(pc.cyan(`Installing @collie-lang/next with ${packageManager}...`));
      await installDevDependencies(packageManager, projectRoot, [COLLIE_NEXT_DEPENDENCY]);
      console.log(pc.green("✔ Installed @collie-lang/next"));
    }

    const nextDirectory = await setupNextJs(projectRoot, {
      skipDetectionLog: true,
      collieNextVersion: COLLIE_NEXT_VERSION_RANGE
    });
    printNextJsInstructions(nextDirectory);
    return;
  }

  await initViteProject();
}

async function readProjectPackage(projectRoot: string): Promise<Record<string, any> | null> {
  const packageJsonPath = path.join(projectRoot, "package.json");
  if (!existsSync(packageJsonPath)) {
    return null;
  }
  const raw = await fs.readFile(packageJsonPath, "utf8");
  return JSON.parse(raw);
}

function detectFrameworkFromPackage(pkg: Record<string, any>): Framework | null {
  if (hasNextDependency(pkg)) {
    return "nextjs";
  }
  if (getViteDependencyInfo(pkg)) {
    return "vite";
  }
  return null;
}

async function promptFramework(): Promise<Framework> {
  const response = await prompts(
    {
      type: "select",
      name: "framework",
      message: "Which framework would you like to set up?",
      choices: [
        { title: "Vite (existing project)", value: "vite" },
        { title: "Next.js (existing project)", value: "nextjs" }
      ],
      initial: 0
    },
    PROMPT_OPTIONS
  );
  return response.framework === "nextjs" ? "nextjs" : "vite";
}

async function initViteProject(): Promise<void> {
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

  console.log(pc.green("✔ Collie is ready! Add a .collie file and import it in your Vite app."));
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

function readCliPackageInfo(): { version: string; dependencies: Record<string, string> } {
  try {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const pkgPath = path.resolve(dir, "..", "package.json");
    const raw = readFileSync(pkgPath, "utf8");
    const pkg = JSON.parse(raw);
    const version = typeof pkg.version === "string" ? pkg.version : "latest";
    const dependencies =
      pkg && typeof pkg === "object" && pkg.dependencies && typeof pkg.dependencies === "object"
        ? pkg.dependencies
        : {};
    return { version, dependencies };
  } catch {
    return { version: "latest", dependencies: {} };
  }
}

function formatCollieDependency(packageName: string): string {
  return CLI_PACKAGE_VERSION === "latest" ? packageName : `${packageName}@${CLI_PACKAGE_VERSION}`;
}

function normalizeDependencyRange(spec: string | undefined, fallback: string): string {
  if (!spec) {
    return fallback;
  }
  if (spec.startsWith("workspace:")) {
    const trimmed = spec.replace(/^workspace:/, "");
    return trimmed && trimmed !== "*" ? trimmed : fallback;
  }
  return spec;
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

function printNextJsInstructions(info?: NextDirectoryInfo): void {
  const detected = info?.detected ?? false;
  const routerLabel = detected ? (info?.routerType === "app" ? "App Router" : "Pages Router") : "Next.js";
  const baseDirDisplay = (detected ? info?.baseDir ?? "app" : "app").replace(/\\/g, "/");
  const entryFile = info?.routerType === "pages" ? "index.tsx" : "page.tsx";
  const entryDisplay = `${baseDirDisplay}/${entryFile}`.replace(/\/+/g, "/");

  console.log(pc.green("\n🎉 Collie is ready for Next.js!\n"));
  console.log(pc.cyan(`Next steps (${routerLabel}):`));
  console.log(`  - Import .collie components inside ${entryDisplay}:`);
  console.log(pc.gray(`    import Welcome from "./components/Welcome.collie"`));
  console.log("");
  console.log("  - Collie components render as Server Components by default.");
  console.log("  - Add @client at the top of a .collie file to opt into a Client Component.");
  console.log("");
  console.log("  - Run your Next.js dev server:");
  console.log(pc.gray("    npm run dev"));
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
  indent?: number;
}

async function runFormat(args: string[]): Promise<void> {
  const { patterns, flags } = parseFormatArgs(args);
  if (patterns.length === 0) {
    throw new Error("No file patterns provided. Usage: collie format <files...>");
  }
  const indent = flags.indent ?? 2;

  const cwd = process.cwd();
  const files = await fg(patterns, { cwd, onlyFiles: true, unique: true });
  if (!files.length) {
    printSummary("warning", "No files matched the provided patterns", undefined, "check the glob and try again");
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
      console.error(pc.red(`✖ Failed to read ${file}: ${message}`));
      failures++;
      continue;
    }

    let result;
    try {
      result = formatSource(contents, { indent });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(pc.red(`✖ Failed to format ${file}: ${message}`));
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
        console.log(pc.red(`✖ ${file} needs formatting`));
        needsFormatting++;
      } else {
        console.log(pc.green(`✔ ${file} is formatted`));
      }
      continue;
    }

    if (flags.write) {
      if (changed) {
        await fs.writeFile(file, result.formatted, "utf8");
        written++;
        console.log(pc.green(`✔ Formatted ${file}`));
      } else {
        console.log(pc.dim(`- ${file} already formatted`));
      }
      continue;
    }

    if (!flags.diff) {
      process.stdout.write(result.formatted);
    }
  }

  if (flags.check) {
    if (needsFormatting > 0) {
      console.log("");
      printSummary(
        "error",
        `${needsFormatting} file${needsFormatting === 1 ? "" : "s"} need formatting`,
        "no files changed"
      );
      console.log(pc.dim("Run: collie format --write to fix"));
      process.exitCode = 1;
    } else if (failures > 0) {
      printSummary(
        "error",
        `Failed to check ${failures} file${failures === 1 ? "" : "s"}`,
        "no files changed",
        "resolve the errors above and rerun collie format --check"
      );
    } else {
      printSummary(
        "success",
        `All ${files.length} file${files.length === 1 ? "" : "s"} formatted`,
        "no files changed",
        "run collie build when you are ready to compile"
      );
    }
  } else if (flags.write) {
    if (failures > 0) {
      printSummary(
        "error",
        `Formatted ${written} file${written === 1 ? "" : "s"} with ${failures} failure${failures === 1 ? "" : "s"}`,
        `wrote ${written} file${written === 1 ? "" : "s"} to disk`,
        "fix the errors above and rerun collie format --write"
      );
    } else {
      printSummary(
        "success",
        `Formatted ${written} file${written === 1 ? "" : "s"}`,
        `wrote ${written} file${written === 1 ? "" : "s"} to disk`,
        "review the changes or run collie check"
      );
    }
  }

  if (failures > 0) {
    process.exitCode = 1;
  }
}

function parseFormatArgs(args: string[]): { patterns: string[]; flags: FormatFlags } {
  const flags: FormatFlags = { write: false, check: false, diff: false };
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
    const message = formatDiagnosticLine({ ...diag, file }, file);
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
    throw new Error("--jsx flag expects a value.");
  }
  if (value === "automatic" || value === "classic") {
    return value;
  }
  throw new Error('Invalid --jsx flag. Use "automatic" or "classic".');
}

function validateFormatFlag(value: string): "text" | "json" {
  if (value === "text" || value === "json") {
    return value;
  }
  throw new Error('Invalid --format flag. Use "text" or "json".');
}

function printCliError(message: string): void {
  console.error(pc.red(`✖ ${message}`));
}

main().catch((error) => {
  printCliError(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
