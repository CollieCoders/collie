declare module "*.collie" {
  import type { ComponentType } from "react";
  const component: ComponentType<Record<string, unknown>>;
  export default component;
}
