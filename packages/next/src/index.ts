import type { NextConfig } from "next";

export interface ColliePluginOptions {
  webpack?: NonNullable<NextConfig["webpack"]>;
}

function ensureResolveExtensions(config: any): void {
  config.resolve = config.resolve ?? {};
  config.resolve.extensions = config.resolve.extensions ?? [];
  if (!config.resolve.extensions.includes(".collie")) {
    config.resolve.extensions.push(".collie");
  }
}

function ensureLoader(config: any): void {
  config.module = config.module ?? {};
  config.module.rules = config.module.rules ?? [];
  config.module.rules.push({
    test: /\.collie$/,
    use: [
      {
        loader: require.resolve("@collie-lang/webpack")
      }
    ]
  });
}

/**
 * Wrap an existing Next.js config to add Collie support.
 */
export function withCollie(
  nextConfig: NextConfig = {},
  options: ColliePluginOptions = {}
): NextConfig {
  return {
    ...nextConfig,
    webpack(config, webpackOptions) {
      ensureResolveExtensions(config);
      ensureLoader(config);

      let updatedConfig = config;

      if (typeof nextConfig.webpack === "function") {
        updatedConfig = nextConfig.webpack(updatedConfig, webpackOptions);
      }

      if (typeof options.webpack === "function") {
        updatedConfig = options.webpack(updatedConfig, webpackOptions);
      }

      return updatedConfig;
    }
  };
}

export default withCollie;
