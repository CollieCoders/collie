import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const SEARCH_FILES = [".collierc", ".collierc.json", "collie.config.js", "collie.config.mjs"] as const;
const cjsRequire = createRequire(import.meta.url);

export interface CollieConfig {
  format?: {
    indent?: number;
    sortAttributes?: boolean;
    trailingComma?: boolean;
  };
  compile?: {
    jsxRuntime?: "automatic" | "classic";
    sourcemap?: boolean;
  };
  watch?: {
    outDir?: string;
    sourcemap?: boolean;
    ext?: string;
    verbose?: boolean;
  };
  build?: {
    outDir?: string;
    sourcemap?: boolean;
    verbose?: boolean;
    quiet?: boolean;
  };
}

export interface LoadConfigOptions {
  cwd?: string;
  configPath?: string;
}

export interface ConfigLoadResult {
  config: CollieConfig;
  filepath?: string;
}

export async function loadConfig(options: LoadConfigOptions = {}): Promise<ConfigLoadResult> {
  const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();

  if (options.configPath) {
    const resolved = path.isAbsolute(options.configPath)
      ? options.configPath
      : path.resolve(cwd, options.configPath);
    if (!(await fileExists(resolved))) {
      throw new Error(`Collie config not found at ${resolved}`);
    }
    const config = await loadConfigFile(resolved);
    return { config, filepath: resolved };
  }

  const discovered = await findConfigFile(cwd);
  if (!discovered) {
    return { config: {} };
  }

  const config = await loadConfigFile(discovered);
  return { config, filepath: discovered };
}

export function mergeConfig<T extends Record<string, any>>(
  config: CollieConfig,
  section: keyof CollieConfig,
  cliFlags: T
): T {
  const sectionConfig = (config[section] ?? {}) as Record<string, unknown>;
  const filteredFlags = Object.fromEntries(
    Object.entries(cliFlags).filter(([, value]) => value !== undefined)
  );
  return {
    ...sectionConfig,
    ...filteredFlags
  } as T;
}

export function validateConfig(config: CollieConfig): string[] {
  const errors: string[] = [];
  const allowedSections = new Set(["format", "compile", "watch", "build"]);

  for (const key of Object.keys(config)) {
    if (!allowedSections.has(key)) {
      errors.push(`Unknown config section "${key}".`);
    }
  }

  if (config.format !== undefined) {
    if (!isPlainObject(config.format)) {
      errors.push("format section must be an object.");
    } else {
      validateSectionKeys(config.format, ["indent", "sortAttributes", "trailingComma"], "format", errors);
      if (config.format.indent !== undefined) {
        if (!Number.isFinite(config.format.indent)) {
          errors.push("format.indent must be a number.");
        } else if (config.format.indent < 1 || config.format.indent > 8) {
          errors.push("format.indent must be between 1 and 8.");
        }
      }
      if (config.format.sortAttributes !== undefined && typeof config.format.sortAttributes !== "boolean") {
        errors.push("format.sortAttributes must be a boolean.");
      }
      if (config.format.trailingComma !== undefined && typeof config.format.trailingComma !== "boolean") {
        errors.push("format.trailingComma must be a boolean.");
      }
    }
  }

  if (config.compile !== undefined) {
    if (!isPlainObject(config.compile)) {
      errors.push("compile section must be an object.");
    } else {
      validateSectionKeys(config.compile, ["jsxRuntime", "sourcemap"], "compile", errors);
      if (
        config.compile.jsxRuntime !== undefined &&
        config.compile.jsxRuntime !== "automatic" &&
        config.compile.jsxRuntime !== "classic"
      ) {
        errors.push('compile.jsxRuntime must be "automatic" or "classic".');
      }
      if (config.compile.sourcemap !== undefined && typeof config.compile.sourcemap !== "boolean") {
        errors.push("compile.sourcemap must be a boolean.");
      }
    }
  }

  if (config.watch !== undefined) {
    if (!isPlainObject(config.watch)) {
      errors.push("watch section must be an object.");
    } else {
      validateSectionKeys(config.watch, ["outDir", "sourcemap", "ext", "verbose"], "watch", errors);
      if (config.watch.outDir !== undefined && typeof config.watch.outDir !== "string") {
        errors.push("watch.outDir must be a string.");
      }
      if (config.watch.sourcemap !== undefined && typeof config.watch.sourcemap !== "boolean") {
        errors.push("watch.sourcemap must be a boolean.");
      }
      if (config.watch.ext !== undefined && typeof config.watch.ext !== "string") {
        errors.push("watch.ext must be a string.");
      }
      if (config.watch.verbose !== undefined && typeof config.watch.verbose !== "boolean") {
        errors.push("watch.verbose must be a boolean.");
      }
    }
  }

  if (config.build !== undefined) {
    if (!isPlainObject(config.build)) {
      errors.push("build section must be an object.");
    } else {
      validateSectionKeys(config.build, ["outDir", "sourcemap", "verbose", "quiet"], "build", errors);
      if (config.build.outDir !== undefined && typeof config.build.outDir !== "string") {
        errors.push("build.outDir must be a string.");
      }
      if (config.build.sourcemap !== undefined && typeof config.build.sourcemap !== "boolean") {
        errors.push("build.sourcemap must be a boolean.");
      }
      if (config.build.verbose !== undefined && typeof config.build.verbose !== "boolean") {
        errors.push("build.verbose must be a boolean.");
      }
      if (config.build.quiet !== undefined && typeof config.build.quiet !== "boolean") {
        errors.push("build.quiet must be a boolean.");
      }
    }
  }

  return errors;
}

export async function loadAndValidateConfig(options: LoadConfigOptions = {}): Promise<ConfigLoadResult> {
  const result = await loadConfig(options);
  const errors = validateConfig(result.config);
  if (errors.length > 0) {
    const location = result.filepath ? ` (${formatDisplayPath(result.filepath, options.cwd)})` : "";
    const details = errors.map((err) => `  - ${err}`).join("\n");
    throw new Error(`Invalid Collie config${location}:\n${details}`);
  }
  return result;
}

async function findConfigFile(startDir: string): Promise<string | undefined> {
  let current = startDir;
  while (true) {
    for (const filename of SEARCH_FILES) {
      const candidate = path.join(current, filename);
      if (await fileExists(candidate)) {
        return candidate;
      }
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return undefined;
}

async function loadConfigFile(filepath: string): Promise<CollieConfig> {
  const basename = path.basename(filepath);
  if (basename === ".collierc" || basename === ".collierc.json") {
    return parseJsonFile(filepath);
  }
  if (basename === "collie.config.js") {
    return loadCommonJs(filepath);
  }
  if (basename === "collie.config.mjs") {
    return loadEsm(filepath);
  }
  throw new Error(`Unsupported Collie config file: ${basename}`);
}

async function parseJsonFile(filepath: string): Promise<CollieConfig> {
  try {
    const raw = await fs.readFile(filepath, "utf8");
    const parsed = JSON.parse(raw);
    return ensurePlainObject(parsed, filepath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse ${path.basename(filepath)}: ${message}`);
  }
}

async function loadCommonJs(filepath: string): Promise<CollieConfig> {
  try {
    const value = cjsRequire(filepath);
    return ensurePlainObject(await unwrapMaybePromise(value), filepath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load ${path.basename(filepath)}: ${message}`);
  }
}

async function loadEsm(filepath: string): Promise<CollieConfig> {
  try {
    const moduleUrl = pathToFileURL(filepath).href;
    const mod = await import(moduleUrl);
    const value = mod.default ?? mod;
    return ensurePlainObject(await unwrapMaybePromise(value), filepath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load ${path.basename(filepath)}: ${message}`);
  }
}

async function unwrapMaybePromise(value: unknown): Promise<unknown> {
  if (isPromiseLike(value)) {
    return await value;
  }
  return value;
}

function ensurePlainObject(value: unknown, filepath: string): CollieConfig {
  if (!isPlainObject(value)) {
    throw new Error(`${path.basename(filepath)} must export a plain object.`);
  }
  return value as CollieConfig;
}

async function fileExists(filepath: string): Promise<boolean> {
  try {
    await fs.access(filepath);
    return true;
  } catch {
    return false;
  }
}

function validateSectionKeys(
  section: Record<string, unknown>,
  allowed: string[],
  label: string,
  errors: string[]
): void {
  for (const key of Object.keys(section)) {
    if (!allowed.includes(key)) {
      errors.push(`Unknown option "${label}.${key}".`);
    }
  }
}

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as { then?: unknown }).then === "function"
  );
}

function formatDisplayPath(filepath: string, cwd?: string): string {
  const base = cwd ? path.resolve(cwd) : process.cwd();
  const relative = path.relative(base, filepath);
  return relative.startsWith("..") ? filepath : relative || path.basename(filepath);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
