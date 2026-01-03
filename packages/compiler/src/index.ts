import type { NormalizedCollieDialectOptions } from "@collie-lang/config";
import { generateModule } from "./codegen";
import { generateHtml } from "./html-codegen";
import { parse } from "./parser";
import type { ParseResult, TemplateUnit } from "./parser";
import type { Diagnostic } from "./diagnostics";
import type { RootNode } from "./ast";

export type {
  CollieConfig,
  CollieCssOptions,
  CollieCssStrategy,
  CollieDialectOptions,
  CollieDialectPropsOptions,
  CollieDialectTokenKind,
  CollieDialectTokenRule,
  CollieDialectTokens,
  CollieDiagnosticLevel,
  CollieProjectConfig,
  CollieCompilerOptions,
  CollieFeatureOptions,
  CollieEditorOptions,
  HtmlProjectOptions,
  ReactProjectOptions,
  NormalizedCollieCssOptions,
  NormalizedCollieConfig,
  NormalizedCollieDialectOptions,
  NormalizedCollieDialectPropsOptions,
  NormalizedCollieDialectTokenRule,
  NormalizedCollieDialectTokens,
  NormalizedCollieProjectConfig
} from "@collie-lang/config";
export {
  defineConfig,
  loadConfig,
  loadAndNormalizeConfig,
  normalizeConfig
} from "@collie-lang/config";

export type {
  Diagnostic,
  DiagnosticFix,
  DiagnosticSeverity,
  SourcePos,
  SourceSpan
} from "./diagnostics";
export { applyFixes, fixAllFromDiagnostics } from "./fixes";
export type { ParseResult, TemplateUnit } from "./parser";
export type {
  Attribute,
  ClassAliasDecl,
  ClassAliasesDecl,
  ComponentNode,
  ConditionalBranch,
  ConditionalNode,
  ElementNode,
  ExpressionNode,
  ForNode,
  JSXPassthroughNode,
  Node,
  PropsDecl,
  PropsField,
  RootNode,
  SlotBlock,
  TextChunk,
  TextExprPart,
  TextNode,
  TextPart
} from "./ast";
export type { FormatOptions, FormatResult } from "./format";
export { formatCollie } from "./format";
export type { ConvertTsxOptions, ConvertTsxResult } from "./convert";
export { convertTsxToCollie } from "./convert";

export interface ParseCollieOptions {
  filename?: string;
  dialect?: NormalizedCollieDialectOptions;
}

export interface BaseCompileOptions {
  filename?: string;
  componentNameHint?: string;
  dialect?: NormalizedCollieDialectOptions;
}

export interface JsxCompileOptions extends BaseCompileOptions {
  jsxRuntime?: "classic" | "automatic";
}

export interface TsxCompileOptions extends BaseCompileOptions {
  jsxRuntime?: "classic" | "automatic";
}

export interface HtmlCompileOptions extends BaseCompileOptions {
  pretty?: boolean;
}

export interface CollieCompileMeta {
  id?: string;
  rawId?: string;
  filename?: string;
}

export interface CompileResult {
  code: string;
  map?: any;
  diagnostics: Diagnostic[];
  meta?: CollieCompileMeta;
}

export interface ConvertCollieResult {
  tsx: string;
  diagnostics: Diagnostic[];
  meta?: CollieCompileMeta;
}

export type CollieDocument = ParseResult;
export type CompileOptions = JsxCompileOptions;

export function parseCollie(source: string, options: ParseCollieOptions = {}): CollieDocument {
  const result = parse(source, { dialect: options.dialect });
  if (!options.filename) {
    return {
      templates: result.templates.map((template) => ({
        ...template,
        diagnostics: normalizeDiagnostics(template.diagnostics)
      })),
      diagnostics: normalizeDiagnostics(result.diagnostics)
    };
  }
  return {
    templates: result.templates.map((template) => ({
      ...template,
      diagnostics: normalizeDiagnostics(template.diagnostics, options.filename)
    })),
    diagnostics: normalizeDiagnostics(result.diagnostics, options.filename)
  };
}

export function compileToJsx(
  sourceOrAst: string | RootNode | CollieDocument,
  options: JsxCompileOptions = {}
): CompileResult {
  const document = normalizeDocument(sourceOrAst, options.filename, options.dialect);
  const diagnostics = normalizeDiagnostics(document.diagnostics, options.filename);
  const template = document.templates[0];
  const componentName = options.componentNameHint ?? "CollieTemplate";
  const jsxRuntime = options.jsxRuntime ?? "automatic";

  let code = createStubComponent(componentName, "jsx");
  if (!hasErrors(diagnostics) && template) {
    code = generateModule(template.ast, { componentName, jsxRuntime, flavor: "jsx" });
  }

  const meta = buildCompileMeta(document, template, options.filename);
  return { code, diagnostics, map: undefined, meta };
}

export function compileToTsx(
  sourceOrAst: string | RootNode | CollieDocument,
  options: TsxCompileOptions = {}
): CompileResult {
  const document = normalizeDocument(sourceOrAst, options.filename, options.dialect);
  const diagnostics = normalizeDiagnostics(document.diagnostics, options.filename);
  const template = document.templates[0];
  const componentName = options.componentNameHint ?? "CollieTemplate";
  const jsxRuntime = options.jsxRuntime ?? "automatic";

  let code = createStubComponent(componentName, "tsx");
  if (!hasErrors(diagnostics) && template) {
    code = generateModule(template.ast, { componentName, jsxRuntime, flavor: "tsx" });
  }

  const meta = buildCompileMeta(document, template, options.filename);
  return { code, diagnostics, map: undefined, meta };
}

export function convertCollieToTsx(source: string, options: TsxCompileOptions = {}): ConvertCollieResult {
  const result = compileToTsx(source, options);
  return {
    tsx: result.code,
    diagnostics: result.diagnostics,
    meta: result.meta
  };
}

export function compileToHtml(
  sourceOrAst: string | RootNode | CollieDocument,
  options: HtmlCompileOptions = {}
): CompileResult {
  const document = normalizeDocument(sourceOrAst, options.filename, options.dialect);
  const diagnostics = normalizeDiagnostics(document.diagnostics, options.filename);
  const template = document.templates[0];

  let code = createStubHtml();
  if (!hasErrors(diagnostics) && template) {
    code = generateHtml(template.ast);
  }

  const meta = buildCompileMeta(document, template, options.filename);
  return { code, diagnostics, map: undefined, meta };
}

export function compile(source: string, options: CompileOptions = {}): CompileResult {
  return compileToJsx(source, options);
}

export { parseCollie as parse };

function normalizeDocument(
  sourceOrAst: string | RootNode | CollieDocument,
  filename?: string,
  dialect?: NormalizedCollieDialectOptions
): CollieDocument {
  if (typeof sourceOrAst === "string") {
    return parseCollie(sourceOrAst, { filename, dialect });
  }

  if (isCollieDocument(sourceOrAst)) {
    if (!filename) {
      return sourceOrAst;
    }
    return attachFilenameToDocument(sourceOrAst, filename);
  }

  if (isRootNode(sourceOrAst)) {
    const id = sourceOrAst.id ?? sourceOrAst.rawId ?? "";
    const rawId = sourceOrAst.rawId ?? sourceOrAst.id ?? "";
    const template: TemplateUnit = {
      id,
      rawId,
      span: sourceOrAst.idTokenSpan,
      ast: sourceOrAst,
      diagnostics: []
    };
    return { templates: [template], diagnostics: [] };
  }

  throw new TypeError("Collie compiler expected source text, a parsed document, or a root node.");
}

function isRootNode(value: unknown): value is RootNode {
  return !!value && typeof value === "object" && (value as { type?: unknown }).type === "Root";
}

function isCollieDocument(value: unknown): value is CollieDocument {
  return (
    !!value &&
    typeof value === "object" &&
    Array.isArray((value as { templates?: unknown }).templates) &&
    Array.isArray((value as { diagnostics?: unknown }).diagnostics)
  );
}

function hasErrors(diagnostics: Diagnostic[]): boolean {
  return diagnostics.some((diag) => diag.severity === "error");
}

function createStubComponent(name: string, flavor: "jsx" | "tsx"): string {
  if (flavor === "tsx") {
    return [
      "export type Props = Record<string, never>;",
      `export default function ${name}(props: Props) {`,
      "  return null;",
      "}"
    ].join("\n");
  }
  return [`export default function ${name}(props) {`, "  return null;", "}"].join("\n");
}

function createStubHtml(): string {
  return "";
}

function buildCompileMeta(
  document: CollieDocument,
  template: TemplateUnit | undefined,
  filename?: string
): CollieCompileMeta | undefined {
  const meta: CollieCompileMeta = {};
  if (filename) {
    meta.filename = filename;
  }
  if (template?.rawId) {
    meta.rawId = template.rawId;
  }
  if (template?.id) {
    meta.id = template.id;
  }

  return meta.id || meta.rawId || meta.filename ? meta : undefined;
}
function attachFilenameToDocument(document: CollieDocument, filename?: string): CollieDocument {
  if (!filename) {
    return document;
  }
  return {
    templates: document.templates.map((template) => ({
      ...template,
      diagnostics: normalizeDiagnostics(template.diagnostics, filename)
    })),
    diagnostics: normalizeDiagnostics(document.diagnostics, filename)
  };
}

function normalizeDiagnostics(diagnostics: Diagnostic[], filename?: string): Diagnostic[] {
  return diagnostics.map((diag) => {
    const filePath = diag.filePath ?? diag.file ?? filename;
    const file = diag.file ?? filename;
    const range = diag.range ?? diag.span;

    if (filePath === diag.filePath && file === diag.file && range === diag.range) {
      return diag;
    }

    return {
      ...diag,
      filePath,
      file,
      range
    };
  });
}
