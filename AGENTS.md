# Codex Agent Instructions (Collie Repo Policy)

These rules exist to prevent surprises, wasted tokens, and “helpful” overreach.
Follow them strictly.

---

## Absolute Non-Negotiables

### Do NOT write or run tests
- Do NOT create test files.
- Do NOT modify existing tests.
- Do NOT run any test commands or scripts (e.g. `pnpm test`, `vitest`, `jest`, etc.).
- Do NOT run any typecheck/lint/build scripts unless I explicitly ask you to.

### Do NOT run start/dev servers or watchers
- Do NOT run `dev`, `start`, `serve`, `watch`, or anything that launches long-running processes.
- Do NOT attempt to “verify by running the app.”

### Do NOT run terminal commands unless explicitly requested
- You may do code inspection and propose commands for **me** to run.
- If you believe command output is required to proceed, stop and ask permission first.

### Do NOT refactor unless explicitly asked
- No drive-by refactors.
- No “cleanup” changes.
- Only change code necessary to satisfy the requested task and acceptance criteria.

---

## Preflight (always at the start of each new task)

1) Check git branch + working tree status.
   - If on `main`/`master`/`dev` (or any protected branch) OR working tree is not clean:
     - STOP.
     - Tell me exactly what you found.
     - Ask whether to proceed anyway.

2) If I say “proceed”, continue without re-checking unless you later suspect something changed.

> Goal: prevent hallucinations and accidental work on the wrong branch.

---

## Scope Discipline & Token Efficiency

### Default: stay inside explicitly allowed scope
If the request provides:
- an allowlist of files/dirs you may touch, and/or
- a denylist of files/dirs you must not even open

Then:
- Only open/read files in the allowlist.
- Do NOT scan the repo.
- Do NOT open denylisted paths (even “just to check”).

### If scope conflicts arise, stop and ask
If you believe additional files are required, you MUST say something like:
> “I know you said to only touch X, but Y appears directly involved because ____.
> Do you want me to expand scope to include Y?”

Similarly, if you believe an allowed file is irrelevant, say:
> “You allowed X, but it doesn’t contain relevant code for this task. I think the work is actually in Y. Should I proceed with Y instead?”

Do not proceed until I answer.

### Avoid “big scans”
- Prefer targeted file opens over repo-wide searching.
- If you must search, keep it narrowly targeted and explain why.

---

## Planning / TODO Lists (lightweight, only when needed)

Do NOT produce a full TODO plan for approval every time.

Only produce a “recommended alternative approach” plan when:
- The request appears underspecified or contradictory, OR
- The requested approach will likely produce incorrect behavior, OR
- The work is clearly too large for a single pass and should be staged.

In those cases:
- Provide a concise plan (5–10 bullets max).
- Ask a single approval question:
  - “Proceed with the recommended approach?” (yes/no/yes-with-changes)

If no alternative approach is needed:
- Proceed directly to implementation (still honoring scope and non-negotiables).

---

## Implementation Rules (during code changes)

- Make minimal, localized diffs.
- Keep changes logically grouped (don’t mix unrelated edits).
- Prefer existing patterns and naming conventions already in the repo.
- When changing behavior, update any relevant docs/comments that would otherwise become misleading.

### Creating new files/folders
Do NOT create new files/folders unless:
- the prompt explicitly instructs it, OR
- you ask permission first and explain:
  - what file/folder you want to add
  - why it’s needed
  - why it’s better than modifying an existing file

---

## Handoff (end of task output requirements)

At the end of the work, ALWAYS provide:

### 1) Summary of what changed
- Bullet list of changes, grouped by area.
- Call out any behavior changes (including “X no longer does Y”).
- Note any follow-ups or known limitations.

### 2) Ordered “What you should do next” list (if applicable)
- Provide step-by-step actions for me to verify the changes.
- If steps include terminal commands, include them in fenced bash blocks for copy/paste.
- After each step, state what I should expect to see.

Example:

1. Run typecheck
  ```bash
  pnpm -w lint
  ```

Expectation: no TypeScript errors.

(Only include commands you believe are useful; do not run them yourself.)

### 3) Version + changelog suggestion (ask permission first)

After changes are complete, do the following:

* Read the current version from the relevant `package.json`.

  * If the task clearly affects only one package under `packages/<name>`, use that package’s `package.json`.
  * If it affects multiple packages or repo-level behavior, ask me whether I want a version bump on a specific package or the repo root (if applicable).
* Determine the recommended next version bump using semantic versioning:

  * Patch: bugfix / internal fix
  * Minor: backward-compatible feature
  * Major: breaking change

Then ask:

> “Do you want me to update the relevant `package.json` version to X.Y.Z and add a Keep a Changelog entry at the top of the appropriate CHANGELOG?”

Notes:

* This repo is a monorepo; many packages have their own `CHANGELOG.md`.
* Prefer updating the package-level `CHANGELOG.md` that corresponds to the package you changed.
* Only update the root `CHANGELOG.md` if the task is explicitly about the repo as a whole.

If yes:

* Update version.
* Add a new changelog section at the top using Keep a Changelog style:

```md
## [X.Y.Z] - YYYY-MM-DD
### Added
- ...
### Changed
- ...
### Fixed
- ...
```

(Use only the sections that apply; keep bullets concrete.)

### 4) Recommended commit message

After changelog/version are settled (or explicitly declined), provide a suggested commit command:

```bash
gitquick "<recommended_commit_msg>"
```

The message should reflect the actual work done and match existing repo conventions.

**Hard Constraint**: The length of the commit message must be LESS than 70 characters.

---

## Common denylist (token control)

Unless a prompt explicitly requires it, do not open:

* `node_modules/`
* any `packages/*/dist/`
* `packages/*/node_modules/`
* `pnpm-lock.yaml` (unless dependency/version changes are explicitly requested)
* large generated artifacts (bundles, source maps)
* `.turbo/`, `build/`, or other generated output folders (if present)

---

## If anything conflicts, stop early

If you encounter a direct conflict between:

* the prompt/task instructions,
* these repo rules,
* or existing code behavior,

STOP and ask for clarification before continuing.