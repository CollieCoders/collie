import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type {
  CollieConfig,
  CollieProjectConfig,
  NormalizedCollieConfig
} from "./types";
import { normalizeConfig } from "./normalize";

export * from "./types";
export * from "./normalize";

const DEFAULT_CONFIG_FILES = [
  "collie.config.ts",
  "collie.config.js",
  "collie.config.mjs",
  "collie.config.cjs",
  "collie.config.json"
] as const;

type TsImportFn = (
  specifier: string,
  parent: string | { parentURL: string }
) => Promise<unknown>;
let tsImportFnPromise: Promise<TsImportFn> | null = null;

export interface LoadConfigOptions {
  cwd?: string;
  explicitPath?: string;
}

export function defineConfig(config: CollieConfig): CollieConfig {
  return config;
}

export async function loadConfig(
  options: LoadConfigOptions = {}
): Promise<CollieConfig | null> {
  const cwd = options.cwd ?? process.cwd();
  const resolvedPath = await resolveConfigPath(cwd, options.explicitPath);

  if (!resolvedPath) {
    return null;
  }

  const ext = path.extname(resolvedPath).toLowerCase();

  if (ext === ".ts") {
    const rawConfig = await loadTsConfigFile(resolvedPath);
    return validateBasicConfig(rawConfig, resolvedPath);
  }

  const rawConfig = await loadConfigFile(resolvedPath, ext);
  return validateBasicConfig(rawConfig, resolvedPath);
}

export async function loadAndNormalizeConfig(
  options: LoadConfigOptions = {}
): Promise<NormalizedCollieConfig | null> {
  const config = await loadConfig(options);
  if (!config) {
    return null;
  }
  return normalizeConfig(config, { cwd: options.cwd });
}

async function resolveConfigPath(
  cwd: string,
  explicitPath?: string
): Promise<string | null> {
  if (explicitPath) {
    const absolutePath = path.isAbsolute(explicitPath)
      ? explicitPath
      : path.resolve(cwd, explicitPath);
    const exists = await fileExists(absolutePath);
    if (!exists) {
      throw new Error(`Config file not found at ${absolutePath}`);
    }
    return absolutePath;
  }

  for (const filename of DEFAULT_CONFIG_FILES) {
    const candidate = path.join(cwd, filename);
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function loadConfigFile(
  filePath: string,
  ext: string
): Promise<unknown> {
  if (ext === ".ts") {
    return loadTsConfigFile(filePath);
  }

  if (ext === ".json") {
    const contents = await fs.readFile(filePath, "utf8");
    return JSON.parse(contents);
  }

  if (ext === ".cjs" || ext === ".js" || ext === ".mjs") {
    const imported = await import(pathToFileURL(filePath).href);
    return imported?.default ?? imported;
  }

  throw new Error(`Unsupported config extension: ${ext}`);
}

async function loadTsConfigFile(filePath: string): Promise<unknown> {
  try {
    const tsImport = await getTsImport();
    const fileUrl = pathToFileURL(filePath).href;
    return await tsImport(fileUrl, { parentURL: fileUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to load TypeScript config at "${filePath}": ${message}`
    );
  }
}

async function getTsImport(): Promise<TsImportFn> {
  if (!tsImportFnPromise) {
    tsImportFnPromise = import("tsx/esm/api").then((mod) => mod.tsImport);
  }
  return tsImportFnPromise;
}

function validateBasicConfig(config: unknown, filePath: string): CollieConfig {
  if (!config || typeof config !== "object") {
    throw new Error(
      `Config file "${filePath}" did not export an object. Export a Collie config object.`
    );
  }

  const typedConfig = config as CollieConfig;

  if (!Array.isArray(typedConfig.projects)) {
    throw new Error(
      `Config file "${filePath}" must define a "projects" array.`
    );
  }

  (typedConfig.projects as unknown[]).forEach((project, index) => {
    validateProject(project, index, filePath);
  });

  return typedConfig;
}

function validateProject(
  project: unknown,
  index: number,
  filePath: string
): void {
  if (!project || typeof project !== "object") {
    throw new Error(
      `Project entry at index ${index} in "${filePath}" must be an object.`
    );
  }

  const typedProject = project as CollieProjectConfig;

  if (!typedProject.type || typeof typedProject.type !== "string") {
    throw new Error(
      `Project ${index} in "${filePath}" must include a string "type".`
    );
  }

  if (
    typeof typedProject.input !== "string" &&
    !(
      Array.isArray(typedProject.input) &&
      typedProject.input.every((entry) => typeof entry === "string")
    )
  ) {
    throw new Error(
      `Project ${index} in "${filePath}" must define "input" as a string or array of strings.`
    );
  }
}
