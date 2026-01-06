# @collie-lang/next

## 3.0.0

### Major Changes

- Updated vite

### Patch Changes

- Updated dependencies
  - @collie-lang/compiler@7.0.0
  - @collie-lang/webpack@6.0.0

## 2.0.1

### Patch Changes

- Version 5
- Updated dependencies
  - @collie-lang/compiler@6.0.1
  - @collie-lang/webpack@5.0.1

## 2.0.0

### Major Changes

- 7efa70c: Updated compiler and CLI

### Patch Changes

- Updated dependencies [7efa70c]
  - @collie-lang/compiler@6.0.0
  - @collie-lang/webpack@5.0.0

## 1.0.3

### Patch Changes

- b964e53: Deploying fixes
- Updated dependencies [b964e53]
  - @collie-lang/compiler@4.0.0
  - @collie-lang/webpack@4.0.0

## 1.0.2

### Patch Changes

- Updated dependencies [2c8979d]
  - @collie-lang/compiler@3.0.0
  - @collie-lang/webpack@2.0.0

## 1.0.1

### Patch Changes

- Updated dependencies [4111aa0]
  - @collie-lang/compiler@2.0.0
  - @collie-lang/webpack@1.0.1

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
- Updated dependencies [6345e6d]
  - @collie-lang/compiler@1.0.0
  - @collie-lang/webpack@1.0.0
