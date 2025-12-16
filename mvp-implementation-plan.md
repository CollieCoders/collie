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