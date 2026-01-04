# Collie v5 — Compiler & Core Language Plan

> Scope: **`collie` monorepo only**
> Focus: **Language semantics, parsing, diagnostics, and codegen**
> Explicitly excludes: VS Code extension behavior, TSX selection logic, UI prompts

---

## Stage 1 — Introduce `#props` as a First-Class Directive

### Context

Collie currently treats `props` as a pseudo-keyword with ordering and indentation constraints that break down in multi-template files and iterative authoring workflows.

We are formalizing **`#props` as an explicit directive**, similar to `#id`, to:

* Eliminate ambiguity
* Remove ordering fragility
* Make multi-template files reliable
* Simplify diagnostics and parsing rules

---

### Allowed to touch

- `packages/compiler/src/parser.ts`
- `packages/compiler/src/ast.ts`
- `packages/compiler/src/diagnostics.ts`
- `packages/compiler/src/props.ts`
- `packages/compiler/tests/props.test.ts`
- `packages/compiler/tests/directives.test.ts`

### Must NOT touch (do not open, do not scan)

- `packages/cli/**`
- `packages/collie-react/**`
- `packages/html-runtime/**`
- `packages/vite/**`
- `packages/webpack/**`
- `packages/storybook/**`
- `packages/expo/**`
- `packages/next/**`
- `packages/compiler/src/convert.ts`
- `packages/compiler/src/codegen.ts`   (unless strictly necessary)

---

### Requirements

#### New syntax (valid)

```collie
#props
  foo: string
  bar: number
```

#### Old syntax (now invalid)

```collie
props
  foo: string
```

---

### Behavioral changes

* `#props`:

  * Must appear **at indentation level 0**
  * Is scoped to the **current `#id` block**
  * May appear **anywhere within the `#id` block**
* `props` (without `#`) is no longer special
* Multiple `#props` blocks under the same `#id`:

  * ❌ should be a **hard error**
* `#props` outside of a `#id` block:

  * ❌ should be a **hard error**

---

### Acceptance criteria

✅ The compiler **accepts**:

```collie
#id Example

div
  span | Hello

#props
  message: string
```

✅ The compiler **rejects**:

```collie
props
  message: string
```

❌ Error message must explicitly say:

> "`props` must be declared using `#props`"

❌ Compiler must **NO LONGER**:

* Require props to appear before template nodes
* Produce indentation-jump errors for valid prop declarations

---

## Stage 2 — Allow Multiple Independent Templates per File (Parser Normalization)

### Context

The language already *supports* multiple `#id` blocks, but several parser assumptions still leak “single template per file” thinking:

* Implicit state reuse
* Ordering assumptions
* Diagnostics that accidentally span template boundaries

This stage makes **template isolation explicit and guaranteed**.

---

### Allowed to touch

- `packages/compiler/src/parser.ts`
- `packages/compiler/src/ast.ts`
- `packages/compiler/src/diagnostics.ts`
- `packages/compiler/tests/id-directive.test.ts`
- `packages/compiler/tests/props.test.ts`

### Must NOT touch

- `packages/compiler/src/codegen.ts`
- `packages/compiler/src/html-codegen.ts`
- `packages/compiler/src/format.ts`
- `packages/compiler/src/fixes.ts`

---

### Requirements

* Each `#id` block produces:

  * Its own AST root
  * Its own props table
  * Its own diagnostics scope
* No state (props, flags, indentation context, warnings) may leak between `#id` blocks

---

### Acceptance criteria

Given:

```collie
#id A
#props
  foo: string

div | {foo}

#id B
div | Hello
```

✅ `foo` is:

* Valid inside `A`
* ❌ Invalid inside `B`

❌ Compiler must **NO LONGER**:

* Report “prop used but not declared” across templates
* Share `#props` implicitly between templates

---

## Stage 3 — Formalize `@if / @elseIf / @else` as Structural Directives

### Context

Collie’s primary advantage over JSX is **semantic readability**.
JSX conditionals are mechanically expressive but visually noisy.

This stage introduces **first-class conditional directives** that:

* Are indentation-based
* Are structural (not expression hacks)
* Can fully replace JSX ternaries and `&&` patterns

---

### Allowed to touch

- `packages/compiler/src/parser.ts`
- `packages/compiler/src/ast.ts`
- `packages/compiler/src/diagnostics.ts`
- `packages/compiler/src/codegen.ts`
- `packages/compiler/tests/directives.test.ts`

### Must NOT touch

- `packages/compiler/src/convert.ts`
- `packages/compiler/src/html-codegen.ts`
- `packages/compiler/src/format.ts`

---

### New syntax

```collie
@if loggedIn
  div | Welcome
@elseIf loading
  div | Loading...
@else
  div | Please log in
```

---

### Rules (non-negotiable)

1. `@if`, `@elseIf`, `@else` must be **siblings**
2. `@elseIf` / `@else` without a preceding `@if` → ❌ error
3. Conditions must be **pure expressions**
4. Conditionals may be nested
5. Conditionals may appear:

   * At root
   * Inside elements
   * Inside other conditionals

---

### Acceptance criteria

✅ Compiler accepts:

```collie
div
  @if show
    span | Visible
  @else
    span | Hidden
```

❌ Compiler rejects:

```collie
@else
  div | Invalid
```

❌ Compiler rejects:

```collie
@if a
  div
    @else
      span
```

(with an explicit sibling-structure error)

---

## Stage 4 — Props Validation with `#props` and Conditionals

### Context

Now that:

* Props are explicit (`#props`)
* Templates are isolated
* Conditionals exist

The compiler must correctly validate **prop usage across all branches**.

---

### Allowed to touch

- `packages/compiler/src/props.ts`
- `packages/compiler/src/diagnostics.ts`
- `packages/compiler/tests/props.test.ts`

### Must NOT touch

- `packages/compiler/src/parser.ts`
- `packages/compiler/src/codegen.ts`

---

### Requirements

* Any identifier referenced in:

  * `{expressions}`
  * `@if conditions`
  * attribute bindings
* Must exist in:

  * `#props`, OR
  * local directive scope (future work)

---

### Acceptance criteria

Given:

```collie
#id UserPanel

#props
  loggedIn: boolean

@if loggedIn
  div | Hi
```

✅ No warnings

Given:

```collie
@if loggedIn
  div | Hi
```

❌ Error:

> Prop `loggedIn` is used but not declared in `#props`

❌ Compiler must **NO LONGER** require `props.foo` syntax when `#props` exists

---

## Stage 5 — Codegen Parity & Snapshot Validation

### Context

All new syntax must produce **identical runtime output** to equivalent JSX.

This stage ensures no regressions and locks behavior with tests.

---

### Allowed to touch

- `packages/compiler/src/codegen.ts`
- `packages/compiler/tests/html-codegen.test.ts`
- `packages/compiler/tests/directives.test.ts`

### Must NOT touch

- `packages/compiler/src/parser.ts`
- `packages/compiler/src/props.ts`

---

### Acceptance criteria

Given:

```collie
@if loggedIn
  div | Hi
@else
  div | Bye
```

Generated output must be **functionally equivalent** to:

```tsx
{loggedIn ? <div>Hi</div> : <div>Bye</div>}
```

❌ No additional wrapper nodes
❌ No runtime branching outside expected scope
❌ No duplicated evaluation

---

## Final Guarantees After v5 (Collie Repo)

After completing all stages:

* ✅ `#props` is explicit, scoped, and reliable
* ✅ Multiple templates per file are first-class
* ✅ Conditional rendering is semantic and readable
* ✅ Compiler diagnostics are localized and predictable
* ❌ Legacy `props` syntax is fully retired
* ❌ JSX-style conditionals are no longer necessary in Collie