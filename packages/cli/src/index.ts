import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import fg from "fast-glob";
import { diffLines } from "diff";
import pc from "picocolors";
import prompts from "prompts";
import { formatSource } from "./formatter";
import type { Diagnostic } from "@collie-lang/compiler";
import { watch as watchCollie } from "./watcher";
import { build as runBuild } from "./builder";
import {
  buildDuplicateDiagnostics,
  check as runCheck,
  scanTemplates,
  type TemplateInfo
} from "./checker";
import { create as createProject, formatTemplateList } from "./creator";
import { hasNextDependency, setupNextJs } from "./nextjs-setup";
import type { NextDirectoryInfo } from "./nextjs-setup";
import { convertFile } from "./converter";
import { filterDiagnostics, printDoctorResults, runDoctor } from "./doctor";
import { formatDiagnosticLine, printSummary } from "./output";

type PackageManager = "pnpm" | "yarn" | "npm";
type Framework = "vite" | "nextjs";
type CollieProjectType = "react-vite" | "react-next" | "react-generic" | "html";
type CssStrategy = "tailwind" | "global" | "unknown";
type CssDiagnosticLevel = "off" | "warn";
type PreflightCommand = "init" | "check";

interface PreflightOptions {
  framework?: Framework;
  packageManager?: PackageManager;
}

interface CssDetectionResult {
  strategy: CssStrategy;
  unknownClass: CssDiagnosticLevel;
  reasons: string[];
}

interface InitOptions {
  framework?: Framework;
  projectName?: string;
  typescript?: boolean;
  packageManager?: PackageManager;
  noInstall?: boolean;
}

const VITE_CONFIG_FILES = ["vite.config.ts", "vite.config.mts", "vite.config.js", "vite.config.mjs"] as const;
const TAILWIND_CONFIG_FILES = [
  "tailwind.config.js",
  "tailwind.config.cjs",
  "tailwind.config.mjs",
  "tailwind.config.ts"
] as const;
const POSTCSS_CONFIG_FILES = [
  "postcss.config.js",
  "postcss.config.cjs",
  "postcss.config.mjs",
  "postcss.config.ts"
] as const;
const COLLIE_CONFIG_FILES = [
  "collie.config.ts",
  "collie.config.js",
  "collie.config.mjs",
  "collie.config.cjs",
  "collie.config.json"
] as const;
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
const COLLIE_CORE_PACKAGES = ["@collie-lang/compiler", "@collie-lang/config"] as const;
const COLLIE_VITE_PACKAGES = [
  ...COLLIE_CORE_PACKAGES,
  "@collie-lang/vite",
  "@collie-lang/html-runtime"
] as const;
const COLLIE_NEXT_PACKAGES = [...COLLIE_CORE_PACKAGES, "@collie-lang/next"] as const;
const PROMPT_OPTIONS = {
  onCancel: () => {
    console.log(pc.yellow("\nCancelled"));
    process.exit(0);
  }
} as const;
let preflightCompleted = false;

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

    const shouldContinue = await runPreflight("check");
    if (!shouldContinue) {
      return;
    }

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

  if (cmd === "ids") {
    const rest = args.slice(1);
    const patterns = rest.filter((arg) => !arg.startsWith("-"));
    const resolvedPatterns = patterns.length ? patterns : ["**/*.collie"];
    try {
      await runIds(resolvedPatterns);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      printCliError(message);
      process.exit(1);
    }
    return;
  }

  if (cmd === "explain") {
    const rest = args.slice(1);
    const { id, patterns } = parseExplainArgs(rest);
    if (!id) {
      throw new Error("No template id provided. Usage: collie explain <id> [files...]");
    }
    const resolvedPatterns = patterns.length ? patterns : ["**/*.collie"];
    try {
      await runExplain(id, resolvedPatterns);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      printCliError(message);
      process.exit(1);
    }
    return;
  }

  if (cmd === "config") {
    const rest = args.slice(1);
    const shouldPrint = hasFlag(rest, "--print");
    if (!shouldPrint) {
      throw new Error('Missing required flag: --print (e.g. "collie config --print").');
    }
    const filePath = getFlag(rest, "--file");
    const cwdFlag = getFlag(rest, "--cwd");
    const cwd = cwdFlag
      ? path.resolve(process.cwd(), cwdFlag)
      : filePath
        ? path.dirname(path.resolve(process.cwd(), filePath))
        : process.cwd();

    let loadAndNormalizeConfig: typeof import("@collie-lang/config").loadAndNormalizeConfig;
    try {
      ({ loadAndNormalizeConfig } = await import("@collie-lang/config"));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to load @collie-lang/config (${message}).`);
    }

    const normalized = await loadAndNormalizeConfig({ cwd });
    if (!normalized) {
      throw new Error(`No Collie config found under ${cwd}.`);
    }
    console.log(JSON.stringify(normalized, null, 2));
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
      const shouldContinue = await runPreflight("init", {
        framework: initOptions.framework,
        packageManager: initOptions.packageManager
      });
      if (!shouldContinue) {
        return;
      }
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
  collie build    Compile .collie templates to output files
  collie check    Validate .collie templates
  collie config   Print resolved Collie config (json)
  collie ids      List template ids and their locations
  collie explain  Find the file + location for a template id
  collie format   Format .collie templates
  collie convert  Convert JSX/TSX to .collie templates
  collie doctor   Diagnose setup issues
  collie init     Create a Collie config and wire Vite when possible
  collie watch    Watch and compile templates
  collie create   Scaffold a new Collie project
`);
}

async function runIds(patterns: string[]): Promise<void> {
  const scan = await scanTemplates(patterns);
  const diagnostics = [...scan.diagnostics, ...buildDuplicateDiagnostics(scan.templates)];
  const errors = diagnostics.filter((diag) => diag.severity === "error");

  if (diagnostics.length) {
    printTemplateDiagnostics(diagnostics);
  }

  if (errors.length) {
    process.exitCode = 1;
    return;
  }

  const templates = [...scan.templates].sort((a, b) => {
    const byId = a.id.localeCompare(b.id);
    if (byId !== 0) return byId;
    return a.displayPath.localeCompare(b.displayPath);
  });

  if (!templates.length) {
    printSummary(
      "warning",
      "No template ids found",
      `checked ${scan.files.length} file${scan.files.length === 1 ? "" : "s"}`,
      "add #id blocks then rerun collie ids"
    );
    return;
  }

  for (const template of templates) {
    console.log(`${template.id}  ${formatTemplateLocation(template)}`);
  }
}

async function runExplain(id: string, patterns: string[]): Promise<void> {
  const scan = await scanTemplates(patterns);
  const diagnostics = [...scan.diagnostics, ...buildDuplicateDiagnostics(scan.templates)];
  const errors = diagnostics.filter((diag) => diag.severity === "error");

  if (diagnostics.length) {
    printTemplateDiagnostics(diagnostics);
  }

  if (errors.length) {
    process.exitCode = 1;
    return;
  }

  const matches = scan.templates.filter((template) => template.id === id);
  if (!matches.length) {
    const knownIds = Array.from(new Set(scan.templates.map((template) => template.id))).sort();
    const preview = knownIds.slice(0, 5);
    const suffix = knownIds.length > preview.length ? "..." : "";
    const details = preview.length ? `Known ids: ${preview.join(", ")}${suffix}` : "No template ids found.";
    printCliError(`Unknown template id "${id}". ${details}`);
    process.exitCode = 1;
    return;
  }

  const sorted = matches.sort((a, b) => a.displayPath.localeCompare(b.displayPath));
  for (const template of sorted) {
    console.log(`${template.id}  ${formatTemplateLocation(template)}`);
  }
}

function parseExplainArgs(args: string[]): { id?: string; patterns: string[] } {
  let id: string | undefined;
  const patterns: string[] = [];
  for (const arg of args) {
    if (arg.startsWith("-")) {
      continue;
    }
    if (!id) {
      id = arg;
      continue;
    }
    patterns.push(arg);
  }
  return { id, patterns };
}

function formatTemplateLocation(template: TemplateInfo): string {
  const span = template.span;
  if (span) {
    return `${template.displayPath}:${span.start.line}:${span.start.col}`;
  }
  return template.displayPath;
}

function printTemplateDiagnostics(diagnostics: Diagnostic[]): void {
  for (const diag of diagnostics) {
    const message = formatDiagnosticLine(diag);
    const writer = diag.severity === "warning" ? pc.yellow : pc.red;
    console.log(writer(message));
  }
  if (diagnostics.length) {
    console.log("");
  }
}

async function runInit(options: InitOptions = {}): Promise<void> {
  const projectRoot = process.cwd();
  const packageJson = await readProjectPackage(projectRoot);
  const detectedFramework = packageJson ? detectFrameworkFromPackage(packageJson) : null;
  const cssDetection = await detectCssStrategy(projectRoot, packageJson);

  const framework = options.framework ?? detectedFramework;
  const projectType = framework ? mapFrameworkToProjectType(framework) : await promptProjectType();

  const existingConfig = findExistingCollieConfig(projectRoot);
  const targetPath = existingConfig ?? path.join(projectRoot, "collie.config.ts");
  const relativeTarget = path.relative(projectRoot, targetPath) || path.basename(targetPath);

  console.log(pc.bold("collie init"));
  console.log(pc.dim("This creates a Collie config and applies framework wiring when possible."));
  if (framework) {
    console.log(pc.dim(`Detected ${formatFrameworkLabel(framework)} project.`));
  } else {
    console.log(pc.dim("No framework detected."));
  }
  console.log(pc.dim(`CSS strategy: ${formatCssDetection(cssDetection)}.`));
  console.log(pc.dim(`Override in ${relativeTarget} via css.strategy and css.diagnostics.unknownClass.`));
  console.log(pc.dim(`Project type: ${describeProjectType(projectType)}.`));
  console.log("");

  const configLabel = framework === "vite" ? "Vite-ready" : "Collie";
  const confirmMessage = existingConfig
    ? `${relativeTarget} already exists. Replace it with a ${configLabel} config?`
    : `Create ${relativeTarget}?`;
  const shouldWrite = await promptForConfirmation(confirmMessage, !existingConfig);
  if (!shouldWrite) {
    const detail = existingConfig ? `left ${relativeTarget} unchanged` : "no files created";
    printSummary("warning", "No changes made", detail, "run collie init when you are ready");
    return;
  }

  const contents = buildInitConfig(projectType, path.extname(targetPath).toLowerCase(), cssDetection);
  await fs.writeFile(targetPath, contents, "utf8");

  const typeDeclarationsPath = path.join(projectRoot, "src", "collie.d.ts");
  let typeDeclarationsStatus: "created" | "exists" | "skipped" = "skipped";
  if (projectType !== "html" && shouldWriteTypeDeclarations(projectRoot, options)) {
    if (existsSync(typeDeclarationsPath)) {
      typeDeclarationsStatus = "exists";
    } else {
      await ensureCollieDeclaration(projectRoot);
      typeDeclarationsStatus = "created";
    }
  }

  let viteConfigStatus: "patched" | "already-configured" | "manual" | "not-found" | "skipped" = "skipped";
  let viteConfigPath: string | null = null;
  if (framework === "vite") {
    viteConfigPath = findViteConfigFile(projectRoot);
    if (viteConfigPath) {
      viteConfigStatus = await patchViteConfig(viteConfigPath);
    } else {
      viteConfigStatus = "not-found";
    }
  }

  printSummary("success", "Initialized Collie config", `created ${relativeTarget}`);

  if (typeDeclarationsStatus !== "skipped") {
    const declarationLabel = path.relative(projectRoot, typeDeclarationsPath) || path.basename(typeDeclarationsPath);
    if (typeDeclarationsStatus === "created") {
      console.log(pc.green(`✔ Added ${declarationLabel} for .collie typings`));
    } else {
      console.log(pc.dim(`- ${declarationLabel} already exists`));
    }
  } else if (projectType !== "html") {
    console.log(
      pc.dim("Skipping .collie typings (no TypeScript config found). Add src/collie.d.ts if you enable TypeScript.")
    );
  }

  if (framework === "vite") {
    if (viteConfigStatus === "patched" && viteConfigPath) {
      console.log(pc.green(`✔ Updated ${path.relative(projectRoot, viteConfigPath) || path.basename(viteConfigPath)}`));
    } else if (viteConfigStatus === "already-configured" && viteConfigPath) {
      console.log(
        pc.dim(`- ${path.relative(projectRoot, viteConfigPath) || path.basename(viteConfigPath)} already includes collie()`)
      );
    } else if (viteConfigStatus === "manual" && viteConfigPath) {
      console.log(
        pc.yellow(
          `⚠ Could not patch ${path.relative(projectRoot, viteConfigPath) || path.basename(viteConfigPath)}. Add collie() manually to the Vite plugins array.`
        )
      );
    } else if (viteConfigStatus === "not-found") {
      console.log(pc.yellow("⚠ Vite config not found. Add the Collie plugin to vite.config.ts manually."));
    }
  }

  if (framework === "vite") {
    const pkgManager = options.packageManager ?? detectPackageManager(projectRoot);
    printNextSteps(pkgManager, targetPath);
  }
  if (!framework) {
    console.log(pc.dim(`Tip: update the project type in ${relativeTarget} if needed.`));
  }
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

function mapFrameworkToProjectType(framework: Framework): CollieProjectType {
  return framework === "nextjs" ? "react-next" : "react-vite";
}

function formatFrameworkLabel(framework: Framework): string {
  return framework === "nextjs" ? "Next.js" : "Vite";
}

function describeProjectType(projectType: CollieProjectType): string {
  const labels: Record<CollieProjectType, string> = {
    "react-vite": "React (Vite)",
    "react-next": "React (Next.js)",
    "react-generic": "React (generic)",
    html: "HTML (no framework)"
  };
  return labels[projectType];
}

function shouldWriteTypeDeclarations(projectRoot: string, options: InitOptions): boolean {
  if (options.typescript === false) {
    return false;
  }
  if (options.typescript === true) {
    return true;
  }
  return existsSync(path.join(projectRoot, "tsconfig.json"));
}

async function detectCssStrategy(
  projectRoot: string,
  packageJson: Record<string, any> | null
): Promise<CssDetectionResult> {
  const reasons: string[] = [];

  try {
    let tailwindDetected = false;
    for (const filename of TAILWIND_CONFIG_FILES) {
      if (existsSync(path.join(projectRoot, filename))) {
        reasons.push(`${filename} found`);
        tailwindDetected = true;
      }
    }

    if (packageJson && hasTailwindDependency(packageJson)) {
      reasons.push("package.json includes tailwindcss");
      tailwindDetected = true;
    }

    const postcssHit = await scanPostcssForTailwind(projectRoot);
    if (postcssHit) {
      reasons.push(`${postcssHit} mentions tailwindcss`);
      tailwindDetected = true;
    }

    const cssHit = await scanTopLevelCssForTailwind(projectRoot);
    if (cssHit) {
      reasons.push(`${cssHit} contains @tailwind`);
      tailwindDetected = true;
    }

    if (tailwindDetected) {
      return { strategy: "tailwind", unknownClass: "off", reasons };
    }

    return {
      strategy: "global",
      unknownClass: "warn",
      reasons: ["no Tailwind signals found"]
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      strategy: "unknown",
      unknownClass: "off",
      reasons: [`detection error: ${message}`]
    };
  }
}

function formatCssDetection(result: CssDetectionResult): string {
  const reason = result.reasons.length ? ` (${result.reasons.join(", ")})` : "";
  const label = result.strategy === "tailwind" ? "Tailwind" : result.strategy === "global" ? "Global CSS" : "Unknown";
  return `${label}${reason} => unknownClass ${result.unknownClass}`;
}

function hasTailwindDependency(pkg: Record<string, any>): boolean {
  return Boolean(
    (pkg.dependencies && pkg.dependencies.tailwindcss) ||
      (pkg.devDependencies && pkg.devDependencies.tailwindcss) ||
      (pkg.peerDependencies && pkg.peerDependencies.tailwindcss)
  );
}

async function scanPostcssForTailwind(projectRoot: string): Promise<string | null> {
  for (const filename of POSTCSS_CONFIG_FILES) {
    const fullPath = path.join(projectRoot, filename);
    if (!existsSync(fullPath)) {
      continue;
    }
    const contents = await fs.readFile(fullPath, "utf8");
    if (contents.includes("tailwindcss")) {
      return filename;
    }
  }
  return null;
}

async function scanTopLevelCssForTailwind(projectRoot: string): Promise<string | null> {
  const files = await fg("*.css", { cwd: projectRoot, onlyFiles: true });
  for (const filename of files) {
    const fullPath = path.join(projectRoot, filename);
    const contents = await fs.readFile(fullPath, "utf8");
    if (/\@tailwind\s+(base|components|utilities)\b/.test(contents)) {
      return filename;
    }
  }
  return null;
}

function buildInitConfig(
  projectType: CollieProjectType,
  ext: string,
  cssDetection: CssDetectionResult
): string {
  const config = {
    css: {
      strategy: cssDetection.strategy,
      diagnostics: {
        unknownClass: cssDetection.unknownClass
      }
    },
    projects: [
      {
        type: projectType,
        input: "src/**/*.collie"
      }
    ]
  };

  if (ext === ".json") {
    return `${JSON.stringify(config, null, 2)}\n`;
  }

  const commentLines =
    projectType === "react-vite"
      ? [
          "// Collie config for Vite.",
          "// Templates are compiled in-memory by @collie-lang/vite."
        ]
      : ["// Collie config. Update the project type or input as needed."];
  const comment = `${commentLines.join("\n")}\n`;
  const body = JSON.stringify(config, null, 2);

  if (ext === ".mjs" || ext === ".ts") {
    return `${comment}export default ${body};\n`;
  }

  return `${comment}module.exports = ${body};\n`;
}

function findExistingCollieConfig(root: string): string | null {
  for (const filename of COLLIE_CONFIG_FILES) {
    const candidate = path.join(root, filename);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

async function promptForConfirmation(message: string, initial: boolean): Promise<boolean> {
  const response = await prompts(
    {
      type: "confirm",
      name: "confirmed",
      message,
      initial
    },
    PROMPT_OPTIONS
  );
  return Boolean(response.confirmed);
}

async function promptProjectType(): Promise<CollieProjectType> {
  const response = await prompts(
    {
      type: "select",
      name: "projectType",
      message: "What type of project should this config describe?",
      choices: [
        { title: "React (Vite)", value: "react-vite" },
        { title: "React (Next.js)", value: "react-next" },
        { title: "React (generic)", value: "react-generic" },
        { title: "HTML (no framework)", value: "html" }
      ],
      initial: 0
    },
    PROMPT_OPTIONS
  );
  return (response.projectType as CollieProjectType) ?? "react-generic";
}

async function runPreflight(command: PreflightCommand, options: PreflightOptions = {}): Promise<boolean> {
  if (preflightCompleted) {
    return true;
  }
  preflightCompleted = true;

  const projectRoot = findProjectRoot(process.cwd());
  if (!projectRoot) {
    console.log(pc.dim("Skipping dependency preflight (no package.json found)."));
    return true;
  }

  let packageJson: Record<string, any> | null = null;
  try {
    packageJson = await readProjectPackage(projectRoot);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(pc.yellow(`Skipping dependency preflight: failed to read package.json (${message}).`));
    return true;
  }

  if (!packageJson) {
    console.log(pc.dim("Skipping dependency preflight (package.json not found)."));
    return true;
  }

  const detectedFramework = detectFrameworkFromPackage(packageJson);
  const resolvedFramework =
    options.framework ?? detectedFramework ?? (command === "init" ? "vite" : undefined);
  const requiredPackages = getRequiredPackages(command, resolvedFramework);
  if (requiredPackages.length === 0) {
    return true;
  }

  const missing = collectMissingDependencies(projectRoot, packageJson, requiredPackages);
  if (missing.length === 0) {
    return true;
  }

  const packageManager = options.packageManager ?? detectPackageManager(projectRoot);
  const prompt = `Missing required Collie packages: ${missing.join(", ")}. Install now?`;
  const shouldInstall = await promptForConfirmation(prompt, true);
  if (!shouldInstall) {
    console.log(pc.yellow("Skipped installing Collie dependencies."));
    console.log(
      pc.dim(`Next: ${formatInstallCommand(packageManager, missing)} && collie ${command}`)
    );
    return false;
  }

  const specs = missing.map((dep) => resolveDependencySpec(dep));
  console.log(pc.cyan(`Installing ${missing.length} Collie package${missing.length === 1 ? "" : "s"}...`));
  await installDevDependencies(packageManager, projectRoot, specs);
  console.log(pc.green(`✔ Installed ${missing.length} Collie package${missing.length === 1 ? "" : "s"}.`));
  return true;
}

function findProjectRoot(startDir: string): string | null {
  let current = startDir;
  while (true) {
    if (existsSync(path.join(current, "package.json"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function getRequiredPackages(
  command: PreflightCommand,
  framework: Framework | null | undefined
): string[] {
  if (command === "check") {
    return ["@collie-lang/compiler"];
  }
  if (framework === "nextjs") {
    return [...COLLIE_NEXT_PACKAGES];
  }
  if (framework === "vite") {
    return [...COLLIE_VITE_PACKAGES];
  }
  return [...COLLIE_CORE_PACKAGES];
}

function collectMissingDependencies(
  projectRoot: string,
  packageJson: Record<string, any>,
  required: readonly string[]
): string[] {
  return required.filter((dependency) => !isDependencySatisfied(projectRoot, packageJson, dependency));
}

function isDependencySatisfied(
  projectRoot: string,
  packageJson: Record<string, any>,
  dependency: string
): boolean {
  const listed = Boolean(
    packageJson?.dependencies?.[dependency] || packageJson?.devDependencies?.[dependency]
  );
  if (listed) {
    return true;
  }
  const modulePath = path.join(projectRoot, "node_modules", ...dependency.split("/"));
  return existsSync(modulePath);
}

function resolveDependencySpec(packageName: string): string {
  const range = normalizeDependencyRange(CLI_DEPENDENCY_SPECS[packageName], "latest");
  return `${packageName}@${range}`;
}

function formatInstallCommand(packageManager: PackageManager, dependencies: string[]): string {
  const specs = dependencies.map((dep) => resolveDependencySpec(dep));
  if (packageManager === "pnpm") {
    return `pnpm add -D ${specs.join(" ")}`;
  }
  if (packageManager === "yarn") {
    return `yarn add -D ${specs.join(" ")}`;
  }
  return `npm install -D ${specs.join(" ")}`;
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

async function patchViteConfig(configPath: string): Promise<"patched" | "already-configured" | "manual"> {
  const original = await fs.readFile(configPath, "utf8");
  const hasImport = original.includes("@collie-lang/vite");
  const hasPlugin = /\bcollie\s*\(/.test(original);
  if (hasImport && hasPlugin) {
    return "already-configured";
  }

  try {
    const result = transformViteConfig(original);
    if (!result.changed) {
      return "already-configured";
    }
    await fs.writeFile(configPath, result.code, "utf8");
    return "patched";
  } catch (error) {
    // Fall back to manual if AST transformation fails
    return "manual";
  }
}

function transformViteConfig(source: string): { code: string; changed: boolean } {
  const sourceFile = ts.createSourceFile(
    "vite.config.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );

  let needsImport = !source.includes("@collie-lang/vite");
  let needsPlugin = !/\bcollie\s*\(/.test(source);
  let changed = false;

  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
    return (rootNode) => {
      function visit(node: ts.Node): ts.Node {
        // Handle imports - add collie import after last import
        if (needsImport && ts.isImportDeclaration(node)) {
          // We'll add the import after we've processed all nodes
          return node;
        }

        // Find defineConfig call and modify plugins array
        if (
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === "defineConfig" &&
          node.arguments.length > 0
        ) {
          const configArg = node.arguments[0];
          if (ts.isObjectLiteralExpression(configArg)) {
            const updatedConfig = updateConfigObject(configArg);
            if (updatedConfig !== configArg) {
              changed = true;
              return ts.factory.updateCallExpression(
                node,
                node.expression,
                node.typeArguments,
                [updatedConfig]
              );
            }
          }
        }

        return ts.visitEachChild(node, visit, context);
      }

      function updateConfigObject(configObj: ts.ObjectLiteralExpression): ts.ObjectLiteralExpression {
        let pluginsProperty: ts.PropertyAssignment | undefined;
        const otherProperties: ts.ObjectLiteralElementLike[] = [];

        for (const prop of configObj.properties) {
          if (
            ts.isPropertyAssignment(prop) &&
            ts.isIdentifier(prop.name) &&
            prop.name.text === "plugins"
          ) {
            pluginsProperty = prop;
          } else {
            otherProperties.push(prop);
          }
        }

        let updatedPluginsArray: ts.ArrayLiteralExpression;

        if (pluginsProperty && ts.isArrayLiteralExpression(pluginsProperty.initializer)) {
          updatedPluginsArray = ensurePluginOrdering(pluginsProperty.initializer);
          if (updatedPluginsArray === pluginsProperty.initializer) {
            // No changes needed
            return configObj;
          }
        } else if (needsPlugin) {
          // Create plugins array with just collie()
          updatedPluginsArray = ts.factory.createArrayLiteralExpression(
            [createCollieCall()],
            false
          );
        } else {
          return configObj;
        }

        const updatedPluginsProperty = ts.factory.createPropertyAssignment(
          "plugins",
          updatedPluginsArray
        );

        // Rebuild properties array with updated plugins
        if (pluginsProperty) {
          // Replace existing plugins property
          const allProperties = [...otherProperties, updatedPluginsProperty];
          return ts.factory.updateObjectLiteralExpression(configObj, allProperties);
        } else {
          // Add new plugins property
          const allProperties = [...otherProperties, updatedPluginsProperty];
          return ts.factory.updateObjectLiteralExpression(configObj, allProperties);
        }
      }

      function ensurePluginOrdering(array: ts.ArrayLiteralExpression): ts.ArrayLiteralExpression {
        const elements = Array.from(array.elements);
        let hasReact = false;
        let hasCollie = false;
        let reactIndex = -1;
        let collieIndex = -1;

        // Check what we already have
        elements.forEach((elem, idx) => {
          if (ts.isCallExpression(elem) && ts.isIdentifier(elem.expression)) {
            if (elem.expression.text === "react") {
              hasReact = true;
              reactIndex = idx;
            } else if (elem.expression.text === "collie") {
              hasCollie = true;
              collieIndex = idx;
            }
          }
        });

        // Determine if array is multiline by checking if it has more than one element
        const isMultiLine = elements.length > 1;

        if (hasCollie && !needsPlugin) {
          // Already has collie, just ensure ordering
          if (hasReact && reactIndex > collieIndex) {
            // Wrong order, need to swap
            const newElements = [...elements];
            const reactPlugin = newElements[reactIndex];
            const colliePlugin = newElements[collieIndex];
            newElements[collieIndex] = reactPlugin;
            newElements[reactIndex] = colliePlugin;
            return ts.factory.createArrayLiteralExpression(newElements, isMultiLine);
          }
          return array; // Order is fine
        }

        if (!hasCollie && needsPlugin) {
          // Need to add collie at the end
          const newElements = [...elements, createCollieCall()];
          return ts.factory.createArrayLiteralExpression(newElements, isMultiLine);
        }

        return array;
      }

      function createCollieCall(): ts.CallExpression {
        return ts.factory.createCallExpression(
          ts.factory.createIdentifier("collie"),
          undefined,
          []
        );
      }

      const visited = ts.visitNode(rootNode, visit) as ts.SourceFile;

      // Add import if needed
      if (needsImport && changed) {
        const collieImport = ts.factory.createImportDeclaration(
          undefined,
          ts.factory.createImportClause(
            false,
            ts.factory.createIdentifier("collie"),
            undefined
          ),
          ts.factory.createStringLiteral("@collie-lang/vite", true)
        );

        // Find last import to insert after
        let lastImportIndex = -1;
        for (let i = 0; i < visited.statements.length; i++) {
          if (ts.isImportDeclaration(visited.statements[i])) {
            lastImportIndex = i;
          }
        }

        const statements = Array.from(visited.statements);
        if (lastImportIndex >= 0) {
          statements.splice(lastImportIndex + 1, 0, collieImport);
        } else {
          statements.unshift(collieImport);
        }

        return ts.factory.updateSourceFile(visited, statements);
      }

      return visited;
    };
  };

  const result = ts.transform(sourceFile, [transformer]);
  const transformedSourceFile = result.transformed[0];
  result.dispose();

  if (!changed) {
    return { code: source, changed: false };
  }

  const output = printer.printFile(transformedSourceFile);
  return { code: output, changed: true };
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

// Import injection is now handled by transformViteConfig AST transformer

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
