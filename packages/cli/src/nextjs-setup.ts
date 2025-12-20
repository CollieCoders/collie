import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import pc from "picocolors";

export interface NextJsSetupOptions {
  packageJson?: Record<string, any>;
  skipDetectionLog?: boolean;
}

export async function setupNextJs(projectRoot: string, options: NextJsSetupOptions = {}): Promise<void> {
  const pkg = options.packageJson ?? (await readPackageJson(projectRoot));
  if (!pkg) {
    throw new Error("package.json not found. Run this inside your Next.js project.");
  }

  if (!hasNextDependency(pkg)) {
    throw new Error("Not a Next.js project. 'next' not found in package.json");
  }

  if (!options.skipDetectionLog) {
    console.log(pc.cyan("Detected Next.js project\n"));
  }

  await writeCollieLoader(projectRoot);

  const configResult = await patchNextConfig(projectRoot);
  if (configResult === "created" || configResult === "patched") {
    console.log(pc.green("✔ Configured next.config.js"));
  }

  const declarationPath = await writeTypeDeclarations(projectRoot);
  console.log(pc.green(`✔ Writing type declarations: ${path.relative(projectRoot, declarationPath)}`));

  const examplePath = await writeExampleComponent(projectRoot);
  console.log(pc.green(`✔ Created example component: ${path.relative(projectRoot, examplePath)}`));
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

async function writeCollieLoader(projectRoot: string): Promise<void> {
  const loaderPath = path.join(projectRoot, "collie-loader.js");
  await fs.writeFile(loaderPath, WEBPACK_LOADER_TEMPLATE, "utf8");
}

type PatchResult = "created" | "patched" | "already-configured" | "manual";

async function patchNextConfig(projectRoot: string): Promise<PatchResult> {
  const configCandidates = ["next.config.js", "next.config.mjs", "next.config.ts"];
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

  let contents = await fs.readFile(configPath, "utf8");
  if (contents.includes("collie-loader")) {
    console.log(pc.yellow("⚠ next.config.js already configured for Collie. Skipping."));
    return "already-configured";
  }

  if (contents.includes("webpack:")) {
    console.log(pc.yellow("⚠ Detected existing webpack configuration. Add the loader manually:"));
    console.log(pc.gray(MANUAL_CONFIG_SNIPPET.trimEnd()));
    return "manual";
  }

  const replaced = contents.replace(
    /module\.exports\s*=\s*{/,
    `module.exports = {\n  webpack: (config) => {\n${WEBPACK_CONFIG_SNIPPET}\n    return config;\n  },`
  );

  if (replaced === contents) {
    console.log(pc.yellow("⚠ Could not auto-inject Collie loader. Add this snippet manually:"));
    console.log(pc.gray(MANUAL_CONFIG_SNIPPET.trimEnd()));
    return "manual";
  }

  await fs.writeFile(configPath, replaced, "utf8");
  return "patched";
}

async function writeTypeDeclarations(projectRoot: string): Promise<string> {
  const baseDir = resolvePrimaryDir(projectRoot);
  const declPath = path.join(projectRoot, baseDir, "collie.d.ts");
  await fs.mkdir(path.dirname(declPath), { recursive: true });
  await fs.writeFile(declPath, TYPE_DECLARATION, "utf8");
  return declPath;
}

async function writeExampleComponent(projectRoot: string): Promise<string> {
  const baseDir = resolvePrimaryDir(projectRoot);
  const examplePath = path.join(projectRoot, baseDir, "components", "Welcome.collie");
  await fs.mkdir(path.dirname(examplePath), { recursive: true });
  await fs.writeFile(examplePath, EXAMPLE_COMPONENT, "utf8");
  return examplePath;
}

function resolvePrimaryDir(projectRoot: string): string {
  if (existsSync(path.join(projectRoot, "app"))) {
    return "app";
  }
  if (existsSync(path.join(projectRoot, "src"))) {
    return "src";
  }
  return "app";
}

const WEBPACK_LOADER_TEMPLATE = `const { compile } = require("@collie-lang/compiler");
const path = require("path");

module.exports = function collieLoader(source) {
  const callback = this.async();
  const filename = this.resourcePath;
  const componentName = path.basename(filename, ".collie");

  try {
    const result = compile(source, {
      filename,
      componentNameHint: componentName,
      jsxRuntime: "automatic"
    });

    for (const diag of result.diagnostics) {
      if (diag.severity === "error") {
        this.emitError(new Error(\`\${diag.file}: \${diag.message}\`));
      } else {
        this.emitWarning(new Error(\`\${diag.file}: \${diag.message}\`));
      }
    }

    callback(null, result.code);
  } catch (error) {
    callback(error);
  }
};
`;

const NEXT_CONFIG_TEMPLATE = `/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.module.rules.push({
      test: /\\.collie$/,
      use: [
        {
          loader: "babel-loader",
          options: {
            presets: ["next/babel"]
          }
        },
        {
          loader: require.resolve("./collie-loader.js")
        }
      ]
    });

    return config;
  }
};

module.exports = nextConfig;
`;

const WEBPACK_CONFIG_SNIPPET = `    config.module.rules.push({
      test: /\\.collie$/,
      use: [
        {
          loader: "babel-loader",
          options: { presets: ["next/babel"] }
        },
        {
          loader: require.resolve("./collie-loader.js")
        }
      ]
    });`;

const MANUAL_CONFIG_SNIPPET = `
  config.module.rules.push({
    test: /\\.collie$/,
    use: [
      { loader: "babel-loader", options: { presets: ["next/babel"] } },
      { loader: require.resolve("./collie-loader.js") }
    ]
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
