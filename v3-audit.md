# Collie v3 Implementation Audit

This document provides a comprehensive audit of the Collie v3 implementation, covering the CLI features specified in [`cli-report.md`](cli-report.md) and the Next.js integration phases detailed in [`nextjs-plan.md`](nextjs-plan.md). The audit identifies gaps between the planned features and the current implementation, providing actionable tasks to achieve full feature parity.

## Summary

**Overall Completion:** 82%

**Issues Identified:**
- 2 Critical Issues (Priority 1-2)
- 2 Minor Issues (Priority 3-4)

**Status by Feature Set:**
- CLI Features 1-4, 6: ✅ Complete
- CLI Feature 5 (Next.js templates): ⚠️ Incomplete
- Next.js Integration Phases 1-2, 4: ✅ Complete
- Next.js Integration Phase 3: ⚠️ Incorrect implementation
- Next.js Integration Phase 5: ⚠️ Needs verification

---

## Tasks (Ordered by Priority)

### Task #1: Implement Next.js Project Templates for `collie create`

**Priority:** Critical (P1)

**Related Requirement:** Feature #5 from [`cli-report.md`](cli-report.md:93-119)

**Files Affected:**
- [`packages/cli/src/creator.ts`](packages/cli/src/creator.ts:27-35) - TEMPLATE_MAP configuration
- `packages/cli/templates/nextjs-app-router-ts/` - New directory (to be created)
- `packages/cli/templates/nextjs-app-router-js/` - New directory (to be created)

**Issue:**

The CLI currently supports `collie create` for Vite React projects but is missing templates for Next.js projects. Users attempting to run `collie create my-app --template nextjs` will fail because:

1. Only Vite templates exist in `packages/cli/templates/` directory
2. The `TEMPLATE_MAP` in [`creator.ts`](packages/cli/src/creator.ts:27-35) only defines `'vite-react-ts'` and `'vite-react-js'` options
3. No corresponding `nextjs-app-router-ts/` or `nextjs-app-router-js/` template directories exist

This prevents users from scaffolding new Next.js projects with Collie support, requiring them to manually set up Next.js and then run `collie init --nextjs`.

**Implementation Steps:**

1. Create template directory structure:
   - `packages/cli/templates/nextjs-app-router-ts/`
   - `packages/cli/templates/nextjs-app-router-js/`

2. Base the templates on the working example at [`examples/nextjs-app-router/`](examples/nextjs-app-router/), including:
   - `package.json.template` with necessary dependencies (@collie-lang/next, next, react, etc.)
   - `next.config.js` configured to use `@collie-lang/next` plugin
   - `tsconfig.json` (TS template) or `jsconfig.json` (JS template)
   - `README.md.template` with Next.js-specific instructions
   - Basic app router structure: `src/app/layout.tsx`, `src/app/page.tsx`
   - Example `.collie` component in `src/components/`
   - `src/collie.d.ts` type definitions
   - `.gitignore` configured for Next.js
   - Configuration files: `postcss.config.js`, `tailwind.config.ts` (or make optional)

3. Update [`creator.ts`](packages/cli/src/creator.ts) TEMPLATE_MAP to include:
   ```typescript
   'nextjs-app-router-ts': 'nextjs-app-router-ts',
   'nextjs-app-router-js': 'nextjs-app-router-js',
   ```

4. Update the template selection logic in [`creator.ts`](packages/cli/src/creator.ts:145-149) to support 'nextjs' as a shorthand for 'nextjs-app-router-ts'

5. Ensure the `createProject()` function properly handles Next.js templates with correct dependency installation (npm/pnpm/yarn)

**Acceptance Criteria:**

- [ ] User can run `collie create my-app --template nextjs` successfully
- [ ] User can run `collie create my-app --template nextjs-app-router-ts` successfully
- [ ] User can run `collie create my-app --template nextjs-app-router-js` successfully
- [ ] Created Next.js project includes properly configured `next.config.js` with `@collie-lang/next` plugin
- [ ] Created project has example `.collie` component that compiles successfully
- [ ] `npm run dev` (or equivalent) starts Next.js dev server without errors
- [ ] `.collie` files are properly processed and display in the browser
- [ ] Template includes clear README with setup instructions

---

### Task #2: Integrate @collie-lang/next Package in CLI Next.js Setup

**Priority:** Critical (P2)

**Related Requirement:** Phase 3 from [`nextjs-plan.md`](nextjs-plan.md:73-91)

**Files Affected:**
- [`packages/cli/src/nextjs-setup.ts`](packages/cli/src/nextjs-setup.ts:131-159) - Webpack loader creation
- [`packages/cli/src/nextjs-setup.ts`](packages/cli/src/nextjs-setup.ts:1-15) - Import statements
- [`packages/cli/package.json`](packages/cli/package.json) - Dependencies

**Issue:**

The `collie init --nextjs` command currently creates an inline webpack loader configuration directly in `next.config.js` rather than using the dedicated `@collie-lang/next` package that was built for this purpose (Phase 3). This creates several problems:

1. **Code Duplication**: The webpack configuration logic exists in both [`packages/next/src/index.ts`](packages/next/src/index.ts) and is being recreated in [`nextjs-setup.ts`](packages/cli/src/nextjs-setup.ts:131-159)
2. **Maintenance Burden**: Updates to webpack configuration require changes in multiple locations
3. **Violates Architecture**: Phase 3 specifically calls for using the `@collie-lang/next` package via `withCollie()` wrapper
4. **Inconsistency**: Manual setup differs from package-based setup, leading to potential configuration drift

Current implementation in [`nextjs-setup.ts`](packages/cli/src/nextjs-setup.ts:131-159) generates inline code instead of using the published package.

**Implementation Steps:**

1. Add `@collie-lang/next` as a dependency in [`packages/cli/package.json`](packages/cli/package.json) if not already present

2. Update [`packages/cli/src/nextjs-setup.ts`](packages/cli/src/nextjs-setup.ts) to:
   - Remove the inline webpack loader generation code (lines 131-159)
   - Replace with simpler config that imports and uses `withCollie()` from `@collie-lang/next`

3. Modify the `next.config.js` template generation to produce:
   ```javascript
   const withCollie = require('@collie-lang/next');

   /** @type {import('next').NextConfig} */
   const nextConfig = {
     // User's existing config
   };

   module.exports = withCollie(nextConfig);
   ```

4. Update the `setupNextjsProject()` function to:
   - Detect when user already has `@collie-lang/next` installed
   - Add package to dependencies if not present
   - Preserve any existing Next.js config options when wrapping with `withCollie()`

5. Test that the new implementation works with both JavaScript and TypeScript Next.js configs

**Acceptance Criteria:**

- [ ] `collie init --nextjs` adds `@collie-lang/next` to `package.json` dependencies
- [ ] Generated `next.config.js` uses `withCollie()` wrapper instead of inline webpack config
- [ ] Existing Next.js config options are preserved when wrapping with `withCollie()`
- [ ] `.collie` files compile correctly in Next.js projects after running `collie init --nextjs`
- [ ] Works with both `.js` and `.ts` Next.js config files
- [ ] Works with both ESM (`export default`) and CommonJS (`module.exports`) config formats
- [ ] No code duplication between `@collie-lang/next` package and CLI setup logic
- [ ] Integration tests at [`tests/integration/nextjs.test.ts`](tests/integration/nextjs.test.ts) pass

---

### Task #3: Improve Template Validation Error Messages

**Priority:** Minor (P3)

**Related Requirement:** Feature #5 from [`cli-report.md`](cli-report.md:93-119)

**Files Affected:**
- [`packages/cli/src/creator.ts`](packages/cli/src/creator.ts:145-149) - Template validation logic

**Issue:**

When a user provides an invalid template name to `collie create`, the current error handling in [`creator.ts`](packages/cli/src/creator.ts:145-149) may not provide clear guidance on which templates are actually available. This leads to poor user experience when users:

- Misspell template names
- Try to use templates that don't exist
- Are unsure what templates are available

The validation should explicitly list all available template options to guide users toward valid choices.

**Implementation Steps:**

1. Update the template validation logic in [`creator.ts`](packages/cli/src/creator.ts:145-149) to:
   - Detect when an invalid template is provided
   - Generate a clear error message listing all available templates
   - Suggest the closest match if the user made a typo (optional enhancement)

2. Format the error message similar to:
   ```
   ❌ Invalid template: 'next-js'
   
   Available templates:
     • vite-react-ts       - Vite + React + TypeScript
     • vite-react-js       - Vite + React + JavaScript  
     • nextjs-app-router-ts - Next.js App Router + TypeScript
     • nextjs-app-router-js - Next.js App Router + JavaScript
   
   Usage: collie create <project-name> --template <template-name>
   ```

3. Consider adding a `--list-templates` flag that shows available templates without creating a project

4. Update help text for `collie create` command to mention available templates

**Acceptance Criteria:**

- [ ] Invalid template name produces clear error message
- [ ] Error message lists all available template options
- [ ] Error message includes brief description of each template
- [ ] User can understand what went wrong and how to fix it
- [ ] (Optional) Closest template match is suggested for typos
- [ ] (Optional) `collie create --list-templates` shows available options

---

### Task #4: Verify and Update Documentation for Next.js Support

**Priority:** Minor (P4)

**Related Requirement:** Phase 5 from [`nextjs-plan.md`](nextjs-plan.md:109-127)

**Files Affected:**
- [`README.md`](README.md) - Root project README
- [`packages/cli/README.md`](packages/cli/README.md) - CLI package documentation
- [`packages/next/README.md`](packages/next/README.md) - Next.js package documentation
- [`packages/compiler/README.md`](packages/compiler/README.md) - Compiler package documentation
- [`docs/migration.md`](docs/migration.md) - Migration guide (already exists ✅)

**Issue:**

While the migration guide exists at [`docs/migration.md`](docs/migration.md), the package-level documentation and root README may not adequately cover the new Next.js support features. Users need clear, accessible documentation to:

- Quickly understand that Collie supports Next.js
- Learn how to set up Collie in new and existing Next.js projects
- Understand the differences between Vite and Next.js integration
- Find troubleshooting guidance

**Implementation Steps:**

1. Review and update [`README.md`](README.md):
   - Add Next.js to the supported frameworks section
   - Include a quick-start example for Next.js setup
   - Link to detailed Next.js documentation
   - Show example of creating a Next.js project with `collie create`

2. Review and update [`packages/cli/README.md`](packages/cli/README.md):
   - Document `collie create --template nextjs` command and options
   - Document `collie init --nextjs` command for existing projects
   - Include examples of both new project creation and existing project integration
   - Add troubleshooting section for common Next.js setup issues

3. Review and update [`packages/next/README.md`](packages/next/README.md):
   - Verify that `withCollie()` API is documented clearly
   - Include configuration options and examples
   - Document how it integrates with Next.js webpack config
   - Add examples for both JavaScript and TypeScript configs
   - Include troubleshooting for webpack-related issues

4. Review [`packages/compiler/README.md`](packages/compiler/README.md):
   - Ensure it's framework-agnostic (doesn't assume Vite)
   - Verify API documentation is accurate
   - Add note about framework integrations (link to @collie-lang/vite and @collie-lang/next)

5. Cross-link documentation:
   - Ensure all READMEs link to relevant packages
   - Link to [`docs/migration.md`](docs/migration.md) where appropriate
   - Maintain consistency in examples and terminology

**Acceptance Criteria:**

- [ ] Root [`README.md`](README.md) mentions Next.js support prominently
- [ ] Root README includes quick-start for Next.js setup
- [ ] [`packages/cli/README.md`](packages/cli/README.md) documents all Next.js-related commands
- [ ] [`packages/next/README.md`](packages/next/README.md) provides clear `withCollie()` API documentation
- [ ] All package READMEs are accurate and up-to-date
- [ ] Documentation includes working code examples
- [ ] Cross-links between documents are functional and helpful
- [ ] User can follow documentation to set up Collie with Next.js without external help

---

## Next Steps

To complete the Collie v3 implementation:

1. **Immediate Priority**: Implement Task #1 (Next.js templates) to enable full `collie create` functionality
2. **Follow-up**: Implement Task #2 (Package integration) to fix architectural inconsistency
3. **Polish**: Complete Tasks #3 and #4 to improve user experience and documentation

Once all tasks are complete, the Collie v3 implementation will achieve 100% feature parity with the requirements specified in [`cli-report.md`](cli-report.md) and [`nextjs-plan.md`](nextjs-plan.md).

---

## Reference Documents

- [`cli-report.md`](cli-report.md) - CLI Features 1-6 specification
- [`nextjs-plan.md`](nextjs-plan.md) - Next.js Integration Phases 1-5 specification
- [`docs/migration.md`](docs/migration.md) - Migration guide for existing projects
