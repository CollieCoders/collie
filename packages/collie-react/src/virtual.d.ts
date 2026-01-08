declare module "virtual:collie/registry" {
  export const registry: Record<string, () => Promise<{ render: (__inputs: any) => any }>>;
}

declare module "virtual:collie/ids" {
  export const ids: readonly string[];
}
