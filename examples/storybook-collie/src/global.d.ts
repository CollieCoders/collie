import type { ComponentType } from "react";

declare module "*.collie" {
  const component: ComponentType<Record<string, unknown>>;
  export default component;
}
