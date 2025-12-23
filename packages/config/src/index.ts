import type { CollieConfig } from "./types";

export * from "./types";

export function defineConfig(config: CollieConfig): CollieConfig {
  return config;
}
