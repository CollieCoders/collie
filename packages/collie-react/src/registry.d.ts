export interface CollieTemplateModule {
  render: (props: any) => any;
}

export type CollieRegistry = Record<string, () => Promise<CollieTemplateModule>>;

declare module "virtual:collie/registry" {
  export const registry: CollieRegistry;
}

declare module "virtual:collie/ids" {
  export const ids: readonly string[];
}
