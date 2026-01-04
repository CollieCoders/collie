Got it. Below are **collie-repo-first investigation prompts** (and one “implementation prompt”) that focus only on what *could* be coming from the core `collie` packages: the **ID character rules**, **directive syntax support for `#props`**, and any shared **diagnostic messages** or parsing behavior that the VS Code extension may be mirroring.

Even if the extension is ultimately at fault, doing this pass first will let Codex say, with evidence, “this is not in collie core” (which is still valuable, and it keeps scope tight).

Each prompt is designed to make Codex **investigate and explain**, not implement yet—except the last one, which is the “do the fix” prompt you can use once the root cause is confirmed.

---

## Prompt C1 — Investigate template ID rules and the `~2` suffix incompatibility (collie core)

### Context & Problem

In the Collie VS Code workflow, repeated conversions are generating ids like `App.App~2` and `App.App~3`.

But Collie reports:
> "Template id must start with a letter and contain only letters, numbers, ".", "_", or "-"."

So `~` is not allowed. I need to confirm where this rule is defined in the **collie repo** (compiler), and whether the rule is intended, and if so, what suffix scheme should be used instead.

### What I want

Investigate ONLY and respond with:
1) Where in the collie repo the template id validation rule lives (file + function)
2) Whether this rule applies to `#id` directive only or other identifiers too
3) Whether allowing `~` is a good idea or a bad idea (include tradeoffs)
4) If we should NOT allow `~`, recommend the best suffix scheme that is valid and stable (e.g. `.2`, `-2`, `_2`) and why

### Constraints / Guardrails

- Do NOT write tests.
- Do NOT run any test/dev/start scripts.
- Do NOT implement changes yet—investigation + explanation only.
- Keep scope tight: open only code involved in parsing or validating template ids and diagnostics.

### Suggested scope (allowed to open)

- `packages/compiler/src/identifier.ts` (if relevant)
- `packages/compiler/src/parser.ts`
- `packages/compiler/src/diagnostics.ts`
- `packages/compiler/src/ast.ts`
- `packages/compiler/src/id-directive*` or similar
- `packages/compiler/tests/id-directive.test.ts` (read-only for understanding intent)

### Deliverable

Reply with:
- The exact place the validation is enforced
- Whether `~` should remain invalid
- The recommended canonical suffix scheme (show examples)
- Any downstream impacts you foresee (navigation, references, etc.)

---

## Prompt C2 — Investigate whether `#props` is valid Collie syntax in the compiler (collie core)

### Context & Problem

We want Collie files to support multiple template blocks and a directive-style props section:

```collie
#id UserPanel

#props
  username: string
  onLogin: () => void

div
  ...
```

But the VS Code side is currently flagging `#props` as invalid. Before changing the extension, I want to confirm the **collie compiler** understands `#props` as a directive (or does not), and what the intended syntax is in collie core today.

### What I want

Investigate ONLY and respond with:

1. Does the collie compiler currently support a `#props` directive? If yes, where is it parsed and represented in the AST?
2. If not supported, what is the compiler’s supported props syntax today? (e.g. `props` block, `#props`, something else)
3. If there was a recent redesign around props, identify the current “source of truth” in compiler code: where directives are defined/recognized.
4. If `#props` is not supported today, confirm what changes would be required in collie core to add it (high-level), but DO NOT implement yet.

### Constraints / Guardrails

* Do NOT write tests.
* Do NOT run any test/dev/start scripts.
* Do NOT implement yet—investigation + explanation only.

### Suggested scope (allowed to open)

* `packages/compiler/src/parser.ts`
* `packages/compiler/src/ast.ts`
* `packages/compiler/src/props.ts`
* `packages/compiler/src/diagnostics.ts`
* any “directive” or “id-directive” modules
* `packages/compiler/tests/props.test.ts` (read-only for intended behavior)

### Deliverable

Reply with:

* Whether `#props` is currently valid in collie core
* The exact parser/AST/diagnostic locations involved
* What the intended props syntax is today and whether it matches our v5 design goals

---

## Prompt C3 — Investigate multi-template-per-file parsing rules in collie core (collie core)

### Context & Problem

We want one `.collie` file to contain multiple template blocks like:

```collie
#id App.App
...

#id App.App-2
...
```

This is part of v5 behavior. I need to confirm the collie compiler:

* supports multiple `#id` sections in one file
* and how it determines the “current template context” for props declarations and validations.

### What I want

Investigate ONLY and respond with:

1. Does collie core support multiple templates per file right now? If yes, where is the logic that splits/collects them?
2. How are props associated with a specific template? (per-template props vs global)
3. Where are the ordering rules (if any) enforced (e.g. “props must appear before nodes”)?
4. Identify which rules were updated for v5 and which might still be old/legacy.

### Constraints / Guardrails

* Do NOT write tests.
* Do NOT run any test/dev/start scripts.
* Do NOT implement yet—investigation + explanation only.

### Suggested scope (allowed to open)

* `packages/compiler/src/parser.ts`
* `packages/compiler/src/props.ts`
* `packages/compiler/src/diagnostics.ts`
* `packages/compiler/src/ast.ts`
* relevant tests under `packages/compiler/tests/**` (read-only)

### Deliverable

Reply with:

* Confirmation of multi-template support in the compiler
* The current association rules between `#id`, `#props`, and template nodes
* Any compiler-side rules that must change to match the v5 extension expectations

---

## Prompt C4 — (Only if needed) Implement the compiler-side fix for ID suffix scheme

Use this only after C1 confirms the rule is in compiler and we *want to keep* `~` invalid.

### Context & Problem

Collie IDs must match:
- start with a letter
- contain only letters, numbers, ".", "_", or "-"

The VS Code workflow was generating `~2` suffixes (invalid). We want a canonical suffix strategy that is valid everywhere. Proposed: use `-2`, `-3`, etc. (or `.2` if you think that’s better).

### What I want

Implement the compiler-side changes needed (if any) to:
- ensure documentation/examples/diagnostics align with the ID charset rule, AND
- (if applicable) expose or document the recommended suffix scheme (`-2`, `-3`) for generated IDs.

Important: if the compiler already enforces the rule and nothing needs changing, say so clearly and do not change code.

### Constraints / Guardrails

- Do NOT write tests.
- Do NOT run any test/dev/start scripts.
- Make minimal diffs only.

### Allowed to touch

- `packages/compiler/src/**` only if required
- `README.md` or relevant docs only if they currently contradict the rule

### Must NOT touch / ignore

- `node_modules/`
- `packages/*/dist/`
- anything unrelated to ID parsing/validation

### Acceptance Criteria

- The ID charset rule remains consistent and clearly enforced.
- If docs mention an invalid char or imply `~` is allowed, they are corrected.
- No behavioral changes beyond what’s necessary to clarify/enforce the rule.

---

## Prompt C5 — (Only if needed) Implement compiler support for `#props` directive

Use this only if C2 finds `#props` is NOT currently supported but we decide it should be in collie core (vs extension-only parser).

### Context & Problem

We want the Collie language to support a directive-style props section:

```collie
#id Example

#props
  foo: string
  onSave: () => void

div | Hello {foo}
```

Currently the compiler does not recognize `#props` (confirm from investigation).

### What I want

Implement `#props` support in the compiler with minimal changes:

* `#props` starts a props section for the current template block
* Entries under `#props` must be indented exactly one level relative to `#props`
* Props sections may appear after template nodes as long as they are within the same `#id` block (multi-template-per-file support)
* Diagnostics must reflect these rules (clear error messages)

### Constraints / Guardrails

* Do NOT write tests.
* Do NOT run any test/dev/start scripts.
* Avoid over-engineering. Keep parsing rules explicit and readable.
* Maintain backward compatibility if the old `props` keyword syntax exists (unless explicitly decided otherwise).

### Allowed to touch

* `packages/compiler/src/parser.ts`
* `packages/compiler/src/ast.ts`
* `packages/compiler/src/props.ts`
* `packages/compiler/src/diagnostics.ts`

### Must NOT touch / ignore

* `node_modules/`
* `packages/*/dist/`
* unrelated packages

### Acceptance Criteria

* `#props` is parsed as a directive, not as an element line.
* Correct indentation rules are enforced:

  * `#props` must be top-level within a template block
  * entries must be indented under it
* Prop usage in `{foo}` or attribute expressions is treated as declared if listed in `#props`.
* Multi-template files can contain multiple `#id` + `#props` sections without cross-contamination.