import path from "node:path";
import type { Diagnostic } from "@collie-lang/compiler";
import { compile } from "@collie-lang/compiler";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const defaultMetroTransformer = require("metro-react-native-babel-transformer");

interface TransformInput {
  filename: string;
  src: string;
  options: Record<string, any>;
}

interface TransformResult {
  ast?: any;
  code: string;
  map?: any;
  dependencies?: any;
}

export interface CollieMetroTransformerOptions {
  baseTransformer?: {
    transform?: (props: TransformInput) => TransformResult | Promise<TransformResult>;
    getCacheKey?: (...args: any[]) => string;
  };
}

export function createCollieMetroTransformer(options: CollieMetroTransformerOptions = {}) {
  const base = options.baseTransformer ?? defaultMetroTransformer;
  const baseTransform = typeof base.transform === "function" ? base.transform.bind(base) : base;
  const baseGetCacheKey = typeof base.getCacheKey === "function" ? base.getCacheKey.bind(base) : null;

  return {
    async transform(props: TransformInput): Promise<TransformResult> {
      if (props.filename.endsWith(".collie")) {
        const result = compile(props.src, {
          filename: props.filename,
          componentNameHint: toComponentNameHint(props.filename),
          jsxRuntime: "automatic"
        });

        const errors = result.diagnostics.filter((diag) => diag.severity === "error");
        if (errors.length) {
          const formatted = errors.map((diag) => formatDiagnostic(props.filename, diag)).join("\n");
          throw new Error(`[collie] ${formatted}`);
        }

        return {
          code: result.code,
          map: result.map ?? null
        };
      }

      return baseTransform(props);
    },
    getCacheKey(fileData?: string, filePath?: string, configString?: string, optionsArg?: unknown): string {
      const baseKey = baseGetCacheKey ? baseGetCacheKey(fileData, filePath, configString, optionsArg) : "collie";
      return `${baseKey}:collie`;
    }
  };
}

function toComponentNameHint(filePath: string): string {
  const base = path.basename(filePath).replace(/\.[^.]+$/, "");
  return `${base.replace(/[^a-zA-Z0-9_$]/g, "")}Template`;
}

function formatDiagnostic(filePath: string, diagnostic: Diagnostic): string {
  const file = diagnostic.file ?? filePath;
  const where = diagnostic.span ? `${diagnostic.span.start.line}:${diagnostic.span.start.col}` : "";
  const location = where ? `${file}:${where}` : file;
  const code = diagnostic.code ?? "COLLIE";
  return `${location} [${code}] ${diagnostic.message}`;
}

const singleton = createCollieMetroTransformer();

export const transform = singleton.transform;
export const getCacheKey = singleton.getCacheKey;
