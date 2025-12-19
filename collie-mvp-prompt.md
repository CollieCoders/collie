# ✅ **Collie Core Compiler (Acceptance: `example.collie` → `example.tsx`)**

**Context & Goal**
You are working inside the **Collie core compiler** repository. Collie is a Pug-inspired template language that compiles `.collie` files into valid React TSX. We are iterating quickly on language syntax, and the compiler is not yet fully aligned with the intended surface syntax.

At the root of the repo, you will find two files created for this task:

* **`example.collie`** — a *realistic, idiomatic Collie template* demonstrating the syntax we want Collie to support.
  It uses:

  * `classes` block with alias injection via `$alias`
  * nested DOM structure
  * dynamic attributes (`className={rootClassName}`)
  * component tags (`MetricCard(...)`, `SearchInput(...)`, etc.)
  * conditionals via `@if` / `@else`
  * loops via `@for … in …`
  * JSX islands inside `= () => ( … )`
  * bare inline text
  * `{ expression }` inside text nodes
  * full indentation-based hierarchy

* **`example.tsx`** — the **TSX output** that the Collie example must compile into **exactly** (modulo whitespace formatting differences).

**We are experiencing multiple parser, AST, and codegen mismatches** between the current Collie compiler and the syntax shown in `example.collie`. Rather than debugging incremental issues one by one, this task is to **align the compiler to the actual desired language**.

---

# 🎯 **Your Task**

Modify **any code in the core Collie compiler** (`packages/compiler`, parser, AST, codegen, transforms, etc.) so that:

### **When a `.collie` file containing the contents of `example.collie` is compiled, the resulting TSX EXACTLY matches `example.tsx`.**

This *is* the acceptance criteria.

You have complete freedom to:

* Extend parsing rules
* Fix indentation/stack handling
* Modify the grammar
* Change AST node types
* Update codegen
* Add transforms
* Add helper functions
* Refactor whole modules
* Add missing features (`@for`, `@if`, `$classAlias`, bare text, implicit text nodes, `{expr}` vs `{{expr}}`, component calls, JSX passthrough, etc.)
* Adjust code to support JSX blocks inside `= () => ( … )`
* Support component invocation syntax without angle brackets
* Support direct `<JSX>` islands in arbitrary positions
* Add tests OR skip tests
* Rewrite the parser entirely if that’s the simplest path
* Add small utilities to flatten children, preserve whitespace, etc.

You **must not** modify the sample files themselves (`example.collie` or `example.tsx`). They define the contract.

---

# 🔒 **Hard Acceptance Criteria**

A valid solution satisfies all of:

1. Compiling a `.collie` file with the exact content of `example.collie` must produce formatted TSX **semantically identical** to `example.tsx`.

2. All constructs used in the Collie example must be supported in a stable, predictable way, including:

   * `@for metric in metrics`
   * `@if (condition)` / `@else`
   * Component calls via:

     ```
     ComponentName(
       prop1={...}
       prop2="..."
     )
     ```
   * DOM nodes with shorthand classes (`div.foo.bar`)
   * Class alias expansion via `$alias`
   * Dynamic attributes (`className={...}`)
   * Inline text after tag name
   * `{expr}` inside inline text
   * JSX islands under `=`
   * Multiline JSX arrays (e.g., `columns=[ {…}, {…} ]`)
   * Preserving ordering & nesting in the output
   * Correct whitespace trimming for inline text segments

3. JSX inside `= () => ( ... )` must pass through untouched and appear verbatim in output TSX.

4. No regressions: the compiler should still compile simpler `.collie` files as before, unless behavior directly conflicts with the new syntax requirements.

---

# 🧠 **Implementation Notes (Not Rules)**

These are *suggestions* you may or may not follow:

* You may need to rewrite the parser to treat component calls (`Name(...)`) as first-class nodes.
* The existing indentation logic has several known issues around meta blocks (`classes`, `props`); fix them or replace them.
* `@for` may compile into `{array.map(…)}`
* `@if/@else` may compile into `{condition ? A : B}`
* `$alias` should be expanded into space-joined class strings
* Text parsing likely needs `{expr}` scanning support
* AST→TSX codegen may need a cleaner “emit JSX” pipeline

But again — these are only hints. You drive the architecture.