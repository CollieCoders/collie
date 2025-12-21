import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const DEFAULT_TRANSFORMER_EXPORT = "@collie-lang/expo/metro-transformer";

export interface MetroConfigShape {
  transformer?: Record<string, any>;
  resolver?: Record<string, any>;
  [key: string]: any;
}

export interface WithCollieMetroOptions {
  transformerModule?: string;
}

export function withCollieMetro<T extends MetroConfigShape>(
  config: T = {} as T,
  options: WithCollieMetroOptions = {}
): T {
  const transformerModule = options.transformerModule ?? DEFAULT_TRANSFORMER_EXPORT;
  const transformerPath = require.resolve(transformerModule);

  const resolver = { ...(config.resolver ?? {}) };
  const sourceExts = new Set<string>(resolver.sourceExts ?? []);
  sourceExts.add("collie");
  resolver.sourceExts = Array.from(sourceExts);

  const transformer = {
    ...(config.transformer ?? {}),
    babelTransformerPath: transformerPath
  };

  return {
    ...config,
    resolver,
    transformer
  };
}

export { createCollieMetroTransformer } from "./metro-transformer";
