import { compileToJsx } from "@collie-lang/compiler";
import fg from "fast-glob";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { printSummary } from "./output";

export type DiagnosticStatus = "pass" | "fail" | "warn";

export interface DiagnosticResult {
  id: string;
  check: string;
  status: DiagnosticStatus;
  message: string;
  fix?: string;
  tags?: string[];
}

interface DoctorContext {
  cwd: string;
  packageJson: Record<string, any> | null;
}

type BuildSystem = "vite" | null;

const VITE_CONFIG_FILES = ["vite.config.ts", "vite.config.js", "vite.config.mts", "vite.config.mjs"];
const DECLARATION_CANDIDATES = ["src/collie.d.ts", "app/collie.d.ts", "collie.d.ts"];

export interface DoctorOptions {
  cwd?: string;
}

export async function runDoctor(options: DoctorOptions = {}): Promise<DiagnosticResult[]> {
  const cwd = options.cwd ?? process.cwd();
  const context: DoctorContext = {
    cwd,
    packageJson: await readPackageJson(cwd)
  };

  const results: DiagnosticResult[] = [];
  results.push(checkNodeVersion());

  const compilerResult = checkCompilerDependency(context);
  results.push(compilerResult);

  const buildInfo = detectBuildSystem(context);
  results.push(buildInfo.result);

  if (buildInfo.type === "vite") {
    const viteDependency = checkDependency(context, "@collie-lang/vite", "Collie Vite plugin", ["vite"]);
    if (viteDependency) {
      results.push(viteDependency);
    }
    results.push(await checkViteConfig(context));
  }

  results.push(await checkTypeDeclarations(context));
  results.push(await checkCollieFiles(context));
  results.push(await testCompilation());

  return results;
}

export function filterDiagnostics(results: DiagnosticResult[], filter?: string): DiagnosticResult[] {
  if (!filter) {
    return results;
  }
  const normalized = filter.trim().toLowerCase();
  if (!normalized) {
    return results;
  }
  return results.filter((result) => {
    if (result.tags?.some((tag) => tag.toLowerCase() === normalized)) {
      return true;
    }
    return result.check.toLowerCase().includes(normalized);
  });
}

export function printDoctorResults(results: DiagnosticResult[]): void {
  console.log(pc.bold("collie doctor"));
  console.log(pc.dim("Diagnosing your environment..."));
  console.log("");
  let errors = 0;
  let warnings = 0;

  for (const result of results) {
    const icon =
      result.status === "pass" ? pc.green("✔") : result.status === "warn" ? pc.yellow("⚠") : pc.red("✖");
    console.log(`${icon} ${result.check}: ${result.message}`);
    if (result.fix) {
      console.log(pc.dim(`  Fix: ${result.fix}`));
    }
    console.log("");
    if (result.status === "fail") {
      errors++;
    } else if (result.status === "warn") {
      warnings++;
    }
  }

  if (errors === 0 && warnings === 0) {
    printSummary("success", "All checks passed", "no changes made", "continue with collie check or collie build");
    return;
  }

  const summary: string[] = [];
  if (errors > 0) summary.push(`${errors} error${errors === 1 ? "" : "s"}`);
  if (warnings > 0) summary.push(`${warnings} warning${warnings === 1 ? "" : "s"}`);
  printSummary(
    errors > 0 ? "error" : "warning",
    `Doctor found ${summary.join(" and ")}`,
    "no changes made",
    "address the items above and rerun collie doctor"
  );
}

function checkNodeVersion(): DiagnosticResult {
  const version = process.version;
  const major = Number(version.slice(1).split(".")[0]);
  if (Number.isFinite(major) && major >= 18) {
    return {
      id: "node-version",
      check: "Node.js version",
      status: "pass",
      message: `${version} (compatible)`,
      tags: ["node"]
    };
  }
  return {
    id: "node-version",
    check: "Node.js version",
    status: "fail",
    message: `${version} (incompatible)`,
    fix: "Upgrade to Node.js 18 or newer.",
    tags: ["node"]
  };
}

function checkCompilerDependency(context: DoctorContext): DiagnosticResult {
  const spec = getDependencySpec(context.packageJson, "@collie-lang/compiler");
  if (!spec) {
    return {
      id: "compiler-dependency",
      check: "Collie compiler",
      status: "fail",
      message: context.packageJson ? "Not found in package.json" : "package.json not found",
      fix: "Install @collie-lang/compiler (e.g. npm install --save-dev @collie-lang/compiler)",
      tags: ["compiler"]
    };
  }
  return {
    id: "compiler-dependency",
    check: "Collie compiler",
    status: "pass",
    message: `@collie-lang/compiler@${formatDependencyVersion(spec)}`,
    tags: ["compiler"]
  };
}

function detectBuildSystem(context: DoctorContext): { result: DiagnosticResult; type: BuildSystem } {
  if (!context.packageJson) {
    return {
      type: null,
      result: {
        id: "build-system",
        check: "Build system",
        status: "warn",
        message: "package.json not found",
        fix: "Initialize a project (npm init) and install Vite or Next.js.",
        tags: ["build"]
      }
    };
  }

  const hasVite = hasDependency(context.packageJson, "vite");

  if (hasVite) {
    return {
      type: "vite",
      result: {
        id: "build-system",
        check: "Build system",
        status: "pass",
        message: "Vite detected",
        tags: ["build", "vite"]
      }
    };
  }
  return {
    type: null,
    result: {
      id: "build-system",
      check: "Build system",
      status: "warn",
      message: "No Vite dependency found",
      fix: "Install Vite for the best Collie experience.",
      tags: ["build"]
    }
  };
}

function checkDependency(
  context: DoctorContext,
  dependency: string,
  label: string,
  tags: string[]
): DiagnosticResult | null {
  if (!context.packageJson) {
    return null;
  }
  const spec = getDependencySpec(context.packageJson, dependency);
  if (!spec) {
    return {
      id: `${dependency}-dependency`,
      check: label,
      status: "fail",
      message: `${dependency} missing from package.json`,
      fix: `Install ${dependency} (e.g. npm install --save-dev ${dependency})`,
      tags
    };
  }
  return {
    id: `${dependency}-dependency`,
    check: label,
    status: "pass",
    message: `${dependency}@${formatDependencyVersion(spec)}`,
    tags
  };
}

async function checkViteConfig(context: DoctorContext): Promise<DiagnosticResult> {
  for (const filename of VITE_CONFIG_FILES) {
    const configPath = path.join(context.cwd, filename);
    if (!existsSync(configPath)) continue;
    const contents = await fs.readFile(configPath, "utf8");
    const hasPlugin = /@collie-lang\/vite/.test(contents) && /collie\s*\(/.test(contents);
    if (hasPlugin) {
      return {
        id: "vite-config",
        check: "Vite config",
        status: "pass",
        message: `Collie plugin configured in ${filename}`,
        tags: ["vite", "config"]
      };
    }
    return {
      id: "vite-config",
      check: "Vite config",
      status: "fail",
      message: `Found ${filename} but Collie plugin not configured`,
      fix: "Add collie() to your Vite plugins array or run collie init.",
      tags: ["vite", "config"]
    };
  }
  return {
    id: "vite-config",
    check: "Vite config",
    status: "fail",
    message: "Vite config not found",
    fix: "Create vite.config.ts and add the Collie plugin.",
    tags: ["vite", "config"]
  };
}

async function checkTypeDeclarations(context: DoctorContext): Promise<DiagnosticResult> {
  for (const relativePath of DECLARATION_CANDIDATES) {
    const fullPath = path.join(context.cwd, relativePath);
    if (existsSync(fullPath)) {
      return {
        id: "type-declarations",
        check: "Type declarations",
        status: "pass",
        message: `Found ${relativePath}`,
        tags: ["types"]
      };
    }
  }
  return {
    id: "type-declarations",
    check: "Type declarations",
    status: "warn",
    message: "collie.d.ts not found",
    fix: "Create src/collie.d.ts so TypeScript recognizes .collie imports.",
    tags: ["types"]
  };
}

async function checkCollieFiles(context: DoctorContext): Promise<DiagnosticResult> {
  const files = await fg("**/*.collie", {
    cwd: context.cwd,
    ignore: ["node_modules/**", "dist/**", ".next/**"],
    absolute: false
  });
  if (files.length === 0) {
    return {
      id: "collie-files",
      check: "Collie files",
      status: "warn",
      message: "No .collie files found",
      fix: "Create a .collie template to start using Collie.",
      tags: ["templates"]
    };
  }
  return {
    id: "collie-files",
    check: "Collie files",
    status: "pass",
    message: `Found ${files.length} .collie file${files.length === 1 ? "" : "s"}`,
    tags: ["templates"]
  };
}

async function testCompilation(): Promise<DiagnosticResult> {
  const template = ['props', '  name: string = "world"', "", "div class=\"doctor-check\"", "  h1", "    Hello {{ name }}"].join(
    "\n"
  );
  try {
    const result = compileToJsx(template, { componentNameHint: "DoctorCheck" });
    const hasError = result.diagnostics.some((diag) => diag.severity === "error");
    if (hasError) {
      return {
        id: "compiler-test",
        check: "Test compilation",
        status: "fail",
        message: "Compiler produced errors",
        fix: "Reinstall @collie-lang/compiler or inspect diagnostics.",
        tags: ["compiler"]
      };
    }
    return {
      id: "compiler-test",
      check: "Test compilation",
      status: "pass",
      message: "Successful",
      tags: ["compiler"]
    };
  } catch {
    return {
      id: "compiler-test",
      check: "Test compilation",
      status: "fail",
      message: "Failed to compile sample template",
      fix: "Verify @collie-lang/compiler is installed correctly.",
      tags: ["compiler"]
    };
  }
}

async function readPackageJson(cwd: string): Promise<Record<string, any> | null> {
  try {
    const pkgPath = path.join(cwd, "package.json");
    const raw = await fs.readFile(pkgPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getDependencySpec(pkg: Record<string, any> | null, name: string): string | undefined {
  if (!pkg) {
    return undefined;
  }
  return pkg.dependencies?.[name] ?? pkg.devDependencies?.[name];
}

function hasDependency(pkg: Record<string, any>, name: string): boolean {
  return Boolean(pkg.dependencies?.[name] ?? pkg.devDependencies?.[name]);
}

function formatDependencyVersion(spec: string): string {
  return spec.replace(/^workspace:/, "").replace(/^[~^]/, "");
}
