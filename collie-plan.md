# Collie Implementation Plan

## Collie Repo Stages (`collie`)

### Stage C1 — Prop usage rules in compiler: `props.foo` always allowed; bare `foo` requires props declaration

**Problem**

* In templates, dynamic expressions like `{viteLogo}` should only be allowed when the prop is declared in a `props` block.
* Expressions like `{props.viteLogo}` should be allowed even **without** a `props` block (explicit namespace).
* Right now, the compiler is treating `props.viteLogo` as if it were a bare prop usage and wrongly complaining “used but not declared.”

**What to do**

* Update the compiler’s prop validation to distinguish:

  * **bare identifier usage**: `viteLogo`
  * **namespaced usage**: `props.viteLogo`
* Only enforce “must be declared in props block” for **bare identifier usage**.
* Treat `props.<name>` as valid always (no error). (If you want later: optional stylistic warning, but **no** error.)

**Where**

* `packages/compiler/src/props.ts` (or wherever prop validation and declaration checks live)

**Expected behavior**

* Template with **no** `props` block:

  * `img(src={viteLogo})` → **diagnostic/error** (missing declaration / suggest props block or use `props.viteLogo`)
  * `img(src={props.viteLogo})` → **no diagnostic**
* Template with `props` block declaring `viteLogo`:

  * `img(src={viteLogo})` → **no diagnostic**
  * `img(src={props.viteLogo})` → **no diagnostic**

---

### Stage C2 — Compiler indentation correctness: nested children must be allowed (`a` → `img`)

**Problem**

* Correct nested indentation is being rejected in at least one environment (either compiler or extension). In core compiler, we must ensure this is valid:

  ```collie
  div
    a(...)
      img(...)
  ```
* If the compiler currently rejects this with an “indent jumped more than one level” type error, indentation stack/baseline logic is wrong.

**What to do**

* Ensure compiler indentation tracking uses a proper parent stack:

  * Child indentation of an element should be allowed at **exactly one level deeper than that element’s indent**.
  * True multi-level jumps (skipping intermediate levels) should error.
* Ensure nested structures compile and produce correct AST.

**Where**

* `packages/compiler/src/parser.ts` (indentation stack logic / child parsing)

**Expected behavior**

* This must compile:

  ```collie
  div
    a(href="https://vite.dev")
      img.logo(src={props.viteLogo})
  ```
* Multi-level jumps like `div` → `img` with no intermediate block should error **only** when truly skipping levels (e.g. indent increases by >1 relative to the active parent baseline).

---

### Stage C3 — Compiler support for “indented attribute lines”

**Problem**

* You want to allow this style (at least temporarily):

  ```collie
  a
    href="..." target="_blank" alt="..."
  ```
* This is not the same as children indentation; it’s “attribute-only” lines that should attach to the parent element.

**What to do**

* When parsing an element and reading the next indented line(s):

  * If a line is **attribute-like** (contains `name=value` tokens), treat it as attributes for the parent.
  * Stop consuming “attribute lines” at the first non-attribute child node.
* Enforce the **hard pipe** rule in compiler: no `p Hello` shorthand; inline text requires `|`.

**Where**

* `packages/compiler/src/parser.ts` (element parsing + child/attribute-line discrimination)

**Expected behavior**

* This compiles (if Stage C3 enabled):

  ```collie
  a
    href="https://vite.dev" target="_blank"
      img.logo(src={props.viteLogo})
  ```
* This is **still invalid** (hard pipe):

  ```collie
  p Hello
  ```

  Must be:

  ```collie
  p | Hello
  ```