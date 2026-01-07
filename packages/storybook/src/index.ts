import { createRequire } from "node:module";
import type { StorybookConfig } from "@storybook/types";
import type { Configuration as WebpackConfig } from "webpack";
import type { InlineConfig, PluginOption } from "vite";
import collie from "@collie-lang/vite";

const require = createRequire(import.meta.url);

export type AnyStorybookConfig = StorybookConfig & {
  webpackFinal?: (config: WebpackConfig, options: unknown) => WebpackConfig | Promise<WebpackConfig>;
  viteFinal?: (config: InlineConfig, options: unknown) => InlineConfig | Promise<InlineConfig>;
};

export function withCollieStorybook<T extends AnyStorybookConfig>(config: T): T {
  const prevWebpack = config.webpackFinal;
  const prevVite = config.viteFinal;

  return {
    ...config,
    webpackFinal: async (base, options) => {
      const resolved = (await prevWebpack?.(base, options)) ?? base;
      return applyCollieToWebpackConfig(resolved);
    },
    viteFinal: async (base, options) => {
      const resolved = (await prevVite?.(base, options)) ?? base;
      return applyCollieToViteConfig(resolved);
    }
  } as T;
}

export function applyCollieToWebpackConfig(config: WebpackConfig): WebpackConfig {
  ensureResolveExtensions(config);
  ensureCollieLoader(config);
  return config;
}

export function applyCollieToViteConfig(config: InlineConfig): InlineConfig {
  const updated: InlineConfig = { ...config };
  const resolve = { ...(config.resolve ?? {}) };
  const extensions = new Set(resolve.extensions ?? []);
  extensions.add(".collie");
  resolve.extensions = Array.from(extensions);
  updated.resolve = resolve;

  const plugins: PluginOption[] = [];
  const existing = config.plugins;
  if (Array.isArray(existing)) {
    plugins.push(...existing);
  } else if (existing) {
    plugins.push(existing);
  }

  if (!plugins.some(isColliePlugin)) {
    plugins.push(collie());
  }

  updated.plugins = plugins;
  return updated;
}

function ensureResolveExtensions(config: WebpackConfig): void {
  config.resolve = config.resolve ?? {};
  const extensions = config.resolve.extensions ?? [];
  if (!extensions.includes(".collie")) {
    extensions.push(".collie");
  }
  config.resolve.extensions = extensions;
}

function ensureCollieLoader(config: WebpackConfig): void {
  config.module = config.module ?? {};
  config.module.rules = config.module.rules ?? [];
  const hasRule = config.module.rules.some((rule) => {
    if (typeof rule !== "object" || !rule) return false;
    if (!("test" in rule)) return false;
    const test = rule.test;
    if (test instanceof RegExp) {
      if (test.toString() !== "/\\.collie$/") return false;
    } else {
      return false;
    }
    const useEntries = Array.isArray(rule.use) ? rule.use : rule.use ? [rule.use] : [];
    return useEntries.some((entry) => {
      if (typeof entry === "string") return entry.includes("@collie-lang/webpack");
      if (typeof entry === "object" && entry && "loader" in entry && typeof entry.loader === "string") {
        return entry.loader.includes("@collie-lang/webpack");
      }
      return false;
    });
  });

  if (!hasRule) {
    config.module.rules.push({
      test: /\.collie$/,
      use: [
        {
          loader: require.resolve("@collie-lang/webpack")
        }
      ]
    });
  }
}

function isColliePlugin(plugin: PluginOption): boolean {
  if (!plugin || typeof plugin !== "object") {
    return false;
  }
  return "name" in plugin && (plugin as { name?: string }).name === "collie";
}
