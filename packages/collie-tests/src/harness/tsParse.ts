import ts from 'typescript';

export interface ParseResult {
  sourceFile: ts.SourceFile;
}

export const parseTypescriptSnippet = (
  source: string,
  fileName = 'virtual.tsx'
): ParseResult => ({
  sourceFile: ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
});
