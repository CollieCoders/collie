import path from "node:path";
import fs from "node:fs/promises";
import fg from "fast-glob";
import type { HmrContext, Plugin, ResolvedConfig } from "vite";
import { normalizePath, transformWithEsbuild } from "vite";
import type { Diagnostic, TemplateUnit } from "@collie-lang/compiler";
import { compileTemplate, compileToTsx, parseCollie } from "@collie-lang/compiler";

type JsxRuntime = "automatic" | "classic";

export interface ColliePluginOptions {
  jsxRuntime?: JsxRuntime;
}

interface TemplateLocation {
  file: string;
  line?: number;
  col?: number;
}

interface TemplateRecord {
  id: string;
  encodedId: string;
  filePath: string;
  template: TemplateUnit;
  location: TemplateLocation;
}

const VIRTUAL_REGISTRY_ID = "virtual:collie/registry";
const VIRTUAL_REGISTRY_RESOLVED = "\0collie:registry";
const VIRTUAL_IDS_ID = "virtual:collie/ids";
const VIRTUAL_IDS_RESOLVED = "\0collie:ids";
const VIRTUAL_TEMPLATE_PREFIX = "virtual:collie/template/";
const VIRTUAL_TEMPLATE_RESOLVED_PREFIX = "\0collie:template:";
const COLLIE_GLOB = "**/*.collie";
const DEFAULT_IGNORE_GLOBS = ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/build/**", "**/.vite/**"];

function stripQuery(id: string): string {
  const q = id.indexOf("?");
  return q === -1 ? id : id.slice(0, q);
}

function isCollieFile(id: string): boolean {
  return stripQuery(id).endsWith(".collie");
}

function toComponentNameHint(id: string): string {
  const base = path.basename(stripQuery(id)).replace(/\.[^.]+$/, "");
  return `${base.replace(/[^a-zA-Z0-9_$]/g, "")}Template`;
}

function toDisplayPath(filePath: string, root?: string): string {
  const normalized = normalizePath(filePath);
  if (!root || !path.isAbsolute(filePath)) {
    return normalized;
  }
  const relative = path.relative(root, filePath);
  if (!relative || relative.startsWith("..")) {
    return normalized;
  }
  return normalizePath(relative);
}

function formatDiagnostic(id: string, diagnostic: Diagnostic, root?: string): string {
  const file = diagnostic.filePath ?? diagnostic.file ?? stripQuery(id);
  const displayFile = toDisplayPath(file, root);
  const range = diagnostic.range ?? diagnostic.span;
  const where = range ? `${range.start.line}:${range.start.col}` : "";
  const location = where ? `${displayFile}:${where}` : displayFile;
  const code = diagnostic.code ? diagnostic.code : "COLLIE";
  return `${location} [${code}] ${diagnostic.message}`;
}

function encodeTemplateId(id: string): string {
  return Buffer.from(id, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeTemplateId(encoded: string): string {
  const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = normalized.length % 4;
  const padded = padLength === 0 ? normalized : normalized + "=".repeat(4 - padLength);
  return Buffer.from(padded, "base64").toString("utf8");
}

function formatLocation(location: TemplateLocation, root?: string): string {
  const file = toDisplayPath(location.file, root);
  if (typeof location.line === "number" && typeof location.col === "number") {
    return `${file}:${location.line}:${location.col}`;
  }
  return file;
}

function formatDuplicateIdError(duplicates: Map<string, TemplateLocation[]>, root?: string): string {
  const lines = ["[collie] Duplicate template ids detected:"];
  const entries = Array.from(duplicates.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [id, locations] of entries) {
    const formatted = locations.map((location) => formatLocation(location, root)).join(", ");
    lines.push(`- ${id}: ${formatted}`);
  }
  return lines.join("\n");
}

function buildIgnoreGlobs(config?: ResolvedConfig): string[] {
  const ignore = new Set(DEFAULT_IGNORE_GLOBS);
  if (!config) {
    return Array.from(ignore);
  }

  const addRelativeDir = (dir?: string): void => {
    if (!dir) {
      return;
    }
    const absolute = path.isAbsolute(dir) ? dir : path.join(config.root, dir);
    const relative = normalizePath(path.relative(config.root, absolute));
    if (!relative || relative.startsWith("..")) {
      return;
    }
    ignore.add(`${relative}/**`);
  };

  addRelativeDir(config.build?.outDir);
  addRelativeDir(config.cacheDir);
  addRelativeDir(config.publicDir);

  return Array.from(ignore);
}

export default function colliePlugin(options: ColliePluginOptions = {}): Plugin {
  let resolvedRuntime: JsxRuntime = options.jsxRuntime ?? "automatic";
  let resolvedConfig: ResolvedConfig | undefined;
  let needsScan = true;
  const templatesById = new Map<string, TemplateRecord>();
  const templatesByEncodedId = new Map<string, TemplateRecord>();

  const resetTemplates = (): void => {
    needsScan = true;
    templatesById.clear();
    templatesByEncodedId.clear();
  };

  const ensureTemplates = async (watcher?: { addWatchFile: (id: string) => void }): Promise<void> => {
    if (!needsScan) {
      return;
    }

    if (!resolvedConfig) {
      throw new Error("[collie] Vite config was not resolved before scanning templates.");
    }

    templatesById.clear();
    templatesByEncodedId.clear();

    const root = resolvedConfig.root ?? process.cwd();
    const ignore = buildIgnoreGlobs(resolvedConfig);
    const filePaths = await fg(COLLIE_GLOB, {
      cwd: root,
      absolute: true,
      onlyFiles: true,
      ignore
    });

    const diagnostics: Diagnostic[] = [];
    const locationsById = new Map<string, TemplateLocation[]>();

    for (const filePath of filePaths) {
      if (watcher) {
        watcher.addWatchFile(filePath);
      }
      const source = await fs.readFile(filePath, "utf-8");
      const document = parseCollie(source, { filename: filePath });
      diagnostics.push(...document.diagnostics);

      for (const template of document.templates) {
        const location: TemplateLocation = {
          file: filePath,
          line: template.span?.start.line,
          col: template.span?.start.col
        };
        const encodedId = encodeTemplateId(template.id);
        const record: TemplateRecord = {
          id: template.id,
          encodedId,
          filePath,
          template,
          location
        };
        templatesById.set(template.id, record);
        templatesByEncodedId.set(encodedId, record);
        const locations = locationsById.get(template.id) ?? [];
        locations.push(location);
        locationsById.set(template.id, locations);
      }
    }

    const errors = diagnostics.filter((diag) => diag.severity === "error");
    if (errors.length) {
      const formatted = errors
        .map((diag) => formatDiagnostic(root, diag, root))
        .join("\n");
      throw new Error(`[collie]\n${formatted}`);
    }

    const duplicates = new Map(
      Array.from(locationsById.entries()).filter(([, locations]) => locations.length > 1)
    );
    if (duplicates.size) {
      throw new Error(formatDuplicateIdError(duplicates, root));
    }

    needsScan = false;
  };

  return {
    name: "collie",
    enforce: "pre",

    configResolved(config) {
      resolvedRuntime = options.jsxRuntime ?? "automatic";
      resolvedConfig = config;
      resetTemplates();
    },

    resolveId(id) {
      const cleanId = stripQuery(id);
      if (cleanId === VIRTUAL_REGISTRY_ID) {
        return VIRTUAL_REGISTRY_RESOLVED;
      }
      if (cleanId === VIRTUAL_IDS_ID) {
        return VIRTUAL_IDS_RESOLVED;
      }
      if (cleanId === VIRTUAL_REGISTRY_RESOLVED) {
        return cleanId;
      }
      if (cleanId === VIRTUAL_IDS_RESOLVED) {
        return cleanId;
      }
      if (cleanId.startsWith(VIRTUAL_TEMPLATE_PREFIX)) {
        return VIRTUAL_TEMPLATE_RESOLVED_PREFIX + cleanId.slice(VIRTUAL_TEMPLATE_PREFIX.length);
      }
      if (cleanId.startsWith(VIRTUAL_TEMPLATE_RESOLVED_PREFIX)) {
        return cleanId;
      }
      return null;
    },

    async load(id) {
      const cleanId = stripQuery(id);
      if (cleanId === VIRTUAL_REGISTRY_RESOLVED) {
        try {
          await ensureTemplates(this);
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          this.error(err);
        }

        const entries = Array.from(templatesById.values()).sort((a, b) =>
          a.id.localeCompare(b.id)
        );
        const lines = entries.map(
          (record) =>
            `  ${JSON.stringify(record.id)}: () => import(${JSON.stringify(
              `${VIRTUAL_TEMPLATE_PREFIX}${record.encodedId}`
            )}),`
        );
        return {
          code: [
            "/** @type {Record<string, () => Promise<{ render: (props: any) => any }>>} */",
            `export const registry = {\n${lines.join("\n")}\n};`
          ].join("\n"),
          map: null
        };
      }

      if (cleanId === VIRTUAL_IDS_RESOLVED) {
        try {
          await ensureTemplates(this);
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          this.error(err);
        }

        const ids = Array.from(templatesById.keys()).sort((a, b) => a.localeCompare(b));
        return {
          code: [
            "/** @type {readonly string[]} */",
            `export const ids = ${JSON.stringify(ids)};`
          ].join("\n"),
          map: null
        };
      }

      if (cleanId.startsWith(VIRTUAL_TEMPLATE_RESOLVED_PREFIX)) {
        const encoded = cleanId.slice(VIRTUAL_TEMPLATE_RESOLVED_PREFIX.length);
        try {
          await ensureTemplates(this);
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          this.error(err);
        }

        const record = templatesByEncodedId.get(encoded);
        if (!record) {
          let decoded = encoded;
          try {
            decoded = decodeTemplateId(encoded);
          } catch {
            // Keep encoded value for the error message.
          }
          this.error(new Error(`[collie] Unknown template id "${decoded}".`));
        }

        const result = compileTemplate(record.template, {
          filename: record.filePath,
          jsxRuntime: resolvedRuntime,
          flavor: "tsx"
        });

        const errors = result.diagnostics.filter((diag) => diag.severity === "error");
        if (errors.length) {
          const formatted = errors
            .map((diag) => formatDiagnostic(record.filePath, diag, resolvedConfig?.root))
            .join("\n");
          this.error(new Error(`[collie]\n${formatted}`));
        }

        const transformed = await transformWithEsbuild(result.code, record.filePath, {
          loader: "tsx",
          jsx: resolvedRuntime === "classic" ? "transform" : "automatic",
          jsxImportSource: "react"
        });

        return {
          code: transformed.code,
          map: transformed.map ?? null
        };
      }

      if (!isCollieFile(id)) return null;

      const filePath = stripQuery(id);
      const source = await fs.readFile(filePath, "utf-8");

      const result = compileToTsx(source, {
        filename: filePath,
        componentNameHint: toComponentNameHint(filePath),
        jsxRuntime: resolvedRuntime
      });

      const errors = result.diagnostics.filter((d) => d.severity === "error");
      if (errors.length) {
        const formatted = errors
          .map((diag) => formatDiagnostic(filePath, diag, resolvedConfig?.root))
          .join("\n");
        this.error(new Error(`[collie]\n${formatted}`));
      }

      // Compiler output contains JSX. Transform it to plain JS so Rollup can parse.
      const transformed = await transformWithEsbuild(result.code, filePath, {
        loader: "tsx",
        jsx: resolvedRuntime === "classic" ? "transform" : "automatic",
        jsxImportSource: "react"
      });

      return {
        code: transformed.code,
        map: transformed.map ?? null
      };
    },

    handleHotUpdate(ctx: HmrContext) {
      if (!isCollieFile(ctx.file)) {
        return;
      }

      resetTemplates();
      for (const mod of ctx.modules) {
        ctx.server.moduleGraph.invalidateModule(mod);
      }

      ctx.server.ws.send({ type: "full-reload", path: ctx.file });
      return [];
    }
  };
}
