import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import pc from "picocolors";

type PackageManager = "pnpm" | "yarn" | "npm";

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

  const pkgManager = detectPackageManager(projectRoot);
  console.log(pc.cyan(`Installing dev dependencies with ${pkgManager}...`));
  await installDevDependencies(pkgManager, projectRoot, ["@collie-lang/compiler", "@collie-lang/vite"]);

  console.log(pc.cyan("Patching vite.config.ts..."));
  await patchViteConfig(projectRoot);

  console.log(pc.cyan("Writing src/collie.d.ts..."));
  await ensureCollieDeclaration(projectRoot);
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

async function patchViteConfig(root: string): Promise<void> {
  const configPath = path.join(root, "vite.config.ts");
  if (!existsSync(configPath)) {
    throw new Error("vite.config.ts not found. Add Collie manually to your Vite config.");
  }

  let contents = await fs.readFile(configPath, "utf8");
  let changed = false;

  if (!contents.includes("@collie-lang/vite")) {
    const importStatement = `import collie from "@collie-lang/vite";\n`;
    const importMatches = [...contents.matchAll(/^import.*$/gm)];
    const insertPos =
      importMatches.length > 0
        ? computeInsertPos(contents, importMatches[importMatches.length - 1])
        : 0;
    contents = contents.slice(0, insertPos) + importStatement + contents.slice(insertPos);
    changed = true;
  }

  if (!contents.includes("collie(")) {
    const updated = injectColliePlugin(contents);
    if (!updated) {
      throw new Error(
        "Could not find plugins array in vite.config.ts. Add collie() manually to your plugins list."
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
  const pluginsIndex = source.indexOf("plugins");
  if (pluginsIndex === -1) return null;

  const bracketStart = source.indexOf("[", pluginsIndex);
  if (bracketStart === -1) return null;

  const bracketEnd = findMatchingBracket(source, bracketStart);
  if (bracketEnd === -1) return null;

  const before = source.slice(0, bracketStart + 1);
  const inside = source.slice(bracketStart + 1, bracketEnd);
  const after = source.slice(bracketEnd);

  const lineStart = source.lastIndexOf("\n", pluginsIndex);
  const indentMatch = source.slice(lineStart + 1, pluginsIndex).match(/^\s*/);
  const baseIndent = indentMatch ? indentMatch[0] : "";
  const entryIndent = `${baseIndent}  `;

  const leadingWhitespaceMatch = inside.match(/^\s*/);
  const leadingWhitespace = leadingWhitespaceMatch ? leadingWhitespaceMatch[0] : "";
  const trimmedInside = inside.trim();
  const trailingWhitespaceMatch = inside.match(/\s*$/);
  const trailingWhitespace = trailingWhitespaceMatch ? trailingWhitespaceMatch[0] : "";
  const beforeTrailing = inside.slice(0, inside.length - trailingWhitespace.length);
  const hasMultiline = inside.includes("\n");
  const closingWhitespace = trailingWhitespace || (hasMultiline ? `\n${baseIndent}` : "");

  if (!trimmedInside) {
    const insertion = `${leadingWhitespace}\n${entryIndent}collie()${closingWhitespace}`;
    return before + insertion + after;
  }

  if (hasMultiline) {
    const needsComma = !beforeTrailing.trimEnd().endsWith(",");
    const withoutTrailing = beforeTrailing.trimEnd();
    const insertion = `${needsComma ? "," : ""}\n${entryIndent}collie()`;
    const restored = `${withoutTrailing}${insertion}${closingWhitespace}`;
    return before + restored + after;
  }

  const needsComma = !trimmedInside.endsWith(",");
  const separator = needsComma ? (trimmedInside.length ? ", " : "") : " ";
  const compact = `${trimmedInside}${separator}collie()`;
  return `${before}${leadingWhitespace}${compact}${closingWhitespace}${after}`;
}

function computeInsertPos(content: string, match: RegExpMatchArray): number {
  let pos = (match.index ?? 0) + match[0].length;
  if (content[pos] === "\r") pos += 1;
  if (content[pos] === "\n") pos += 1;
  return pos;
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

  const declaration = `declare module "*.collie" {
  import type { ComponentType } from "react";
  const component: ComponentType<Record<string, unknown>>;
  export default component;
}
`;

  await fs.writeFile(target, declaration, "utf8");
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
