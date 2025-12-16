declare module "*.collie" {
  import type { ComponentType } from "react";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Comp: ComponentType<any>;
  export default Comp;
}