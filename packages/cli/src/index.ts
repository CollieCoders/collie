import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pc from "picocolors";

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
  collie init   Initialize Collie in a Vite+React project
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

main().catch((error) => {
  console.error(pc.red(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
