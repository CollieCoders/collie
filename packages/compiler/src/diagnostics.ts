export type DiagnosticSeverity = "error" | "warning";

export type DiagnosticCode =
  | "COLLIE001"
  | "COLLIE002"
  | "COLLIE003"
  | "COLLIE004"
  | "COLLIE005"
  | "COLLIE101"
  | "COLLIE102"
  | "COLLIE103"
  | "COLLIE104"
  | "COLLIE105"
  | "COLLIE106"
  | "COLLIE201"
  | "COLLIE202"
  | "COLLIE203"
  | "COLLIE204"
  | "COLLIE205"
  | "COLLIE206"
  | "COLLIE207"
  | "COLLIE208"
  | "COLLIE209"
  | "COLLIE210"
  | "COLLIE211"
  | "COLLIE212"
  | "COLLIE213"
  | "COLLIE301"
  | "COLLIE302"
  | "COLLIE303"
  | "COLLIE304"
  | "COLLIE305"
  | "COLLIE306"
  | "COLLIE307"
  | "COLLIE401"
  | "COLLIE402"
  | "COLLIE501"
  | "COLLIE502"
  | "COLLIE503"
  | "COLLIE601"
  | "COLLIE701"
  | "COLLIE702"
  | "COLLIE703"
  | "COLLIE_ID_NOT_PASCAL_CASE"
  | "dialect.token.disallowed"
  | "dialect.token.nonPreferred";

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
  range?: SourceSpan;
  code?: DiagnosticCode;
  file?: string;
  filePath?: string;
  fix?: DiagnosticFix;
  data?: DiagnosticData;
}

export interface DiagnosticFix {
  range: SourceSpan;
  replacementText: string;
}

export interface DiagnosticData {
  kind: string;
  [key: string]: unknown;
}

export function createSpan(line: number, col: number, length: number, lineOffset: number): SourceSpan {
  const startOffset = lineOffset + col - 1;
  return {
    start: { line, col, offset: startOffset },
    end: { line, col: col + length, offset: startOffset + length }
  };
}
