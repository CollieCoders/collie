export type DiagnosticSeverity = "error" | "warning";

export type DiagnosticCode =
  | "COLLIE001"
  | "COLLIE002"
  | "COLLIE003"
  | "COLLIE004"
  | "COLLIE005";

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
  code?: DiagnosticCode;
}

export function createSpan(line: number, col: number, length: number, lineOffset: number): SourceSpan {
  const startOffset = lineOffset + col - 1;
  return {
    start: { line, col, offset: startOffset },
    end: { line, col: col + length, offset: startOffset + length }
  };
}
