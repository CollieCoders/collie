import { generateModule } from "./codegen";
import { parse } from "./parser";
import type { Diagnostic } from "./diagnostics";

export type {
  Diagnostic,
  DiagnosticSeverity,
  SourcePos,
  SourceSpan
} from "./diagnostics";
export { parse } from "./parser";
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
  TextChunk,
  TextExprPart,
  TextNode,
  TextPart
} from "./ast";

export interface CompileOptions {
  filename?: string;
  componentNameHint?: string;
  jsxRuntime?: "classic" | "automatic";
}

export interface CompileResult {
  code: string;
  map?: any;
  diagnostics: Diagnostic[];
}

export function compile(source: string, options: CompileOptions = {}): CompileResult {
  const componentName = options.componentNameHint ?? "CollieTemplate";
  const runtime = options.jsxRuntime ?? "automatic";
  const parseResult = parse(source);
  const diagnostics = attachFilename(parseResult.diagnostics, options.filename);

  let code = createStubComponent(componentName);
  const hasErrors = diagnostics.some((d) => d.severity === "error");

  if (!hasErrors) {
    code = generateModule(parseResult.root, { componentName, jsxRuntime: runtime });
  }

  return { code, map: undefined, diagnostics };
}

function createStubComponent(name: string): string {
  return [`export default function ${name}(props) {`, "  return null;", "}"].join("\n");
}

function attachFilename(diagnostics: Diagnostic[], filename?: string): Diagnostic[] {
  if (!filename) {
    return diagnostics;
  }
  return diagnostics.map((diag) => (diag.file ? diag : { ...diag, file: filename }));
}
