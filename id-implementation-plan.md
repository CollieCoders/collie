You are working in the main `collie` monorepo (the core language + compiler).
Please read this entire prompt before making any changes.

---

### 🎯 High-level goal

Add support for an optional top-of-file `#id` directive in `.collie` templates.

This `#id` is used to determine the **identifier** for a template, which will then be used by build scripts / tooling to map Collie templates to HTML partial filenames and DOM `id`s.

We are moving toward a model where:

* Devs can put `.collie` files **anywhere** in their project.
* Each template can declare an optional `#id` at the top.
* If present, `#id` overrides the “identifier” derived from the filename.
* The HTML runtime (CDN) uses these identifiers to inject content into elements whose `id` ends with `-collie`.

We are **not** yet enforcing uniqueness in the compiler itself (that will be enforced via the VS Code extension/diagnostics later), but we must expose the `id` clearly in the compiler API.

---

### 💡 Desired behavior (semantics)

For any `.collie` file, e.g.:

```collie
#id homeHero
#props
  title: string

section.hero
  h1= props.title
```

* The **template identifier** should be `homeHero`.

* Build tooling is expected to produce an HTML partial like:

  ```text
  public/collie/generated/homeHero.html
  ```

* The HTML runtime will inject that partial into:

  ```html
  <section id="homeHero-collie"></section>
  ```

For a file with no `#id`, e.g.:

```collie
#props
  title: string

section.hero
  h1= props.title
```

* The template identifier should fall back to the **base filename**, e.g.:

  * `components/home/hero.collie` → identifier `hero`
  * Builds to `public/collie/generated/hero.html`
  * Injects into `<div id="hero-collie"></div>`.

The mapping rule we want to support is:

```text
collie identifier:   "homeHero"
DOM id:              "homeHero-collie"
HTML partial file:   "/collie/generated/homeHero.html"
```

---

### 🧱 Syntax rules for `#id`

1. **Optional by default**

   * A `.collie` file **may** declare `#id`, but it is not required.

2. **Top-of-file only**

   * If present, `#id` **must be the first directive line** in the file, before any other sections (`#props`, `#classes`, markup, etc.).
   * If there are existing rules for top-of-file sections like `#props` or `#classes`, adjust them so:

     * `#id` is allowed to appear before them.
     * `#props` / `#classes` do **not** have to be the very first line anymore, only the first of their kind before markup.
   * It’s okay if there are leading whitespace or blank lines, but `#id` should be the first **semantic** directive if present.

3. **Accepted syntaxes**

   The **canonical** form is:

   ```collie
   #id homeHero
   ```

   But we must also accept:

   ```collie
   #id = homeHero
   #id: homeHero
   ```

   i.e.:

   * `#id` followed by whitespace and a value
   * Optional `=` or `:` after `#id`, with arbitrary surrounding whitespace

   Spaces in the value are **not** supported; `home hero` is invalid, but `home-hero` or `homeHero` is fine.

4. **Normalization / handling `-collie`**

   The `#id` value is **logical id**, which we’ll refer to as `rawId`.

   * If `rawId` **ends with** `-collie`, we strip that suffix when computing the identifier:

     * `#id homeHero`        → identifier = `homeHero`
     * `#id homeHero-collie` → identifier = `homeHero` (suffix stripped)

   * The goal is: either `#id homeHero` or `#id homeHero-collie` both logically resolve to the identifier `homeHero`, which then maps to `homeHero-collie` in the DOM and `homeHero.html` on disk.

   * Do **not** double-append `-collie`. We do **not** want `homeHero-collie-collie`.

5. **Fallback when no `#id` is present**

   * If a file does **not** declare `#id`, the template identifier is derived from the **base filename**, without directory or extension:

     * `components/home/hero.collie` → identifier `hero`
     * `landing/homeHero.collie`     → identifier `homeHero`

   * Normalization (e.g. stripping `-collie` suffix) should also apply here:

     * `header-collie.collie` → identifier `header` (strip trailing `-collie` from base name)

   * This ensures consistency: both filename and `#id` follow the same normalization rules.

---

### 🧬 Compiler / AST / API changes

You need to:

1. **Update the parser / AST**:

   * Locate where the compiler currently handles top-of-file sections like `#props` or `#classes`.

   * Introduce a new concept in the AST, e.g.:

     ```ts
     interface CollieDocument {
       // existing fields...
       id?: string; // normalized identifier (suffix stripped, null/undefined if absent)
       rawId?: string; // optional raw value before normalization (if you find this useful)
     }
     ```

   * Ensure the parser:

     * Recognizes `#id` directive at the top of the file.
     * Extracts the raw value according to the syntax rules above.
     * Computes the normalized `identifier` (strip `-collie` suffix if present).
     * Stores it on the document.

2. **Expose the identifier in compile results**

   For all compile functions:

   * `compileToHtml`
   * `compileToJsx`
   * `compileToTsx`

   Update their return type (or internal result object) to include metadata holding the identifier, e.g.:

   ```ts
   interface CollieCompileMeta {
     id?: string;     // normalized identifier (preferred)
     rawId?: string;  // raw directive value, if present
     filename?: string; // existing field if you have one
   }

   interface CompileResult {
     code: string;
     map?: SourceMapLike;
     diagnostics: Diagnostic[];
     meta?: CollieCompileMeta;
   }
   ```

   Behaviors:

   * If there is a `#id` directive:

     * `meta.id` = normalized identifier (suffix stripped).
     * `meta.rawId` = original raw string value (if you choose to keep this).
   * If there is **no** `#id`:

     * `meta.id` = normalized identifier from basename (e.g. `hero` for `hero.collie`).
     * `meta.rawId` can be `undefined` or omitted.

   **Important:** Do **not** break existing callers; add fields in a backwards-compatible way (e.g. optional `meta`).

3. **Make sure `filename` handling is consistent**

   * Compiler options probably already accept something like `filename` for diagnostics.
   * When computing identifier from filename, use:

     * `path.basename(filename, '.collie')` as the starting point.
   * That way build scripts can pass the relative path as `filename` and still get predictable `meta.id`.

---

### 🔁 How this will be used (for your awareness)

This is **context only**, not something the runtime should implement directly:

* A Node build script (in a template repo) will:

  * Recursively find all `.collie` files.
  * Call `compileToHtml(source, { filename: relPath })`.
  * Read `result.meta.id`.
  * If `meta.id` is present, write to:

    ```text
    public/collie/generated/<meta.id>.html
    ```

* The CDN `html-runtime` will:

  * Scan for elements with `id$="-collie"`.
  * Strip the `-collie` suffix to compute `identifier`.
  * Fetch `/collie/generated/<identifier>.html`.
  * Inject the HTML.

So the compiler’s job is:

* Parse and normalize `#id`.
* Provide a stable `meta.id` for downstream tooling.

The runtime **must not** try to read `.collie` files; it operates only on DOM + static HTML files.

---

### 📌 Rules recap for Codex

Implement the following:

1. **Parser & AST**

   * Add `#id` directive support at the top of `.collie` files.
   * Store normalized `id` (suffix-stripped) and optionally `rawId` on the document.

2. **Normalization**

   * Strip trailing `-collie` from both:

     * `#id` directive values.
     * Base filenames (if no `#id` is provided).

3. **Compiler API**

   * Extend compile result types to include `meta.id` (and optionally `meta.rawId`, `meta.filename`).
   * Populate `meta.id` in all compile modes (HTML, JSX, TSX).

4. **Backwards compatibility**

   * Do not break existing compile APIs.
   * `compileToHtml` and friends must still work for callers that ignore `meta`.

5. **Tests**

   * Add tests to cover:

     * No `#id` → identifier from filename (`hero.collie` → `hero`).
     * `#id homeHero` → identifier `homeHero`.
     * `#id homeHero-collie` → identifier `homeHero`.
     * Filename with `-collie` suffix → identifier without suffix (`header-collie.collie` → `header`).
     * `#id = homeHero` and `#id: homeHero` parsing correctly.

If anything about existing `#props` / `#classes` implementation or file layout is ambiguous, stop and ask clarifying questions instead of guessing.