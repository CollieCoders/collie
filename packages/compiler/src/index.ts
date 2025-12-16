import { generateModule } from "./codegen";
import { parse } from "./parser";
import type { Diagnostic } from "./diagnostics";

export type {
  Diagnostic,
  DiagnosticSeverity,
  SourcePos,
  SourceSpan
} from "./diagnostics";

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
  const parseResult = parse(source);
  const diagnostics = parseResult.diagnostics;

  let code = createStubComponent(componentName);
  const hasErrors = diagnostics.some((d) => d.severity === "error");

  if (!hasErrors) {
    code = generateModule(parseResult.root, { componentName });
  }

  return { code, map: undefined, diagnostics };
}

function createStubComponent(name: string): string {
  return [`export default function ${name}(props) {`, "  return null;", "}"].join("\n");
}
