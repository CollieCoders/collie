import { generateModule } from "./codegen";
import { generateHtmlModule } from "./html-codegen";
import { parse } from "./parser";
import type { ParseResult } from "./parser";
import type { Diagnostic } from "./diagnostics";
import type { RootNode } from "./ast";

export type {
  Diagnostic,
  DiagnosticSeverity,
  SourcePos,
  SourceSpan
} from "./diagnostics";
export type { ParseResult } from "./parser";
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

export interface ParseCollieOptions {
  filename?: string;
}

export interface BaseCompileOptions {
  filename?: string;
  componentNameHint?: string;
}

export interface JsxCompileOptions extends BaseCompileOptions {
  jsxRuntime?: "classic" | "automatic";
}

export interface TsxCompileOptions extends BaseCompileOptions {
  jsxRuntime?: "classic" | "automatic";
}

export interface HtmlCompileOptions extends BaseCompileOptions {}

export interface CompileResult {
  code: string;
  map?: any;
  diagnostics: Diagnostic[];
}

export type CollieDocument = ParseResult;
export type CompileOptions = JsxCompileOptions;

export function parseCollie(source: string, options: ParseCollieOptions = {}): CollieDocument {
  const result = parse(source);
  if (!options.filename) {
    return result;
  }
  return { root: result.root, diagnostics: attachFilename(result.diagnostics, options.filename) };
}

export function compileToJsx(
  sourceOrAst: string | RootNode | CollieDocument,
  options: JsxCompileOptions = {}
): CompileResult {
  const document = normalizeDocument(sourceOrAst, options.filename);
  const diagnostics = options.filename ? attachFilename(document.diagnostics, options.filename) : document.diagnostics;
  const componentName = options.componentNameHint ?? "CollieTemplate";
  const jsxRuntime = options.jsxRuntime ?? "automatic";

  let code = createStubComponent(componentName, "jsx");
  if (!hasErrors(diagnostics)) {
    code = generateModule(document.root, { componentName, jsxRuntime, flavor: "jsx" });
  }

  return { code, diagnostics, map: undefined };
}

export function compileToTsx(
  sourceOrAst: string | RootNode | CollieDocument,
  options: TsxCompileOptions = {}
): CompileResult {
  const document = normalizeDocument(sourceOrAst, options.filename);
  const diagnostics = options.filename ? attachFilename(document.diagnostics, options.filename) : document.diagnostics;
  const componentName = options.componentNameHint ?? "CollieTemplate";
  const jsxRuntime = options.jsxRuntime ?? "automatic";

  let code = createStubComponent(componentName, "tsx");
  if (!hasErrors(diagnostics)) {
    code = generateModule(document.root, { componentName, jsxRuntime, flavor: "tsx" });
  }

  return { code, diagnostics, map: undefined };
}

export function compileToHtml(
  sourceOrAst: string | RootNode | CollieDocument,
  options: HtmlCompileOptions = {}
): CompileResult {
  const document = normalizeDocument(sourceOrAst, options.filename);
  const diagnostics = options.filename ? attachFilename(document.diagnostics, options.filename) : document.diagnostics;
  const componentName = options.componentNameHint ?? "CollieTemplate";

  let code = createStubHtml(componentName);
  if (!hasErrors(diagnostics)) {
    code = generateHtmlModule(document.root, { componentName });
  }

  return { code, diagnostics, map: undefined };
}

export function compile(source: string, options: CompileOptions = {}): CompileResult {
  return compileToJsx(source, options);
}

export { parseCollie as parse };

function normalizeDocument(
  sourceOrAst: string | RootNode | CollieDocument,
  filename?: string
): CollieDocument {
  if (typeof sourceOrAst === "string") {
    return parseCollie(sourceOrAst, { filename });
  }

  if (isCollieDocument(sourceOrAst)) {
    if (!filename) {
      return sourceOrAst;
    }
    return { root: sourceOrAst.root, diagnostics: attachFilename(sourceOrAst.diagnostics, filename) };
  }

  if (isRootNode(sourceOrAst)) {
    return { root: sourceOrAst, diagnostics: [] };
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
    isRootNode((value as { root?: unknown }).root) &&
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

function createStubHtml(name: string): string {
  return [`export default function ${name}(props = {}) {`, '  return "";', "}"].join("\n");
}

function attachFilename(diagnostics: Diagnostic[], filename?: string): Diagnostic[] {
  if (!filename) {
    return diagnostics;
  }
  return diagnostics.map((diag) => (diag.file ? diag : { ...diag, file: filename }));
}
