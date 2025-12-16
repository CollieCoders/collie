export type DiagnosticSeverity = "error" | "warning";

export interface SourcePos {
  line: number;
  col: number;
  offset: number;
}

export interface SourceSpan {
  start: SourcePos;
  end: SourcePos;
}

export interface Diagnostic {
  severity: DiagnosticSeverity;
  message: string;
  span?: SourceSpan;
  code?: string;
}

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
  // MVP stub: replace with real lexer/parser/codegen.
  const componentName = options.componentNameHint ?? "CollieTemplate";

  const code = `
export default function ${componentName}(props) {
  return null;
}
`.trim();

  return { code, map: undefined, diagnostics: [] };
}
