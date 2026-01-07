import { dirname, resolve } from 'node:path';
import ts from 'typescript';

export interface TypecheckOptions {
  tsconfigPath: string;
}

export interface TypecheckResult {
  program: ts.Program;
  diagnostics: readonly ts.Diagnostic[];
}

const parseTsconfig = (tsconfigPath: string): ts.ParsedCommandLine => {
  const normalizedPath = resolve(tsconfigPath);
  const configFile = ts.readConfigFile(normalizedPath, ts.sys.readFile);

  if (configFile.error) {
    throw new Error(`Failed to read tsconfig at ${tsconfigPath}`);
  }

  return ts.parseJsonConfigFileContent(configFile.config, ts.sys, dirname(normalizedPath));
};

export const typecheckWithTsconfig = (options: TypecheckOptions): TypecheckResult => {
  const parsed = parseTsconfig(options.tsconfigPath);
  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
    projectReferences: parsed.projectReferences
  });

  return {
    program,
    diagnostics: [...(parsed.errors ?? []), ...ts.getPreEmitDiagnostics(program)]
  };
};
