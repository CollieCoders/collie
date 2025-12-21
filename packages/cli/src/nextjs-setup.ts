import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import pc from "picocolors";

export interface NextJsSetupOptions {
  skipDetectionLog?: boolean;
  collieNextVersion?: string;
}

export type NextRouterType = "app" | "pages";

export interface NextDirectoryInfo {
  baseDir: string;
  routerType: NextRouterType;
  detected: boolean;
}

export async function setupNextJs(
  projectRoot: string,
  options: NextJsSetupOptions = {}
): Promise<NextDirectoryInfo> {
  const pkg = await readPackageJson(projectRoot);
  if (!pkg) {
    throw new Error("package.json not found. Run this inside your Next.js project.");
  }

  if (!hasNextDependency(pkg)) {
    throw new Error("Not a Next.js project. 'next' not found in package.json");
  }

  if (!options.skipDetectionLog) {
    console.log(pc.cyan("Detected Next.js project\n"));
  }

  const version = options.collieNextVersion && options.collieNextVersion !== "latest" ? options.collieNextVersion : "latest";
  const packageJsonPath = path.join(projectRoot, "package.json");
  const addedDependency = await ensureCollieNextDependency(packageJsonPath, pkg, version);
  if (addedDependency) {
    console.log(pc.green("✔ Added @collie-lang/next to package.json"));
  }

  const configResult = await patchNextConfig(projectRoot);
  if (configResult === "created" || configResult === "patched") {
    console.log(pc.green("✔ Configured next.config.js"));
  }

  const nextDirectory = resolvePrimaryDir(projectRoot);
  if (nextDirectory.detected) {
    console.log(
      pc.cyan(
        `Detected Next.js ${nextDirectory.routerType === "app" ? "App Router" : "Pages Router"} root: ${nextDirectory.baseDir}`
      )
    );
    const declarationPath = await writeTypeDeclarations(projectRoot, nextDirectory);
    console.log(pc.green(`✔ Writing type declarations: ${path.relative(projectRoot, declarationPath)}`));

    const exampleResult = await writeExampleComponent(projectRoot, nextDirectory);
    if (exampleResult.created) {
      console.log(pc.green(`✔ Created example component: ${path.relative(projectRoot, exampleResult.path)}`));
    } else {
      console.log(
        pc.yellow(
          `⚠ Example component already exists, skipping: ${path.relative(projectRoot, exampleResult.path)}`
        )
      );
    }
  } else {
    console.log(
      pc.yellow(
        "⚠ No app/, src/app/, pages/, or src/pages/ directory detected. Create one and re-run `collie init --nextjs`."
      )
    );
  }

  return nextDirectory;
}

export function hasNextDependency(pkg: Record<string, any>): boolean {
  return Boolean(pkg?.dependencies?.next || pkg?.devDependencies?.next);
}

async function readPackageJson(projectRoot: string): Promise<Record<string, any> | null> {
  try {
    const packageJsonPath = path.join(projectRoot, "package.json");
    const raw = await fs.readFile(packageJsonPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function ensureCollieNextDependency(
  packageJsonPath: string,
  pkg: Record<string, any>,
  version: string
): Promise<boolean> {
  if (pkg.dependencies?.["@collie-lang/next"] || pkg.devDependencies?.["@collie-lang/next"]) {
    return false;
  }

  pkg.dependencies = {
    ...(pkg.dependencies ?? {}),
    "@collie-lang/next": version
  };

  await fs.writeFile(packageJsonPath, JSON.stringify(pkg, null, 2) + "\n");
  return true;
}

type PatchResult = "created" | "patched" | "already-configured" | "manual";

async function patchNextConfig(projectRoot: string): Promise<PatchResult> {
  const configCandidates = ["next.config.ts", "next.config.mjs", "next.config.js"];
  let configPath: string | null = null;

  for (const candidate of configCandidates) {
    const fullPath = path.join(projectRoot, candidate);
    if (existsSync(fullPath)) {
      configPath = fullPath;
      break;
    }
  }

  if (!configPath) {
    configPath = path.join(projectRoot, "next.config.js");
    await fs.writeFile(configPath, NEXT_CONFIG_TEMPLATE, "utf8");
    return "created";
  }

  const contents = await fs.readFile(configPath, "utf8");
  if (alreadyUsesCollie(contents)) {
    console.log(pc.yellow("⚠ next.config.js already configured for Collie. Skipping."));
    return "already-configured";
  }

  const format = detectModuleFormat(configPath, contents);
  const patched =
    format === "esm" ? patchEsmConfig(contents) : patchCommonJsConfig(contents);

  if (!patched) {
    logManualConfigHelp(format);
    return "manual";
  }

  await fs.writeFile(configPath, patched, "utf8");
  return "patched";
}

type ModuleFormat = "esm" | "cjs";

function alreadyUsesCollie(source: string): boolean {
  return /@collie-lang\/next/.test(source) || /\bwithCollie\s*\(/.test(source);
}

function detectModuleFormat(configPath: string, contents: string): ModuleFormat {
  if (/module\.exports/.test(contents)) {
    return "cjs";
  }
  if (/\bexport\s+default\b/.test(contents)) {
    return "esm";
  }
  if (configPath.endsWith(".mjs") || configPath.endsWith(".ts")) {
    return "esm";
  }
  return "cjs";
}

function patchCommonJsConfig(source: string): string | null {
  let updated = ensureCommonJsImport(source);
  let changed = updated !== source;
  let needsExportLine = false;

  if (/module\.exports\s*=\s*withCollie/.test(updated)) {
    return null;
  }

  if (/module\.exports\s*=\s*nextConfig\s*;?/.test(updated)) {
    updated = updated.replace(
      /module\.exports\s*=\s*nextConfig\s*;?/,
      "module.exports = withCollie(nextConfig);"
    );
    changed = true;
  } else if (/module\.exports\s*=\s*{/.test(updated)) {
    updated = updated.replace(/module\.exports\s*=\s*{/, "const nextConfig = {");
    needsExportLine = true;
    changed = true;
  }

  if (!changed) {
    return null;
  }

  if (needsExportLine) {
    updated = appendExport(updated, "module.exports = withCollie(nextConfig);");
  }

  return updated;
}

function patchEsmConfig(source: string): string | null {
  let updated = ensureEsmImport(source);
  let changed = updated !== source;
  let needsExportLine = false;

  if (/export\s+default\s+withCollie/.test(updated)) {
    return null;
  }

  if (/export\s+default\s+nextConfig\s*;?/.test(updated)) {
    updated = updated.replace(
      /export\s+default\s+nextConfig\s*;?/,
      "export default withCollie(nextConfig);"
    );
    changed = true;
  } else if (/export\s+default\s*{/.test(updated)) {
    updated = updated.replace(/export\s+default\s*{/, "const nextConfig = {");
    needsExportLine = true;
    changed = true;
  }

  if (!changed) {
    return null;
  }

  if (needsExportLine) {
    updated = appendExport(updated, "export default withCollie(nextConfig);");
  }

  return updated;
}

function ensureCommonJsImport(source: string): string {
  if (/require\(["']@collie-lang\/next["']\)/.test(source)) {
    return source;
  }

  const statement = `const withCollie = require("@collie-lang/next");\n`;
  return insertAfterDirectives(source, statement);
}

function ensureEsmImport(source: string): string {
  if (/from ["']@collie-lang\/next["']/.test(source)) {
    return source;
  }

  const statement = `import withCollie from "@collie-lang/next";\n`;
  return insertAfterDirectives(source, statement);
}

function insertAfterDirectives(source: string, statement: string): string {
  const useStrictPattern = /^\s*["']use strict["'];?\s*/;
  const match = source.match(useStrictPattern);
  if (match) {
    const idx = match[0].length;
    return `${source.slice(0, idx)}\n${statement}${source.slice(idx)}`;
  }
  return `${statement}${source}`;
}

function appendExport(source: string, line: string): string {
  const trimmed = source.trimEnd();
  return `${trimmed}\n\n${line}\n`;
}

function logManualConfigHelp(format: ModuleFormat): void {
  const snippet = format === "esm" ? MANUAL_ESM_SNIPPET : MANUAL_COMMONJS_SNIPPET;
  console.log(pc.yellow("⚠ Could not auto-configure Next.js. Wrap your config manually:"));
  console.log(pc.gray(snippet.trimEnd()));
}

async function writeTypeDeclarations(projectRoot: string, dir: NextDirectoryInfo): Promise<string> {
  const declPath = path.join(projectRoot, dir.baseDir, "collie.d.ts");
  await fs.mkdir(path.dirname(declPath), { recursive: true });
  await fs.writeFile(declPath, TYPE_DECLARATION, "utf8");
  return declPath;
}

interface ExampleWriteResult {
  path: string;
  created: boolean;
}

async function writeExampleComponent(projectRoot: string, dir: NextDirectoryInfo): Promise<ExampleWriteResult> {
  const examplePath = path.join(projectRoot, dir.baseDir, "components", "Welcome.collie");
  await fs.mkdir(path.dirname(examplePath), { recursive: true });

  if (existsSync(examplePath)) {
    return { path: examplePath, created: false };
  }

  await fs.writeFile(examplePath, EXAMPLE_COMPONENT, "utf8");
  return { path: examplePath, created: true };
}

function resolvePrimaryDir(projectRoot: string): NextDirectoryInfo {
  const candidates: Array<{ baseDir: string; routerType: NextRouterType }> = [
    { baseDir: "app", routerType: "app" },
    { baseDir: path.join("src", "app"), routerType: "app" },
    { baseDir: "pages", routerType: "pages" },
    { baseDir: path.join("src", "pages"), routerType: "pages" }
  ];

  for (const candidate of candidates) {
    if (existsSync(path.join(projectRoot, candidate.baseDir))) {
      return { ...candidate, detected: true };
    }
  }

  return { baseDir: "app", routerType: "app", detected: false };
}

const NEXT_CONFIG_TEMPLATE = `const withCollie = require("@collie-lang/next");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true
};

module.exports = withCollie(nextConfig);
`;

const MANUAL_COMMONJS_SNIPPET = `
const withCollie = require("@collie-lang/next");

module.exports = withCollie({
  // existing config
});
`;

const MANUAL_ESM_SNIPPET = `
import withCollie from "@collie-lang/next";

export default withCollie({
  // existing config
});
`;

const TYPE_DECLARATION = `declare module "*.collie" {
  import type { ComponentType } from "react";
  const component: ComponentType<Record<string, unknown>>;
  export default component;
}
`;

const EXAMPLE_COMPONENT = `props
  message: string = "Welcome to Collie with Next.js!"

div class="welcome"
  h1
    {message}
  p
    Edit this component in components/Welcome.collie
`;
