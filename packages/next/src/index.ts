import type { NextConfig } from "next";
import { existsSync } from "node:fs";
import path from "node:path";

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
  if (!config.module.rules.some(isCollieRule)) {
    config.module.rules.push(createCollieRule());
  }
}

function createCollieRule(): Record<string, unknown> {
  return {
    test: /\.collie$/,
    use: [
      {
        loader: require.resolve("@collie-lang/webpack")
      }
    ]
  };
}

function isCollieRule(rule: any): boolean {
  if (!rule || typeof rule !== "object") {
    return false;
  }
  const test = rule.test;
  const matchesTest =
    test instanceof RegExp ? test.toString() === "/\\.collie$/" : typeof test === "string" && test.includes(".collie");
  if (!matchesTest) {
    return false;
  }
  const uses = Array.isArray(rule.use)
    ? rule.use
    : rule.loader
      ? [rule.loader]
      : rule.use && typeof rule.use === "object"
        ? [rule.use]
        : [];
  return uses.some((entry: any) => {
    if (typeof entry === "string") {
      return entry.includes("@collie-lang/webpack");
    }
    if (entry && typeof entry === "object" && typeof entry.loader === "string") {
      return entry.loader.includes("@collie-lang/webpack");
    }
    return false;
  });
}

interface RouterDetection {
  baseDir: string;
  routerType: "app" | "pages";
  detected: boolean;
}

function detectRouterRoot(projectRoot: string): RouterDetection {
  const candidates: Array<{ baseDir: string; routerType: RouterDetection["routerType"] }> = [
    { baseDir: "app", routerType: "app" },
    { baseDir: path.join("src", "app"), routerType: "app" },
    { baseDir: "pages", routerType: "pages" },
    { baseDir: path.join("src", "pages"), routerType: "pages" }
  ];

  for (const candidate of candidates) {
    if (existsSync(path.join(projectRoot, candidate.baseDir))) {
      return { ...candidate, detected: true };
    }
  }

  return { baseDir: "app", routerType: "app", detected: false };
}

function shouldLogRouterInfo(): boolean {
  const flag = process.env.COLLIE_DEBUG ?? "";
  return flag.toLowerCase().includes("router");
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

      if (webpackOptions?.dir) {
        const routerInfo = detectRouterRoot(webpackOptions.dir);
        if (routerInfo.detected) {
          if (shouldLogRouterInfo()) {
            console.log(
              `[collie] Next.js router detected: ${routerInfo.routerType} (${routerInfo.baseDir.replace(/\\/g, "/")})`
            );
          }
        } else {
          console.warn(
            "[collie] Could not find app/, src/app/, pages/, or src/pages/ in this Next.js project. Defaulting to app/."
          );
        }
      }

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
