# Compiler Update Plan — Props Aliases + Props Block Diagnostics + Directive Parentheses

## Context & Problem

Collie templates compile to clean TSX via the compiler. We want to improve ergonomics and maintainability:

1. **Directive syntax normalization**

* Enforce `@if (condition)` syntax (same for `@elseIf`, `@for`), making templates consistent and easier to parse/convert.

2. **`#props` as ergonomic sugar (no types yet)**

* `#props` is a developer-friendly declaration list.
* Each entry is either:

  * `count` (value-like prop)
  * `setCount()` (callable prop; `()` is display/tokenization cue only)
* If a prop is declared in `#props`, template expressions may use it as a **bare identifier**:

  * `count` → compiled as `props.count`
  * `setCount(1)` → compiled as `props.setCount(1)`

3. **`#props` diagnostics that are informational but useful**
   When a `#props` block is present:

* Warn if a bare identifier is used (e.g. `{subtitle}`) but not declared in `#props`.
* Warn if a prop is declared in `#props` but not used anywhere.
* Warn if a prop is declared in `#props` but used as `props.subtitle` (unnecessary `props.`; prefer `{subtitle}`).

Important: we **ignore** the edge case “`props.subtitle` used but not declared” (no warning), because `props.` is always allowed.

This must compile to “beautiful TSX” and remain friendly to a future sprint where we implement Collie → TSX conversion.

---

## Do NOT write tests

* Do NOT add or modify tests.
* Do NOT add test deps.
* Do NOT change CI.

---

## Scope

Allowed changes only within:

* `packages/compiler/**`

Do NOT modify:

* `packages/vite/**`
* `packages/react/**`
* `packages/cli/**`
* VS Code extension packages

---

## Global Acceptance Criteria

* Directive parentheses are enforced:

  * `@if foo` errors; `@if (foo)` works.
  * same for `@elseIf (foo)`
  * `@for (...)` required.
* `#props` supports only `name` and `name()` lines (NO type hints).
* If `#props` exists and declares `subtitle`, then `{subtitle}` compiles to `props.subtitle`.
* If `#props` exists and does NOT declare `subtitle`, then `{subtitle}` produces a warning guiding the dev to declare it or use `props.subtitle`.
* If `#props` declares `subtitle` but template never uses it, warn.
* If `#props` declares `subtitle` but template uses `{props.subtitle}`, warn that `props.` is unnecessary.
* No build-breaking TS errors introduced (strict mode clean).

---

# Stage 1 — Enforce Parentheses for Directives

### Complete: 0%

### Goal

Enforce `@if (cond)`, `@elseIf (cond)`, `@for (...)` syntax with clear diagnostics.

### Files

* `packages/compiler/src/parser.ts`
* `packages/compiler/src/diagnostics.ts` (if centralized codes/messages exist)

### Implementation Requirements

1. Update directive parsing:

* `@if` must parse only if followed by `(` … `)`
* `@elseIf` same
* `@for` must parse only if followed by `(` … `)`
* `@else` must not accept a condition; error if parentheses present.

2. Add/adjust diagnostics:

* Missing parentheses: error message like:

  * `@if requires parentheses: @if (condition)`
* Unclosed parentheses: error:

  * `Unclosed parentheses in @if ( ... )`
* For `@else`: error:

  * `@else does not accept a condition`

### Acceptance Criteria

* Old syntax errors with a helpful message and span on the directive line.
* New syntax works unchanged.

---

# Stage 2 — Parse `#props` Block to Structured Decls (name vs name())

### Complete: 0%

### Goal

Represent `#props` as a list of declarations with a “callable” marker.

### Files

* `packages/compiler/src/parser.ts`
* `packages/compiler/src/ast.ts` (or wherever template node types are defined)

### AST Additions (recommended)

```ts
export type PropDeclKind = "value" | "callable";

export interface PropDecl {
  name: string;
  kind: PropDeclKind;  // "callable" when declared as name()
  span?: SourceSpan;   // span for the decl (at least name)
}

export interface TemplateNode {
  // ...
  propsDecls?: PropDecl[];
}
```

### Parsing Rules

Each indented line under `#props` must be either:

* `name`
* `name()`

Validation:

* `name` must be a valid JS identifier: `/^[A-Za-z_$][A-Za-z0-9_$]*$/`
* callable form must be exactly trailing `()`, no args, no spaces inside parens

No types allowed:

* if a line contains `:` or `<` or `?` (or other type-ish syntax), emit an error:

  * `Types are not supported in #props yet. Use "name" or "name()".`

Duplicates:

* If the same `name` appears multiple times (including `name` + `name()`), warn and keep the first.

### Acceptance Criteria

* Templates with `#props` produce `template.propsDecls`.
* Each decl records `name` and `kind`.

---

# Stage 3 — Add a Template Environment (prop aliases + locals)

### Complete: 0%

### Goal

Centralize scope tracking so rewriting and diagnostics behave consistently.

### Files

* `packages/compiler/src/codegen.ts`
* add `packages/compiler/src/rewrite.ts` (recommended helper module)

### Requirements

Create:

```ts
export interface TemplateEnv {
  propAliases: Map<string, PropDeclKind>; // from #props
  localsStack: Array<Set<string>>;        // for @for vars, etc.
}
```

Rules:

* Prop aliases are available everywhere
* Locals shadow prop aliases
* The identifier `props` is always valid and never rewritten

Add helpers:

* `pushLocals(env, names)`
* `popLocals(env)`
* `isLocal(env, name)`
* `isPropAlias(env, name)`

### Acceptance Criteria

* `@for` introduces loop variable(s) into locals stack for the scope of its body.

---

# Stage 4 — Implement Expression Rewriting for Declared Props

### Complete: 0%

### Goal

Rewrite bare identifiers declared in `#props` into `props.<name>` at codegen time.

### Files

* `packages/compiler/src/codegen.ts`
* `packages/compiler/src/rewrite.ts` (new)
* any existing expression scanning util you already use (optional reuse)

### Requirements

## 4.1 `rewriteExpression(expr, env)` function

Implement:

```ts
export function rewriteExpression(expr: string, env: TemplateEnv): {
  code: string;                      // rewritten expression
  usedBare: Set<string>;             // bare identifiers encountered
  usedPropsDot: Set<string>;         // props.<name> occurrences encountered
  callSitesBare: Set<string>;        // bare identifiers used as calls: name(...)
  callSitesPropsDot: Set<string>;    // props.name(...) occurrences
};
```

Why return metadata? So Stage 5 diagnostics can reuse the same scan instead of re-scanning.

## 4.2 Rewriting rules (MVP-safe)

Rewrite token occurrence of identifier `name` → `props.name` iff:

* `name` is declared in `env.propAliases`
* `name` is not shadowed by locals (`isLocal(env, name) === false`)
* token is not preceded by `.` or `?.`
* token is not `props`
* best-effort skip object literal keys (`{ title: ... }`) using a heuristic:

  * if next non-whitespace char is `:` and previous significant char is `{` or `,`, treat as key → do not rewrite

## 4.3 Apply rewrite everywhere expressions are emitted

* Interpolations `{expr}`
* Directive conditions inside parentheses: `@if (expr)`
* `@for (item of expr)` (rewrite the iterable expr part; don’t rewrite the loop var binding)
* Attribute expressions: `class={expr}`, `onClick={expr}`

Attribute values often include braces in the raw string. Ensure you strip outer `{}` for rewriting/token scanning and re-wrap on emit (or make rewrite brace-aware).

### Acceptance Criteria

* With `#props subtitle`, `{subtitle}` compiles to `props.subtitle`
* With `#props setCount()`, `{setCount(1)}` compiles to `props.setCount(1)`
* Local loop vars shadow aliases.
* `props.subtitle` remains unchanged.

---

# Stage 5 — Implement `#props` Diagnostics (Missing/Unused/Unnecessary props.)

### Complete: 0%

### Goal

When `#props` exists, keep it trustworthy and helpful.

### Files

* `packages/compiler/src/props.ts` (or create `propsDiagnostics.ts`)
* `packages/compiler/src/diagnostics.ts`
* reuse `rewriteExpression` metadata from Stage 4

### Diagnostics (only when `#props` exists)

#### D1 — Bare identifier used but not declared

If `rewriteExpression()` reports `usedBare` containing identifiers not:

* in locals
* in propAliases
* and not JS keywords (maintain a small keyword set)

Emit **warning**:

> `Identifier "subtitle" is used without "props." but is not declared in #props. Declare "subtitle" in #props or use "props.subtitle".`

This should trigger for:

* `{subtitle}`
* `@if (subtitle)`
* `class={subtitle ? ... : ...}`

#### D2 — Declared but unused

For each prop declared in `#props`, if it is never used either as:

* bare (`subtitle`)
* or explicit `props.subtitle`

Emit **warning**:

> `Prop "subtitle" is declared in #props but never used in this template.`

#### D3 — Declared but used as `props.subtitle` (unnecessary)

If a prop is declared in `#props` but `rewriteExpression()` reports it was used via `props.<name>` anywhere (e.g. `usedPropsDot` includes `subtitle`), emit **warning**:

> `"props.subtitle" is unnecessary because "subtitle" is declared in #props. Use "{subtitle}" instead.`

Notes:

* If `props.subtitle` appears multiple times, avoid spamming:

  * emit once per prop per template (not per occurrence)

#### D4 — Callable cue mismatch (optional but nice)

Since `()` is display-only, keep as warning:

* If prop declared callable (`setCount()`) but used as value (bare `setCount` not followed by `(`) anywhere, warn:

  * `"setCount" is declared as callable in #props (setCount()) but used as a value.`
* If declared value (`count`) but used as call `count(...)`, warn.

### Acceptance Criteria

* All warnings appear only when `#props` exists.
* No warnings for `props.something` that is NOT declared (edge case ignored).
* No build-breaking errors unless your existing pipeline escalates warnings.

---

# Stage 6 — Conversion Friendliness (Next Sprint Prep)

### Complete: 0%

### Goal

Ensure this sugar compiles to deterministic TSX and is easy to reverse/convert later.

### Files

* `packages/compiler/src/rewrite.ts`
* `packages/compiler/src/codegen.ts`

### Requirements

* Do **not** mutate the AST with rewritten text.
* The final emitted TSX should always prefer explicit `props.<name>` (because rewrite does that), which makes conversion deterministic.
* Keep `rewriteExpression` pure and reusable.

### Acceptance Criteria

* With `#props`, templates are still emitted as clean TSX with explicit `props.<name>` in output.
* No hidden state.

---

## Recommended Stage Order

1. Stage 1 — directive parentheses
2. Stage 2 — props decl parse
3. Stage 3 — env/scope
4. Stage 4 — rewrite engine
5. Stage 5 — diagnostics
6. Stage 6 — conversion prep

---

## Implementation Notes (Codex must follow)

* `#props` accepts only `name` / `name()`. No types yet.
* `()` is display/tokenization cue only.
* Only declared names become aliases.
* `props.` is always valid; do not warn unless it’s used for a prop declared in `#props` (unnecessary `props.`).
* Warn once per prop per template (avoid spam).
* Locals shadow prop aliases.