## Context & Problem
This repo contains Collie, a template language that compiles `.collie` files into TSX and is rendered via a React runtime component.

The current implementation uses a `#props` directive and rewrites identifiers into `props.*` / allows `props.foo` access in expressions. This model is broken and has caused invalid JS output such as arrow function parameters being rewritten into illegal binding patterns (e.g. `(props.count) => ...`).

We are making a **clean break**:
- `#props` is removed entirely.
- `#inputs` is the ONLY supported directive for external values.
- Inputs are referenced ONLY as bare identifiers (e.g. `count`, `setCount`).
- `props.foo` / `inputs.foo` syntax is NOT supported and should not exist anywhere.
- Generated TSX must look like idiomatic React code and must reliably run in the browser.

There are **no users yet**, so do NOT preserve or support `#props` in any way.

## Allowed files/directories (HARD CONSTRAINT)
You may ONLY read/modify files under:
- `/README.md`
- `/docs/**` (only if needed for small doc updates)
- `/packages/cli/**`
- `/packages/collie-react/**`
- `/packages/compiler/**`
- `/packages/config/**` (only if types require)
- `/packages/vite/**`

Do NOT look elsewhere.

## Do NOT write tests
Do not add new tests or compatibility shims. Remove obsolete logic instead of layering on top of it.

---

# Phase 0 — Targeted Discovery (MANDATORY)
Before making changes, locate where the following currently exist. Use ripgrep searches and follow call chains. Then print a **Discovery Summary** listing file paths and what each location does.

Search targets:
- Parsing / handling of the `#props` directive (likely `packages/compiler/src/props.ts`, `parser.ts`)
- Identifier rewriting or prefixing logic (`props.*`) (likely `packages/compiler/src/rewrite.ts`, `identifier.ts`)
- TSX / JSX generation (likely `packages/compiler/src/codegen.ts`, `html-codegen.ts`)
- TSX → Collie conversion that emits `#props` or `setCount()` (likely `packages/cli/src/converter.ts`)
- Runtime `<Collie>` React component (likely `packages/collie-react/src/index.tsx`)
- Vite integration glue (likely `packages/vite/src/index.ts`)

Do NOT refactor until this summary is complete.

---

# Phase 1 — Remove `props` entirely, implement `#inputs`

## 1) Directive model
- Remove `#props` completely.
- Implement `#inputs` as the ONLY directive for external values.
- Delete or rename any files/modules whose sole purpose is `props` handling (e.g. `props.ts`) if appropriate.
- Update all internal naming to use `inputs`.

## 2) Inputs usage rules
- Inputs declared in `#inputs` are available as **bare identifiers** in expressions.
- `props.foo` and `inputs.foo` are NOT valid syntax and should not be parsed or rewritten.
- Do NOT add diagnostics for legacy usage — this is a clean break.

## 3) Remove identifier-to-member rewriting
- Completely remove any logic that rewrites identifiers like `count` into `props.count` or `inputs.count`.
- Do NOT replace it with regex or heuristic rewriting.
- Let JavaScript scoping rules apply naturally.

## 4) Emit binding prelude in generated TSX
- Wherever the compiled output receives an inputs object, rename the parameter to `__inputs`.
- At the top of the generated render/component function, emit:
  ```ts
  const { <names from #inputs> } = __inputs;
  ```

* Generated JSX must use **bare identifiers only**.
* This must correctly handle cases like:

  ```ts
  setCount((count) => count + 1)
  ```

  without producing invalid binding patterns.

## 5) Require `#inputs` only when inputs are used

* If a template references identifiers that are not local bindings, imports, or globals, they must be declared in `#inputs`.
* If no inputs are referenced, `#inputs` is optional.
* Keep this logic simple; do not introduce extra diagnostics beyond correctness.

---

# Phase 2 — Runtime `<Collie>` API normalization

In `packages/collie-react/src/index.tsx`:

* Support BOTH call styles:

  ```tsx
  <Collie id="X" inputs={{ dog, cat }} />
  <Collie id="X" dog={dog} cat={cat} />
  ```
* Normalize internally:

  * If `inputs` prop exists, use it.
  * Otherwise, use remaining props (excluding reserved keys like `id`, `inputs`, `children`) as inputs.
* Pass the resolved inputs object to the compiled template render function.

Do not support or reference `props` anywhere in runtime code.

---

# Phase 3 — TSX → Collie converter update

* Update the converter to emit:

  * `#inputs` instead of `#props`
  * input names as identifiers (e.g. `setCount`, not `setCount()`)
* Ensure converted Collie output matches the new model exactly.

---

# Acceptance Criteria

* No code references `#props`, `props.*`, or legacy props logic anywhere.
* Generated TSX contains no compiler-introduced `props.` or `inputs.` member access.
* The original failing example no longer produces “Invalid binding pattern”.
* Both `<Collie inputs={{...}} />` and spread-prop usage work at runtime.
* Output TSX looks like what a React developer would have written.

# Output

At the end, print:

* Discovery Summary
* List of modified files
* Key behavioral changes
* Any remaining limitations (brief)