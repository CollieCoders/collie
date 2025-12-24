import { defineConfig } from "@collie-lang/config";

export default defineConfig({
  compiler: {
    strictIndentation: true,
    prettyPrintHtml: true,
    minifyHtml: false,
    targetJsVersion: "es2019",
    mode: "balanced",
    diagnostics: {
      treatWarningsAsErrors: false,
      suppress: ["unused-class", "missing-partial"]
    },
    transforms: {
      html(html, { file }) {
        return `<!-- Generated from ${file} -->\n${html}`;
      }
    }
  },
  features: {
    presets: ["landing-page", "docs-site"]
  },
  editor: {
    defaultIndentSize: 2,
    showExperimentalFeaturesInCompletions: false,
    snippets: {
      enableBuiltins: true,
      groups: ["html-partials", "react-components"]
    },
    diagnostics: {
      underlineCollieGeneratedRegions: "light"
    }
  },
  projects: [
    {
      name: "marketing-site",
      type: "html",
      tags: ["public", "landing"],
      root: ".",
      input: "src/collie/**/*.collie",
      output: {
        dir: "public/collie/generated",
        format: "tsx"
      },
      html: {
        naming: {
          pattern: "PascalToSame"
        },
        placeholders: {
          strategy: "idSuffix",
          suffix: "-collie",
          attribute: "data-collie-partial"
        },
        injection: {
          mode: "runtime",
          template: "public/index.template.html",
          outFile: "public/index.html"
        },
        runtime: {
          mode: "local",
          local: {
            path: "public/collie-runtime.js"
          },
          cdn: {
            version: "v1",
            runtimeUrl: "https://cdn.collie-lang.org/v1/collie-html-runtime.js",
            convertUrl: "https://cdn.collie-lang.org/v1/collie-convert.js"
          }
        },
        smartMounts: {
          enforce: "warn",
          suggestInTemplate: true
        },
        onMissingPartial: "warn",
        missingPartialPlaceholder: "<!-- Missing Collie partial: {name} -->"
      }
    },
    {
      name: "app",
      type: "react-vite",
      tags: ["internal", "app"],
      root: ".",
      input: "src/**/*.collie",
      output: {
        dir: "src/generated",
        format: "tsx"
      },
      react: {
        jsxRuntime: "automatic",
        defaultOutput: "tsx",
        typeChecking: "strict"
      }
    }
  ]
});
