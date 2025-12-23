export interface CollieConfig {
  compiler?: CollieCompilerOptions;
  features?: CollieFeatureOptions;
  editor?: CollieEditorOptions;
  projects: CollieProjectConfig[];
}

export interface CollieProjectConfig {
  name?: string;
  type: "html" | "react-vite" | "react-next" | "react-generic";
  root?: string;
  tags?: string[];
  input: string | string[];
  output?: {
    dir?: string;
    format?: "jsx" | "tsx";
  };
  html?: HtmlProjectOptions;
  react?: ReactProjectOptions;
}

export interface CollieCompilerOptions {
  strictIndentation?: boolean;
  prettyPrintHtml?: boolean;
  minifyHtml?: boolean;
  targetJsVersion?: "es2017" | "es2019" | "es2020" | "esnext";
  diagnostics?: {
    treatWarningsAsErrors?: boolean;
    suppress?: string[];
  };
  mode?: "relaxed" | "balanced" | "strict";
  transforms?: {
    html?: (html: string, context: { file: string }) => string;
  };
}

export interface HtmlProjectOptions {
  naming?: {
    pattern?: "PascalToSame" | "PascalToKebab" | "fileStem";
  };
  placeholders?: {
    strategy?: "idSuffix" | "dataAttribute";
    suffix?: string;
    attribute?: string;
  };
  injection?: {
    mode: "runtime" | "static";
    template?: string;
    outFile?: string;
  };
  runtime?: {
    mode?: "local" | "cdn";
    local?: {
      path?: string;
    };
    cdn?: {
      version?: string;
      runtimeUrl?: string;
      convertUrl?: string;
    };
  };
  smartMounts?: {
    enforce?: "warn" | "error" | "off";
    suggestInTemplate?: boolean;
  };
  onMissingPartial?: "error" | "warn" | "silentPlaceholder";
  missingPartialPlaceholder?: string;
}

export interface ReactProjectOptions {
  jsxRuntime?: "automatic" | "classic";
  defaultOutput?: "tsx" | "jsx";
  typeChecking?: "strict" | "loose" | "off";
}

export interface CollieFeatureOptions {
  presets?: string[];
}

export interface CollieEditorOptions {
  defaultIndentSize?: 2 | 4;
  showExperimentalFeaturesInCompletions?: boolean;
  snippets?: {
    enableBuiltins?: boolean;
    groups?: string[];
  };
  diagnostics?: {
    underlineCollieGeneratedRegions?: "off" | "light" | "bold";
  };
}

export interface NormalizedCollieConfig extends CollieConfig {
  projects: NormalizedCollieProjectConfig[];
}

export interface NormalizedCollieProjectConfig extends CollieProjectConfig {
  name: string;
  root: string;
  input: string[];
  output: {
    dir?: string;
    format?: "jsx" | "tsx";
  };
  html?: HtmlProjectOptions;
  react?: ReactProjectOptions;
}
