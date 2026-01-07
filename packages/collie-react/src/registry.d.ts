export interface CollieTemplateModule {
  render: (props: any) => any;
}

export type CollieRegistry = Record<string, () => Promise<CollieTemplateModule>>;
