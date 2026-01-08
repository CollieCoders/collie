export interface CollieTemplateModule {
  render: (__inputs: any) => any;
}

export type CollieRegistry = Record<string, () => Promise<CollieTemplateModule>>;
