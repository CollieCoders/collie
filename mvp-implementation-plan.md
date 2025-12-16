# Collie MVP Implementation Plan

_Last updated: 2025-12-16_

---

## IMPORTANT INSTRUCTIONS FOR CODEX

### 1) Clarification first
If a stage (or any step within it) is ambiguous, conflicts with the current codebase, or requires a decision not specified here:
- STOP.
- Reply with a numbered list of clarifying questions.
- Do **not** implement any code until the user answers.

### 2) Append an Implementation Summary after each stage
After implementing a stage (or sub-stage), append to this file under that stage:

### Implementation Summary
- Keep it brief but concrete: what changed, where, and any important limitations.

### 3) Do NOT write tests yet
- Do NOT add tests of any kind.
- Do NOT add test dependencies.
- Do NOT add test scripts.

### 4) Do NOT manually run dev servers
- Do NOT run pnpm dev, pnpm preview, or start servers.
- You may run pnpm build, pnpm typecheck, or other non-server commands if needed to implement correctly.

### 5) Scope discipline
- Implement only the requested stage.
- Do not “improve” or refactor unrelated code.
- If you discover a missing prerequisite, ask clarifying questions or suggest the minimum change needed.

### 6) Repo conventions
- Language: TypeScript
- Package manager: pnpm
- Build tooling: tsup
- Monorepo packages:
- packages/compiler → @collie-lang/compiler
- packages/vite → @collie-lang/vite
- packages/cli → @collie-lang/cli
- Example app: `examples/vite-react-ts`

## Context: What We’re Building

Collie is an indentation-based, Pug-like template language that compiles into React JSX/TSX.

### What users will do

Write `.collie` files that describe UI with indentation.

Import them like React components:

```tsx
import UserProfileTemplate from "./UserProfile.collie";

export function UserProfilePage(props: Props) {{
  return <UserProfileTemplate {{...props}} />;
}}
```

## What Collie does

At dev/build time, Collie compiles .collie into a JS/TS module that exports a default React component.

Collie is intentionally not:
- a runtime templating framework
- a new rendering engine
- a replacement for React state/hooks

It’s a compiler + tooling integration that makes authoring templates nicer.

## Current State Summary (Already Implemented)

### Repo & packages
- pnpm workspace monorepo scaffolded (compiler/vite/cli)
- Changesets installed/initialized
- @collie-lang/vite plugin is wired into the example Vite app
- Vite dev server runs successfully with the plugin enabled

### Vite integration
- .collie files are transformed by @collie-lang/vite
- The plugin calls @collie-lang/compiler.compile()
- Vite version alignment is correct (single Vite major in workspace)

### Compiler
- compile() exists but currently emits a stub component returning null
- Diagnostics exist as a type, but only minimal implementation so far

## MVP “Done” Definition

MVP is complete when:

1. In the example app, a .collie file renders real DOM via React.

2. The language supports (minimum):
  - elements + nesting via indentation
  - .class shorthand → className
  - literal text via |
  - inline expressions via {{expr}} (compiled to JSX {expr})
  - props header block
  - @if / @else

3. Vite dev + build work without special user steps.

4. CLI has a minimal collie init that wires Collie into a Vite+React project.

## Design Constraints (MVP)

### Compilation target

Output is a module that default-exports a React component function:

```tsx
export default function SomeTemplate(props) {{
  return (...JSX...);
}}
```

Component name should be stable and derived from options.componentNameHint provided by the Vite plugin.

### Syntax (MVP subset)

Elements / components
- div → <div>
- StatItem → <StatItem>

Classes
- div.foo.bar → <div className="foo bar">

Text
- | Hello produces a literal text node Hello

Expressions
- {{props.user.name}} becomes JSX expression {props.user.name}
- Expressions are treated as raw JS (no semantic validation)

Conditionals
- @if (cond) … optional @else
- Branches may contain multiple nodes → use fragments when needed

Indentation rules (MVP)
- Spaces only; tabs are errors
- Indentation width: 2 spaces per level (enforce in MVP for simplicity)
- Empty lines ignored
- Diagnostics should include line/col when feasible

Diagnostics strategy
- compile() should not throw. It returns diagnostics.
- The Vite plugin may throw (to trigger overlay) if diagnostics include any errors.

## Remaining MVP Work Plan (Stages)

### Notes for Codex:
- Avoid over-engineering.
- Keep changes localized to the relevant package(s).
- Avoid introducing external parsing libraries in MVP unless required.
- Ask clarifying questions as you need.

## Stage 2 — Compiler: Parse & Render the Minimal Subset

End goal of Stage 2: Example app can render a trivial .collie template into DOM (elements, classes, | text).

### Stage 2.1 — Introduce internal compiler structure + AST types

Objective: Create a minimal internal structure in @collie-lang/compiler so the compiler isn’t one big function.

Target files (create/move as needed):
- `packages/compiler/src/ast.ts`
- `packages/compiler/src/parser.ts`
- `packages/compiler/src/codegen.ts`
- `packages/compiler/src/diagnostics.ts`
- `packages/compiler/src/index.ts` (public API façade)

AST (MVP):
- RootNode with children: Node[]
- ElementNode with:
  * name: string
  * classes: string[]
  * children: Node[]
- TextNode with value: string

#### User Pre-Flight Checklist (User ONLY):

1. Run: pnpm -r build

2. Ensure example Vite app currently starts (user runs it manually)

#### User Acceptance Checklist:

1. Run: pnpm -r build

2. No user-visible behavior change expected yet (still OK if output is stubby)

### Implementation Summary
- Added dedicated AST, diagnostics, parser, and codegen modules plus updated `packages/compiler/src/index.ts` so the compiler now routes work through structured building blocks instead of a single stub.

### Stage 2.2 — Indentation-based tree parsing (elements + text)

Objective: Parse `.collie` source into AST using an indentation stack.

#### Parsing rules (MVP)

- Each non-empty line is either:
  1. Text line: | ...
  2. Element line: TagOrComponent(.class)*
- Leading indentation determines parent/child
- Enforce 2-space indentation per level:
  1. If indentation is not a multiple of 2 → diagnostic error
  2. If indent jumps by more than 1 level at once → diagnostic error
- Tabs are errors

#### Diagnostics (minimum)

- COLLIE001: Tabs not allowed
- COLLIE002: Indent not multiple of 2
- COLLIE003: Indent jumped more than one level
- COLLIE004: Invalid element line (empty name or bad characters)

#### User Pre-Flight Checklist

- Stage 2.1 complete

#### User Acceptance Checklist

- Run: pnpm -r build

- (Optional) Add a simple .collie file; compilation may not render yet until Stage 2.3

### Implementation Summary
- Implemented indentation-based parsing in `packages/compiler/src/parser.ts`, producing the Root/Element/Text AST and emitting COLLIE001–COLLIE004 diagnostics for tabs, invalid indentation, and malformed element lines.

### Stage 2.3 — Codegen: emit JSX + module wrapper

Objective: Generate a real React component module from AST.

Output requirements
- Default export function component using options.componentNameHint ?? "CollieTemplate"
- Include props param even if unused for now
- Emit JSX:
  * ElementNode → <name className="...">...</name>
  * TextNode → literal text between tags (or {{"text"}} form; either is acceptable)
- If the root has multiple top-level children, wrap in fragment <>...</>

#### User Pre-Flight Checklist

Stage 2.2 complete

#### User Acceptance Checklist

In `examples/vite-react-ts/src/components`, create:

`Welcome.collie`:

```collie
div.welcome
  h1 | Welcome from Collie
```

Import and render it from `App.tsx`:

```tsx
import Welcome from "./Welcome.collie";
export default function App() {{
  return <Welcome />;
}}
```

- Start the dev server yourself and confirm you see Welcome from Collie”

**NOTE**: (Codex must not run pnpm dev)

### Implementation Summary
- Added JSX/module generation in `packages/compiler/src/codegen.ts` and updated `compile()` to emit real React components (with fragment wrapping when needed) or fallback stubs if diagnostics contain errors, enabling .collie files with elements and text to render DOM.

## Stage 3 — Expressions & Interpolation

End goal of Stage 3: `{{expr}}` becomes JSX expressions `{expr}`.

### Stage 3.1 — Parse expression child nodes

Objective: Support a line that is purely an expression child:

```collie
div
  {{props.user.name}}
```

Rules
- Expression line must begin with {{ after indentation and end with matching }}
- In MVP, allow only single-line expressions
- Store raw inner text as ExprNode.value (trimmed)

Codegen
- ExprNode → {<raw>}

User Pre-Flight Checklist
- Stage 2 complete and example app renders basic template

User Acceptance Checklist
- Update template to include a {{...}} child and confirm it renders (e.g., shows a prop value)

### Implementation Summary
- Added `ExpressionNode` support plus parser handling for `{{expr}}`-only lines, wiring diagnostics (COLLIE005) for malformed expressions and emitting `{expr}` in codegen so standalone expression children render.

### Stage 3.2 — Inline expressions inside text lines

Objective: Support expressions embedded within | text lines:

```collie
p | Hello {{props.user.name}}!
```

Rules
- Only within | lines for MVP
- Split into parts: text + expr + text
- Represent internally as a TextNode with parts or as a MixedTextNode (implementation choice)

Codegen
- Emit children in order:
  * text → literal
  * expr → {expr}

User Acceptance Checklist
- Confirm mixed text+expr renders correctly in the example app

### Implementation Summary
- Extended text-line parsing/codegen so `|` lines split into literal + inline `{{expr}}` parts, preserving order when emitting JSX and reporting COLLIE005 on unterminated or empty inline expressions.

## Stage 4 — Props Block

End goal of Stage 4: .collie can declare props shape and the generated component is typed.

### Stage 4.1 — Parse props block header

Objective: Allow a props declaration at top of file:

```collie
props
  user: User
  isAdmin?: boolean
```

Rules
- Must appear before any template nodes
- Each child line matches: name(?): Type
- Store as PropsDecl:
  * fields: {{ name, optional, typeText }}[]

Diagnostics
- COLLIE101 props block appears after template nodes
- COLLIE102 invalid props line

User Pre-Flight Checklist
- Stage 3 complete

User Acceptance Checklist
- A .collie file with a props block still compiles and renders

### Implementation Summary
- Added PropsDecl/PropsField AST nodes and parser handling for a single top-level `props` block (before template nodes), capturing `name?: Type` entries and surfacing COLLIE101/102 diagnostics for misplaced or malformed headers/lines.

### Stage 4.2 — Emit props TypeScript type + annotate component

Objective: Use the props decl to generate a TS type and annotate component.

Output example

```tsx
export type Props = {{
  user: User;
  isAdmin?: boolean;
}};

export default function UserProfileTemplate(props: Props) {{
  return (...);
}}
```

Rules
- Preserve raw type text (do not parse TS)
- If the type text is invalid TS, allow TS errors to surface (OK in MVP)
- Keep type name stable: Props

User Acceptance Checklist
- Import the template component and ensure TS typechecking doesn’t break
- Use props inside expressions: {{props.user.name}}

### Implementation Summary
- Codegen now emits an `export type Props` definition (empty `{}` when there are no fields) and annotates the generated component parameter so compiled templates honor their declared props types.

## Stage 5 — Conditionals

End goal of Stage 5: @if / @else compile to valid JSX.

### Stage 5.1 — Parse and generate @if (cond) with no else

Syntax

```collie
@if (cond)
  div | Shown
```

AST
- IfNode {{ test: string, consequent: Node[], alternate?: Node[] }}

Codegen
- Without else: cond && (<Fragment>...</Fragment>)
- If the consequent is one node, fragment is optional (but fragments are acceptable for simplicity)

Diagnostics
- COLLIE201 invalid @if syntax / missing parens
- COLLIE202 @if with empty body

User Acceptance Checklist
- Toggle the condition in the example app and confirm the branch renders

Stage 5.2 — Parse and generate @else

Syntax

```collie
@if (cond)
  div | A
@else
  div | B
```

Rules
- @else must immediately follow an @if block at the same indentation level
- Else branch may contain multiple nodes

Codegen
- Ternary:
  * cond ? (<Fragment>...</Fragment>) : (<Fragment>...</Fragment>)

Diagnostics
- COLLIE203 @else without matching @if
- COLLIE204 @else indentation mismatch

User Acceptance Checklist
- Confirm both branches render when the condition changes

## Stage 6 — Vite Plugin Hardening (MVP-level)

End goal of Stage 6: Better overlay errors and developer ergonomics; no new language features.

### Stage 6.1 — Improve error overlay formatting

Objective

- When compiler returns diagnostics with severity error, the Vite plugin throws a single error that includes:
  * filename
  * line/col (if present)
  * diagnostic code + message

Constraints
- Do not break HMR
- Do not add dependencies

User Acceptance Checklist
- Introduce an indentation error and confirm Vite overlay shows a helpful message

## Stage 7 — CLI MVP (collie init)

End goal of Stage 7: Minimal “wire it up for you” command for Vite+React.

### Stage 7.1 — Implement collie init (minimal)

Behavior
- Intended to be run inside an existing Vite+React project directory
- Adds dev deps:
  * @collie-lang/compiler
  * @collie-lang/vite
- Patches vite.config.ts to add:
  * import collie from "@collie-lang/vite"
  * plugins: [react(), collie()]
- Writes src/collie.d.ts module declaration for *.collie

Constraints
- MVP patching can be “best effort”:
  * If config is too unusual, print instructions and exit non-zero
- No interactive prompts required for MVP (flags later)

User Pre-Flight Checklist
- Have a clean Vite+React project to test on

User Acceptance Checklist
- Running npx @collie-lang/cli init results in a project where a .collie import works

## Stage 8 — Release Prep (MVP)

### Stage 8.1 — Docs pass (root + packages)

Objective
- Update root README with:
  * what Collie is
  * quickstart for Vite
  * minimal syntax examples
- Package READMEs include install + usage snippets

User Acceptance Checklist
- README instructions work when followed manually

### Stage 8.2 — First public release via Changesets

Objectives
- Bump versions to 0.1.0
- Publish packages under @collie-lang/* as public

User Pre-Flight Checklist
- npm token configured
- changesets configured
- Run: pnpm -r build

User Acceptance Checklist
- npm view @collie-lang/compiler shows published version
- Fresh Vite project can install and use Collie
