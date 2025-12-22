---
"@collie-lang/webpack": major
"@collie-lang/next": major
"@collie-lang/cli": minor
---

Add Next.js support to Collie

This release introduces:

- `@collie-lang/webpack` – framework-agnostic webpack loader for `.collie` files
- `@collie-lang/next` – Next.js plugin that wires the loader into webpack automatically
- CLI improvements so `collie init` can scaffold Next.js projects via `--nextjs`

Documentation now covers supported frameworks, a migration guide, and a full Next.js example project. Integration and unit tests cover the new loader/plugin behavior.
