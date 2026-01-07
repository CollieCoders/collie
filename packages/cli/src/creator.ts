import prompts, { type PromptObject } from "prompts";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import pc from "picocolors";

export interface CreateOptions {
  projectName?: string;
  template?: string;
  typescript?: boolean;
  packageManager?: "npm" | "yarn" | "pnpm";
  noInstall?: boolean;
  noGit?: boolean;
}

interface TemplateMeta {
  label: string;
  description: string;
  variants: Record<"ts" | "js", string>;
}

const TEMPLATE_MAP: Record<string, TemplateMeta> = {
  vite: {
    label: "Vite + React",
    description: "Vite 5 + React 18 starter with Collie support",
    variants: {
      ts: "vite-react-ts",
      js: "vite-react-js"
    }
  }
};

type TemplateKey = keyof typeof TEMPLATE_MAP;

interface ResolvedOptions {
  projectName: string;
  template: TemplateKey;
  typescript: boolean;
  packageManager: "npm" | "yarn" | "pnpm";
  noInstall: boolean;
  noGit: boolean;
}

const TEMPLATE_ALIASES: Record<string, { template: TemplateKey; forcedTypescript?: boolean }> = {};

export function formatTemplateList(): string {
  return Object.entries(TEMPLATE_MAP)
    .map(([key, meta]) => {
      const variantInfo = [
        `${meta.variants.ts} (TypeScript)`,
        `${meta.variants.js} (JavaScript)`
      ].join(", ");
      return [
        `  • ${key} – ${meta.label}`,
        `    ${meta.description}`,
        `    Variants: ${variantInfo}`
      ].join("\n");
    })
    .join("\n");
}

export async function create(options: CreateOptions = {}): Promise<void> {
  const resolved = await promptForOptions(options);
  const targetDir = path.resolve(process.cwd(), resolved.projectName);

  if (existsSync(targetDir)) {
    const overwrite = await confirmOverwrite(resolved.projectName);
    if (!overwrite) {
      console.log(pc.yellow("Cancelled"));
      return;
    }
    await fs.rm(targetDir, { recursive: true, force: true });
  }

  console.log(pc.cyan(`\nCreating project in ${targetDir}...\n`));

  const templateDir = getTemplateDir(resolved.template, resolved.typescript);
  await copyTemplate(templateDir, targetDir, resolved.projectName);
  console.log(pc.green("✔ Copied template files"));

  if (!resolved.noGit) {
    try {
      await runCommand("git", ["init"], targetDir);
      console.log(pc.green("✔ Initialized git repository"));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(pc.yellow(`⚠ Failed to initialize git: ${message}`));
    }
  }

  if (!resolved.noInstall) {
    console.log(pc.cyan(`✔ Installing dependencies with ${resolved.packageManager}...`));
    try {
      await installDependencies(resolved.packageManager, targetDir);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(pc.yellow(`⚠ Failed to install dependencies: ${message}`));
      console.log(pc.yellow("  Run the install command manually once you're ready."));
    }
  }

  printSuccessMessage(resolved);
}

async function promptForOptions(options: CreateOptions): Promise<ResolvedOptions> {
  const detected = detectPackageManager();
  const questions: PromptObject[] = [];

  if (!options.projectName) {
    questions.push({
      type: "text",
      name: "projectName",
      message: "Project name:",
      initial: "my-collie-app",
      validate: (value: string) => {
        if (!value.trim()) return "Project name is required";
        if (!/^[a-z0-9-_]+$/i.test(value.trim())) return "Use letters, numbers, hyphens, or underscores.";
        return true;
      }
    });
  }

  if (!options.template) {
    const choices = Object.entries(TEMPLATE_MAP).map(([value, meta]) => ({
      title: meta.label,
      value
    }));
    questions.push({
      type: "select",
      name: "template",
      message: "Select a template:",
      choices,
      initial: 0
    });
  }

  if (options.typescript === undefined) {
    questions.push({
      type: "confirm",
      name: "typescript",
      message: "Use TypeScript?",
      initial: true
    });
  }

  if (!options.packageManager) {
    questions.push({
      type: "select",
      name: "packageManager",
      message: "Package manager:",
      choices: [
        { title: "pnpm", value: "pnpm" },
        { title: "npm", value: "npm" },
        { title: "yarn", value: "yarn" }
      ],
      initial: detected === "pnpm" ? 0 : detected === "npm" ? 1 : 2
    });
  }

  const answers =
    questions.length > 0
      ? await prompts(questions, {
          onCancel: () => {
            console.log(pc.yellow("\nCancelled"));
            process.exit(0);
          }
        })
      : {};

  const templateResult = resolveTemplate((options.template || answers.template || "vite").trim());

  const typescript =
    templateResult.forcedTypescript ??
    (options.typescript !== undefined ? options.typescript : answers.typescript ?? true);
  const packageManager = (options.packageManager || answers.packageManager || detected) as
    | "npm"
    | "yarn"
    | "pnpm";

  if (!["npm", "yarn", "pnpm"].includes(packageManager)) {
    throw new Error(`Unsupported package manager: ${packageManager}`);
  }

  return {
    projectName: (options.projectName || answers.projectName).trim(),
    template: templateResult.template,
    typescript,
    packageManager,
    noInstall: options.noInstall ?? false,
    noGit: options.noGit ?? false
  };
}

interface TemplateResolution {
  template: TemplateKey;
  forcedTypescript?: boolean;
}

function resolveTemplate(input: string): TemplateResolution {
  const normalized = input.trim().toLowerCase();

  if (TEMPLATE_MAP[normalized as TemplateKey]) {
    return { template: normalized as TemplateKey };
  }

  const alias = TEMPLATE_ALIASES[normalized];
  if (alias && TEMPLATE_MAP[alias.template]) {
    return { template: alias.template, forcedTypescript: alias.forcedTypescript };
  }

  for (const key of Object.keys(TEMPLATE_MAP) as TemplateKey[]) {
    const meta = TEMPLATE_MAP[key];
    if (meta.variants.ts === normalized) {
      return { template: key, forcedTypescript: true };
    }
    if (meta.variants.js === normalized) {
      return { template: key, forcedTypescript: false };
    }
  }

  return throwInvalidTemplateError(input);
}

function throwInvalidTemplateError(input: string): never {
  const list = formatTemplateList();

  throw new Error(
    `Invalid template: '${input}'.\n\nAvailable templates:\n${list}\n\nUsage: collie create <project-name> --template <template>`
  );
}

async function confirmOverwrite(projectName: string): Promise<boolean> {
  const { overwrite } = await prompts({
    type: "confirm",
    name: "overwrite",
    message: `Directory ${projectName} already exists. Overwrite?`,
    initial: false
  });
  return Boolean(overwrite);
}

function getTemplateDir(template: TemplateKey, typescript: boolean): string {
  const meta = TEMPLATE_MAP[template];
  const variant = typescript ? meta.variants.ts : meta.variants.js;
  // Use __dirname in compiled CJS output to locate templates directory
  const dir = path.resolve(__dirname, "..", "templates", variant);

  if (!existsSync(dir)) {
    throw new Error(
      `Template '${template}' with ${typescript ? "TypeScript" : "JavaScript"} is not available.`
    );
  }

  return dir;
}

async function copyTemplate(templateDir: string, targetDir: string, projectName: string): Promise<void> {
  await fs.mkdir(targetDir, { recursive: true });
  await copyDirectory(templateDir, targetDir, { projectName });
}

async function copyDirectory(source: string, target: string, context: { projectName: string }): Promise<void> {
  const entries = await fs.readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(source, entry.name);
    const destName = entry.name.endsWith(".template") ? entry.name.replace(/\.template$/, "") : entry.name;
    const destPath = path.join(target, destName);

    if (entry.isDirectory()) {
      await fs.mkdir(destPath, { recursive: true });
      await copyDirectory(srcPath, destPath, context);
    } else {
      const buffer = await fs.readFile(srcPath);
      if (entry.name.endsWith(".template")) {
        const content = buffer.toString("utf8").replace(/__PROJECT_NAME__/g, context.projectName);
        await fs.writeFile(destPath, content, "utf8");
      } else {
        await fs.writeFile(destPath, buffer);
      }
    }
  }
}

async function installDependencies(packageManager: "npm" | "yarn" | "pnpm", cwd: string): Promise<void> {
  const args =
    packageManager === "npm"
      ? ["install"]
      : packageManager === "yarn"
        ? ["install"]
        : ["install"];
  await runCommand(packageManager, args, cwd);
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

function detectPackageManager(): "npm" | "yarn" | "pnpm" {
  const userAgent = process.env.npm_config_user_agent ?? "";
  if (userAgent.startsWith("pnpm")) return "pnpm";
  if (userAgent.startsWith("yarn")) return "yarn";
  if (userAgent.startsWith("npm")) return "npm";
  return "pnpm";
}

function printSuccessMessage(config: ResolvedOptions): void {
  const cdCommand = `cd ${config.projectName}`;
  const installCommand =
    config.packageManager === "npm" ? "npm install" : `${config.packageManager} install`;
  const devCommand =
    config.packageManager === "npm" ? "npm run dev" : `${config.packageManager} dev`;

  console.log(pc.green(`\n🎉 Success! Created ${config.projectName}\n`));
  console.log("Next steps:");
  console.log(pc.cyan(`  ${cdCommand}`));
  if (config.noInstall) {
    console.log(pc.cyan(`  ${installCommand}`));
  }
  console.log(pc.cyan(`  ${devCommand}`));
  console.log(pc.gray("\nHappy coding with Collie! 🐕\n"));
}
