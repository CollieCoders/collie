# @collie-lang/webpack

## 1.0.1

### Patch Changes

- Updated dependencies [4111aa0]
  - @collie-lang/compiler@2.0.0

## 1.0.0

### Major Changes

- b3dd5bc: Publishing
- 6345e6d: Add Next.js support to Collie

  This release introduces:

  - `@collie-lang/webpack` – framework-agnostic webpack loader for `.collie` files
  - `@collie-lang/next` – Next.js plugin that wires the loader into webpack automatically
  - CLI improvements so `collie init` can scaffold Next.js projects via `--nextjs`

  Documentation now covers supported frameworks, a migration guide, and a full Next.js example project. Integration and unit tests cover the new loader/plugin behavior.

### Patch Changes

- Updated dependencies [b3dd5bc]
  - @collie-lang/compiler@1.0.0
