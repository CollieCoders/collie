import path from "node:path";
import fs from "node:fs/promises";
import fg from "fast-glob";
import type { HmrContext, ModuleNode, Plugin, ResolvedConfig } from "vite";
import { normalizePath, transformWithEsbuild } from "vite";
import type { Diagnostic, TemplateUnit } from "@collie-lang/compiler";
import { compileTemplate, parseCollie } from "@collie-lang/compiler";

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

function isVirtualCollieId(id: string): boolean {
  return (
    id === VIRTUAL_REGISTRY_ID ||
    id === VIRTUAL_REGISTRY_RESOLVED ||
    id === VIRTUAL_IDS_ID ||
    id === VIRTUAL_IDS_RESOLVED ||
    id.startsWith(VIRTUAL_TEMPLATE_PREFIX) ||
    id.startsWith(VIRTUAL_TEMPLATE_RESOLVED_PREFIX)
  );
}

function buildDirectImportError(importedId: string, importer?: string, root?: string): Error {
  const importLine = stripQuery(importedId);
  const importerLabel = importer ? toDisplayPath(importer, root) : "<unknown>";
  const lines = [
    "Direct .collie imports are not supported.",
    `Importer: ${importerLabel}`,
    `Import: ${importLine}`,
    "Use the registry runtime instead:",
    "import { Collie } from '@collie-lang/react'",
    '<Collie id="Your.TemplateId" />',
    "Templates are discovered automatically by @collie-lang/vite."
  ];
  return new Error(lines.join("\n"));
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
  const fileToTemplateIds = new Map<string, Set<string>>();
  const templateIdToVirtualId = new Map<string, string>();

  const resetTemplates = (): void => {
    needsScan = true;
    templatesById.clear();
    templatesByEncodedId.clear();
    fileToTemplateIds.clear();
    templateIdToVirtualId.clear();
  };

  const trackTemplateRecord = (record: TemplateRecord): void => {
    templatesById.set(record.id, record);
    templatesByEncodedId.set(record.encodedId, record);
    templateIdToVirtualId.set(record.id, `${VIRTUAL_TEMPLATE_RESOLVED_PREFIX}${record.encodedId}`);
    const ids = fileToTemplateIds.get(record.filePath) ?? new Set<string>();
    ids.add(record.id);
    fileToTemplateIds.set(record.filePath, ids);
  };

  const removeFileTemplates = (filePath: string): Set<string> => {
    const ids = fileToTemplateIds.get(filePath) ?? new Set<string>();
    for (const id of ids) {
      const record = templatesById.get(id);
      if (record && record.filePath === filePath) {
        templatesById.delete(id);
        templatesByEncodedId.delete(record.encodedId);
        templateIdToVirtualId.delete(id);
      }
    }
    fileToTemplateIds.delete(filePath);
    return ids;
  };

  const collectModuleIds = (ids: Iterable<string>): Set<string> => {
    const moduleIds = new Set<string>();
    for (const id of ids) {
      const moduleId = templateIdToVirtualId.get(id);
      if (moduleId) {
        moduleIds.add(moduleId);
      }
    }
    return moduleIds;
  };

  const reportHmrError = (ctx: HmrContext, error: unknown): void => {
    const err = error instanceof Error ? error : new Error(String(error));
    ctx.server.config.logger.error(err.message);
    ctx.server.ws.send({
      type: "error",
      err: {
        message: err.message,
        stack: err.stack ?? ""
      }
    });
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
    fileToTemplateIds.clear();
    templateIdToVirtualId.clear();

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
        trackTemplateRecord(record);
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

  const updateFileTemplates = async (ctx: HmrContext): Promise<ModuleNode[]> => {
    if (needsScan) {
      try {
        await ensureTemplates();
      } catch (error) {
        reportHmrError(ctx, error);
        return [];
      }
    }

    const filePath = ctx.file;
    const root = resolvedConfig?.root ?? process.cwd();
    const previousIds = fileToTemplateIds.get(filePath) ?? new Set<string>();
    const previousModuleIds = collectModuleIds(previousIds);

    let source: string | null = null;
    try {
      source = await fs.readFile(filePath, "utf-8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
        removeFileTemplates(filePath);
        return invalidateModules(ctx, previousModuleIds);
      }
      reportHmrError(ctx, error);
      return [];
    }

    const document = parseCollie(source, { filename: filePath });
    const errors = document.diagnostics.filter((diag: Diagnostic) => diag.severity === "error");
    if (errors.length) {
      const formatted = errors.map((diag: Diagnostic) => formatDiagnostic(filePath, diag, root)).join("\n");
      reportHmrError(ctx, new Error(`[collie]\n${formatted}`));
      return [];
    }

    const duplicates = new Map<string, TemplateLocation[]>();
    for (const template of document.templates) {
      const existing = templatesById.get(template.id);
      if (existing && existing.filePath !== filePath) {
        const locations = duplicates.get(template.id) ?? [existing.location];
        locations.push({
          file: filePath,
          line: template.span?.start.line,
          col: template.span?.start.col
        });
        duplicates.set(template.id, locations);
      }
    }
    if (duplicates.size) {
      reportHmrError(ctx, new Error(formatDuplicateIdError(duplicates, root)));
      return [];
    }

    removeFileTemplates(filePath);
    for (const template of document.templates) {
      const record: TemplateRecord = {
        id: template.id,
        encodedId: encodeTemplateId(template.id),
        filePath,
        template,
        location: {
          file: filePath,
          line: template.span?.start.line,
          col: template.span?.start.col
        }
      };
      trackTemplateRecord(record);
    }

    const nextIds = fileToTemplateIds.get(filePath) ?? new Set<string>();
    const nextModuleIds = collectModuleIds(nextIds);
    const moduleIds = new Set<string>([...previousModuleIds, ...nextModuleIds]);
    return invalidateModules(ctx, moduleIds);
  };

  const invalidateModules = (ctx: HmrContext, moduleIds: Iterable<string>): ModuleNode[] => {
    const modules: ModuleNode[] = [];
    const registryModule = ctx.server.moduleGraph.getModuleById(VIRTUAL_REGISTRY_RESOLVED);
    if (registryModule) {
      ctx.server.moduleGraph.invalidateModule(registryModule);
      modules.push(registryModule);
    }
    for (const moduleId of moduleIds) {
      const mod = ctx.server.moduleGraph.getModuleById(moduleId);
      if (mod) {
        ctx.server.moduleGraph.invalidateModule(mod);
        modules.push(mod);
      }
    }
    return modules;
  };

  return {
    name: "collie",
    enforce: "pre",

    config(userConfig) {
      const prevExclude = userConfig.optimizeDeps?.exclude ?? [];
      const exclude = Array.from(new Set([...prevExclude, "@collie-lang/react"]));

      const prevNoExternal = userConfig.ssr?.noExternal;
      const nextNoExternal = Array.isArray(prevNoExternal)
        ? Array.from(new Set([...prevNoExternal, "@collie-lang/react"]))
        : prevNoExternal == null
          ? ["@collie-lang/react"]
          : undefined;

      return {
        optimizeDeps: {
          exclude
        },
        ...(nextNoExternal
          ? {
              ssr: {
                noExternal: nextNoExternal
              }
            }
          : {})
      };
    },

    configResolved(config) {
      resolvedRuntime = options.jsxRuntime ?? "automatic";
      resolvedConfig = config;
      resetTemplates();
    },

    resolveId(id, importer) {
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

      const isInternalImporter =
        typeof importer === "string" &&
        (importer.startsWith("\0collie:") || importer.startsWith("collie:"));

      if (!isVirtualCollieId(cleanId) && cleanId.endsWith(".collie") && !isInternalImporter) {
        this.error(buildDirectImportError(cleanId, importer, resolvedConfig?.root));
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
          return null; // <-- TS: stop control-flow here
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
          return null; // <-- TS: stop control-flow here
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
          return null; // <-- TS: stop control-flow here
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
          return null; // <-- ✅ THIS is what fixes "'record' is possibly 'undefined'"
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
          return null; // <-- TS: stop control-flow here
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

      if (isCollieFile(cleanId)) {
        const info = this.getModuleInfo(cleanId);
        const importer = info?.importers?.[0];

        const isInternalImporter =
          typeof importer === "string" &&
          (importer.startsWith("\0collie:") || importer.startsWith("collie:"));

        if (!isInternalImporter) {
          this.error(buildDirectImportError(cleanId, importer, resolvedConfig?.root));
          return null; // <-- TS: stop control-flow here
        }

        return null;
      }

      return null;
    },

    handleHotUpdate(ctx: HmrContext) {
      if (!isCollieFile(ctx.file)) {
        return;
      }

      return updateFileTemplates(ctx);
    }
  };
}
