# Collie v4 Targeted Improvement Plan

*For use with the Codex VS Code extension*

This document defines **implementable features and fixes** for the `collie` repo.

Each item includes:

* **Problem** — what’s wrong or missing
* **Goal** — what we want instead
* **Requirements** — constraints/behavior
* **Implementation Steps** — concrete steps Codex should follow
* **Acceptance Criteria** — what must be true when it’s done

---

## ========================================

## A. FEATURES — COLLIE CORE / PLUGINS

## ========================================

---

## **A3 — Robust Next.js Integration (App Router + Pages Router + RSC Awareness)**

**Status**: ✅ Complete

**Repo:** `collie`

### Problem

The current Next.js integration:

* Assumes a simple layout (usually App Router) and can mis-detect the correct root directory.
* Does not explicitly distinguish between App Router and Pages Router projects.
* Does not provide collie-level ergonomics for `"use client"` / RSC behavior.

This produces confusing setups for different Next.js project structures and makes client/server semantics less clear.

### Goal

Provide a **robust, self-detecting Next.js integration** that:

1. Correctly detects whether the project uses:

   * `app/`
   * `src/app/`
   * `pages/`
   * `src/pages/`
2. Generates appropriate example collie components for App Router vs Pages Router.
3. Provides collie-level sugar for `"use client"` semantics (a simple `@client` directive).

### Requirements

* Add a **deterministic directory detection hierarchy** (see below).
* Update the CLI “Next setup” flow to:

  * Use the detected root
  * Generate examples that match the detected router type
* Add a collie directive:

  ```collie
  @client
  ```

  that results in `"use client"` at the top of the generated TSX wrapper (or equivalent compiled output).

#### Directory detection order

When setting up Next.js integration (CLI and plugin), detection should follow this order:

1. `app/` in project root
2. `src/app/`
3. `pages/` in project root
4. `src/pages/`
5. If none exist, fallback to a sensible default and emit a clear warning to the user.

### Implementation Steps

1. **Update primary directory resolution (CLI + plugin)**

   * Find the function that currently resolves the “primary” directory used for Next.js scaffolding (e.g., `resolvePrimaryDir` in the CLI Next.js setup module).
   * Replace the existing logic with the hierarchy listed above.
   * Ensure the function returns both:

     * The **root path** for examples (e.g. `app`, `src/app`, `pages`, `src/pages`)
     * A **router type**, e.g. `"app"` or `"pages"`.

2. **Adjust Next.js setup CLI command**

   * In the CLI command that wires up Next.js support (e.g. `nextjs-setup.ts` or equivalent):

     * Use the new directory detection function.
     * If no supported directory is found, log a clear message:

       * Explain that no `app/`, `src/app/`, `pages/`, or `src/pages/` folder was found.
       * Suggest that the user create one and re-run the command.
   * Before writing any example file (e.g. `components/Welcome.collie` under the chosen root), check whether the file already exists:

     * If it exists, either:

       * Skip creation and log a message, or
       * Create a uniquely named example, e.g. `WelcomeCollieExample.collie`.

3. **Generate router-specific examples**

   * **App Router projects**:

     * Generate an example collie file under the appropriate `app` path, e.g.:

       * `app/components/Welcome.collie`
       * Or `src/app/components/Welcome.collie`
     * Example should be a **server component** unless explicitly marked `@client`.
   * **Pages Router projects**:

     * Generate an example component under the `pages` tree, e.g.:

       * `pages/components/Welcome.collie`
       * Or `src/pages/components/Welcome.collie`
   * Ensure the associated TS/TSX example imports the collie component correctly and compiles in both router styles.

4. **Implement the `@client` directive in the compiler**

   * In the collie compiler:

     * Extend the parser to recognize a top-level directive:

       ```collie
       @client
       ```

       at or near the top of a collie file.
     * Add an AST node or flag indicating that `"use client"` should be emitted in the compiled output.
   * In the codegen:

     * Ensure that when a file is marked as `@client`, the generated TSX wrapper contains:

       ```ts
       "use client";
       ```

       at the top-level, **exactly once**.
   * Ensure `@client` is either:

     * Allowed only at the top of the file, or
     * If you choose to allow more locations, enforce consistent semantics via diagnostics.

5. **Update Next.js plugin logic**

   * In the `@collie-lang/next` plugin:

     * Ensure `.collie` extensions are correctly included in `resolve.extensions`.
     * Ensure collie loader is applied consistently to `.collie` files regardless of App vs Pages router.
   * If necessary, log the detected router type (for debugging).

6. **Add tests**

   * Add automated tests that:

     * Run the Next setup command against mock projects with:

       * Only `app/`
       * Only `src/app/`
       * Only `pages/`
       * Only `src/pages/`
     * Verify that examples are written to the correct directory.
     * Verify that `@client` results in `"use client"` appearing exactly once in the generated TSX.

### Acceptance Criteria

* In an App Router project with `app/`, Next setup:

  * Detects `app/`
  * Generates an appropriate example
  * Builds successfully under Next.
* In a Pages Router project with `pages/`, Next setup:

  * Detects `pages/`
  * Generates an appropriate example
  * Builds successfully under Next.
* A collie file starting with `@client` compiles to TSX that begins with `"use client";`.
* No accidental writes occur to incorrect or non-existent directories.
* Detection is deterministic and logged clearly when ambiguous.

---

## **A5 — Macro-Level Sugar: Slots and Conditional Guards**

**Status**: ✅ Complete

**Repo:** `collie`

### Problem

Collie provides solid JSX-like expressiveness but lacks higher-level component macros (slots/named blocks) and concise conditional guards. This reduces its “syntactic sugar” advantage over plain TSX.

### Goal

Introduce **macro-level sugar** that compiles to plain JSX but offers:

1. **Named slots / child blocks** (`@header`, `@body`, etc.).
2. **Conditional guards** (`div?condition`, `ul?items.length`, etc.) for concise conditional rendering.

No runtime dependency should be required; everything must compile down to standard JSX.

### Requirements

1. **Slots**

   * Syntax example:

     ```collie
     Card
       @header
         h2 {title}
       @body
         p {description}
     ```
   * Semantics:

     * Compiles to something like:

       ```tsx
       <Card
         header={
           <>
             <h2>{title}</h2>
           </>
         }
         body={
           <>
             <p>{description}</p>
           </>
         }
       />
       ```
     * Where each `@slotName` becomes a prop with JSX content.

2. **Conditional guards**

   * Basic syntax:

     ```collie
     div?isVisible
       span "Hello"
     ```
   * Compiles to:

     ```tsx
     isVisible && (
       <div>
         <span>Hello</span>
       </div>
     )
     ```
   * More complex expression:

     ```collie
     ul?items.length > 0
       li?item of items
         {item.label}
     ```
   * Outer guard compiles to a short-circuit expression with the full element subtree inside.

3. **Diagnostics**

   * Disallow invalid slot usage (e.g., nested `@slot` inside another slot when unsupported).
   * Warn or error on malformed guard expressions.
   * Provide specific error codes and messages.

### Implementation Steps

1. **Extend parser for slot blocks**

   * Add support for `@slotName` as a new kind of block marker under a component node.
   * Represent these in the AST as a `SlotBlock` or similar, with:

     * `name: string`
     * `children: Node[]`
   * Ensure slot names are validated as identifiers (no spaces, etc.).

2. **Extend parser for conditional guards**

   * Add syntax recognition for `ElementOrComponent?expression` form:

     * Example: `div?condition`, `MyComponent?foo === 'bar'`.
   * Parse the expression after `?` as a standard expression node.
   * Introduce a `GuardedNode` AST wrapper or flag on existing element/component nodes.

3. **Codegen for slots**

   * When encountering a component node containing slot blocks:

     * Transform it into a JSX element with props named after the slots:

       * Prop value is a JSX fragment built from the slot children.
   * Implement this transformation in the compiler’s component codegen path, not as a runtime feature.

4. **Codegen for guards**

   * When a node has a guard expression:

     * Emit a short-circuit JSX expression:

       ```tsx
       condition && <Node ...>
       ```
   * Ensure that nested guards compose correctly:

     * e.g. `div?outer` containing `span?inner` produces nested short-circuits.

5. **Diagnostics and error handling**

   * Add diagnostic(s) for:

     * Using `@slot` outside a component context.
     * Using duplicate slot names in the same component (if you choose to disallow that).
     * Guards with missing or invalid expressions.
   * Ensure diagnostics are surfaced with clear messages and unique error codes.

6. **Tests**

   * Add unit tests covering:

     * Single slot, multiple slots.
     * Guards on simple elements and components.
     * Nested guards.
     * Guards combined with slots.
     * Error conditions (invalid syntax, invalid placement).

### Acceptance Criteria

* Valid slot syntax compiles to JSX with named props as described.
* Valid guard syntax compiles to short-circuit JSX expressions.
* Invalid slot usage and malformed guards produce clear diagnostics.
* No runtime helper is required; all transformations are compile-time.

---

## **A6 — Storybook and React Native / Expo Adapters**

**Repo:** `collie`

### Problem

Collie currently integrates with Vite, Webpack, and Next.js. It does not integrate with:

* Storybook (for component/stories authoring)
* React Native / Expo (for mobile apps, via Metro)

This limits adoption across the broader React ecosystem.

### Goal

Provide:

1. A **Storybook adapter/preset** so `.collie` components and stories can be used directly in Storybook.
2. An **experimental React Native / Expo adapter** via a Metro transformer so `.collie` can be compiled in mobile projects.

### Requirements

* New packages (or sub-packages) for:

  * `@collie-lang/storybook`
  * `@collie-lang/expo` (name is flexible but must be clear)
* Storybook adapter:

  * Works with Webpack and/or Vite-based Storybook setups.
  * Automatically registers `.collie` handling.
* Expo adapter:

  * Metro transformer that compiles `.collie` to JS/TS on the fly.
  * Minimal configuration needed for standard Expo projects.

### Implementation Steps

1. **Create Storybook adapter package**

   * Under `packages/`, create a new package:

     * Example name: `@collie-lang/storybook`.
   * Implement:

     * A Webpack preset that:

       * Registers `.collie` in `resolve.extensions`.
       * Uses the collie Webpack loader for `.collie` files.
     * Optionally, a Vite preset (for Vite-powered Storybook):

       * Reuses the `@collie-lang/vite` plugin or wraps it appropriately.
   * Provide a minimal configuration snippet in the package README:

     * Example:

       ```js
       // .storybook/main.js
       const { withCollieStorybook } = require('@collie-lang/storybook');

       module.exports = withCollieStorybook({
         stories: ['../src/**/*.stories.@(js|jsx|ts|tsx|collie)'],
         // ...
       });
       ```

2. **Create Expo / React Native adapter package**

   * Under `packages/`, create a new package:

     * Example name: `@collie-lang/expo` or `@collie-lang/metro`.
   * Implement a Metro transformer:

     * Export a `getTransformModule` or transformer function that:

       * Checks for `.collie` files.
       * Calls the core collie compiler to generate JS/TS.
       * Passes through other files untouched or chains to the default Metro transformer.
   * Provide configuration example:

     ```js
     // metro.config.js
     const { withCollieMetro } = require('@collie-lang/expo');

     module.exports = withCollieMetro({
       // existing metro config
     });
     ```
   * Ensure the transformer:

     * Handles source maps if needed.
     * Plays nicely with fast refresh.

3. **Example projects**

   * Create minimal example projects under `examples/`:

     * `examples/storybook-collie` demonstrating collie components + stories.
     * `examples/expo-collie` demonstrating collie components in a simple Expo app.
   * Ensure these examples:

     * Build and run.
     * Include at least one `.collie` component.

4. **Tests**

   * Add basic tests or at least script-based checks that:

     * Run Storybook build in the example project.
     * Run Expo bundler in the example project.

### Acceptance Criteria

* A user can configure Storybook with the new adapter and import `.collie` components without extra boilerplate.
* A user can configure Expo/React Native Metro with the adapter and use `.collie` files in a simple app.
* Both new packages expose clear, minimal configuration entry points.
* Examples build successfully with the provided configuration.

---

## ========================================

## C. ISSUES — COLLIE CORE

## ========================================

---

## **C1 — Eliminate Spec Drift Between Compiler and VS Code Parser**

**Repos:** `collie` and `collie-vscode` (but primarily resolved via B1)

### Problem

The compiler and the VS Code extension currently implement **separate** parsing and diagnostic logic. This leads to:

* The compiler accepting syntax that the extension flags as invalid.
* The extension flagging errors that the compiler does not.
* Extra maintenance when adding new language features.

### Goal

Ensure that the **compiler is the single source of truth** for:

* Grammar
* AST
* Diagnostics

The VS Code extension must use the compiler for language semantics.

### Requirements

* All parsing and diagnostics used in the extension must originate from the compiler.
* No parallel or duplicate grammar/AST definitions in the extension.
* A shared fixture/test suite that validates compiler and extension behave consistently.

### Implementation Steps

1. **Implement B1 first**

   * Make sure the extension uses the compiler for parsing and diagnostics.
   * Remove or deprecate extension-specific parser and diagnostic definitions.

2. **Create shared fixtures**

   * Under the `collie` repo (compiler), define a `fixtures/` directory containing collie source examples:

     * Valid syntax covering all features.
     * Invalid syntax with expected diagnostics.
   * Add compiler tests that:

     * Parse each fixture.
     * Assert expected AST and diagnostics.

3. **Add extension-level checks**

   * In the `collie-vscode` repo, add tests that:

     * Open each fixture document via the extension testing framework.
     * Assert that diagnostics reported in VS Code match those from the compiler tests (message and code; positions should be close/identical).

4. **Remove any remaining spec duplication**

   * Search the extension repo for any AST/diagnostic logic that still attempts to interpret collie semantics independently.
   * Replace those with compiler-based calls or AST consumption.

### Acceptance Criteria

* Any valid collie program accepted by the CLI is treated as valid by the extension (no spurious errors).
* Any invalid program that produces a compiler diagnostic also produces a corresponding extension diagnostic.
* There is only one grammar implementation (in the compiler) and one diagnostic spec (also in the compiler).
* Shared fixtures keep the two in sync and catch regressions.

---

## **C2 — Make Next.js Directory Resolution Logic Robust and Predictable**

**Repo:** `collie`

### Problem

The logic that determines where to place Next.js example files (and how to wire collie into Next):

* May default to `app/` even if it doesn’t exist.
* Does not properly recognize `src/app`, `pages`, or `src/pages` patterns.
* Can create confusing or incorrect file paths in user projects.

### Goal

Implement a robust, predictable directory detection algorithm for Next.js:

* Works for App Router and Pages Router.
* Matches the project’s actual structure.
* Avoids creating files in non-existent directories.

### Requirements

* Detection order:

  1. `app/`
  2. `src/app/`
  3. `pages/`
  4. `src/pages/`
  5. Otherwise: no match → warn and exit gracefully.

* Any place where the CLI or plugin chooses a “primary directory” for Next must use this logic.

* Before writing example files, existence must be verified.

### Implementation Steps

1. **Refactor directory resolution**

   * Identify the function responsible for choosing the primary Next directory (e.g. `resolvePrimaryDir` in CLI Next setup).
   * Replace or modify it to:

     * Check the above directories in order.
     * Return both the path and a router type (e.g. `"app"` or `"pages"`) if helpful.

2. **Handle “no directory” case**

   * If none of the four directories exist:

     * Do not guess or create them implicitly.
     * Log a clear message:

       * Explain that no supported Next root folder was found.
       * Suggest that the user create one or run collie init appropriately.

3. **Verify existence before writing example**

   * Wherever a collie example is written:

     * Ensure the directory exists.
     * If it doesn’t, either:

       * Create it explicitly (if that’s desired), or
       * Refuse with a clear message.
   * Avoid overwriting existing user files silently.

4. **Update Next plugin’s assumptions**

   * Ensure `@collie-lang/next` plugin logic:

     * Does not assume a specific folder (like `app/`) if `collie` CLI’s directory resolution is used.
     * Uses consistent extension and loader configuration regardless of chosen root.

5. **Add automated tests**

   * Create minimal mock Next projects representing:

     * App Router under `app/`
     * App Router under `src/app/`
     * Pages Router under `pages/`
     * Pages Router under `src/pages/`
   * Execute the Next setup command or relevant logic and assert:

     * Correct directory is chosen.
     * Example files land where expected.
     * No directories are incorrectly created.

### Acceptance Criteria

* For each recognized Next structure, collie chooses the correct primary directory.
* No incorrect default to `app/` when it does not exist.
* Setup does not silently create or write to unexpected paths.
* Logs clearly describe what was detected and what was done.
