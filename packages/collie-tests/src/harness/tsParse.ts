import ts from 'typescript';

export interface ParseOptions {
  fileName?: string;
  scriptKind?: ts.ScriptKind;
}

export interface ParseResult {
  sourceFile: ts.SourceFile;
  diagnostics: readonly ts.DiagnosticWithLocation[];
}

export const parseTypescriptSnippet = (
  source: string,
  options: ParseOptions = {}
): ParseResult => {
  const fileName = options.fileName ?? 'virtual.tsx';
  const scriptKind =
    options.scriptKind ??
    (fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind
  );

  return {
    sourceFile,
    diagnostics: sourceFile.parseDiagnostics ?? []
  };
};
