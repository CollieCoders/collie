# CLI Package Audit: Bundle Size Analysis

**Date:** December 24, 2025  
**Auditor:** Automated Analysis  
**Package:** `@collie-lang/cli`

---

## Executive Summary

The `packages/cli/dist` folder is **47 MB** in size, with the primary bundle files (`index.js` and `index.cjs`) each weighing approximately **9.7 MB**. This is **significantly larger** than other packages in the monorepo:

| Package    | Dist Size |
|------------|-----------|
| **cli**    | **47 MB** |
| compiler   | 372 KB    |
| config     | 48 KB     |
| next       | 36 KB     |
| webpack    | 24 KB     |
| vite       | 28 KB     |

The CLI package is roughly **126x larger** than similar packages, indicating a bundling configuration issue.

---

## Root Cause Analysis

### 1. **TypeScript Compiler Bundled (~23 MB)**

The primary issue is that **the entire TypeScript compiler is being bundled** into the CLI distribution files.

**Why this happens:**
- The CLI depends on `@collie-lang/config` (workspace package)
- `@collie-lang/config` has a **runtime dependency** on `tsx@^4.21.0`
- `tsx` internally depends on the full TypeScript compiler for runtime TS execution
- The current `tsup` configuration in `packages/cli/tsup.config.ts` does **not** externalize dependencies
- tsup bundles all dependencies by default, including the entire TypeScript package (~23 MB)

**Evidence:**
```bash
$ du -sh node_modules/.pnpm/typescript@*/node_modules/typescript
23M    node_modules/.pnpm/typescript@5.9.3/node_modules/typescript

$ grep -c "typescript" packages/cli/dist/index.js
112

$ grep -o "node_modules/.pnpm/[^/]*/node_modules/[^/]*" dist/index.js | sort -u
node_modules/.pnpm/typescript@5.9.3/node_modules/typescript
node_modules/.pnpm/tsx@4.21.0/node_modules/tsx
node_modules/.pnpm/source-map@0.6.1/node_modules/source-map
node_modules/.pnpm/source-map-support@0.5.21/node_modules/source-map-support
```

### 2. **Source Maps (~14 MB each)**

Source map files (`index.js.map` and `index.cjs.map`) are each **14 MB**, contributing another **28 MB** to the dist folder size.

While source maps are valuable for debugging, they significantly inflate the distribution size. Given that the bundle already includes the TypeScript compiler, the source maps are disproportionately large.

### 3. **No Dependency Externalization**

Current `tsup.config.ts`:
```typescript
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,  // ← Generates large source maps
  clean: true,
  splitting: false,
  target: "es2022",
  banner: {
    js: "#!/usr/bin/env node"
  }
  // ❌ No `external` configuration
});
```

Without an `external` array, tsup bundles **all dependencies** into the output files.

---

## Recommended Solutions

### **Option 1: Externalize All Dependencies** ⭐ (Recommended)

Mark all dependencies as external, forcing them to be installed via `node_modules` instead of bundled.

**Changes to `packages/cli/tsup.config.ts`:**
```typescript
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  target: "es2022",
  banner: {
    js: "#!/usr/bin/env node"
  },
  external: [
    // Externalize all workspace dependencies
    "@collie-lang/compiler",
    "@collie-lang/config",
    "@collie-lang/next",
    
    // Externalize all npm dependencies
    "chokidar",
    "diff",
    "fast-glob",
    "prompts",
    "picocolors"
  ],
  noExternal: []  // Explicitly bundle nothing
});
```

**Expected impact:**
- Bundle size: **~9.7 MB → ~100-500 KB** (95%+ reduction)
- Dependencies installed to `node_modules` at runtime
- Faster builds, smaller published package

**Trade-offs:**
- Users must run `npm install` to get dependencies (already standard practice)
- No self-contained single executable

---

### **Option 2: Selective Externalization**

Externalize only heavy dependencies (TypeScript/tsx via config package) while bundling lightweight ones.

**Changes to `packages/cli/tsup.config.ts`:**
```typescript
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  target: "es2022",
  banner: {
    js: "#!/usr/bin/env node"
  },
  external: [
    "@collie-lang/compiler",
    "@collie-lang/config",  // This brings tsx/typescript
    "@collie-lang/next"
  ]
  // picocolors, prompts, fast-glob, diff, chokidar remain bundled
});
```

**Expected impact:**
- Bundle size: **~9.7 MB → ~200-800 KB** (90%+ reduction)
- Smaller than Option 1 but still reasonable
- Fewer external dependencies = slightly easier installation

---

### **Option 3: Disable/Reduce Source Maps**

If keeping dependencies bundled, at least reduce source map overhead.

**Changes to `packages/cli/tsup.config.ts`:**
```typescript
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: false,  // ← Disable source maps entirely
  // OR
  sourcemap: "inline",  // ← Inline source maps (smaller total size)
  clean: true,
  splitting: false,
  target: "es2022",
  banner: {
    js: "#!/usr/bin/env node"
  }
});
```

**Expected impact:**
- Total dist size: **47 MB → 19 MB** (60% reduction from removing `.map` files)
- Bundle files remain 9.7 MB each
- Trade-off: Harder to debug production issues

---

### **Option 4: Re-architect Config Loading** (Long-term)

The root architectural issue is that `@collie-lang/config` uses `tsx` as a **runtime** dependency to load TypeScript config files. This design forces every consumer (including CLI) to bundle or depend on the entire TypeScript toolchain.

**Alternative approach:**
1. **Move `tsx` to `devDependencies`** in `@collie-lang/config`
2. **Require users to compile TS configs** before runtime, OR
3. **Use a lighter TS loader** like `esbuild-register` or `jiti` (much smaller than tsx/TypeScript)
4. **Make TS config support optional** - detect if `tsx` is available, fall back to JS/JSON only

**Example using `jiti` (lightweight alternative):**
```typescript
// Instead of tsx (576 KB + TypeScript dependency)
import { tsImport } from "tsx/esm/api";  // ❌ Heavy

// Use jiti (much lighter, ~50KB, no TypeScript bundled)
import { createJiti } from "jiti";  // ✅ Lightweight
const jiti = createJiti(import.meta.url);
const config = jiti(configPath);
```

**Expected impact:**
- Bundle size: **~9.7 MB → ~100-200 KB** (98%+ reduction)
- No TypeScript runtime dependency
- More complex migration

---

## Comparison of Solutions

| Solution | Bundle Size | Dist Folder | Effort | Best For |
|----------|------------|-------------|--------|----------|
| **Option 1** (Externalize all) | ~100-500 KB | ~1-2 MB | Low | Production use, best practice |
| **Option 2** (Selective) | ~200-800 KB | ~2-3 MB | Low | Balance between size and convenience |
| **Option 3** (No sourcemaps) | 9.7 MB | ~19 MB | Trivial | Quick fix, not recommended |
| **Option 4** (Re-architect) | ~100-200 KB | ~1 MB | High | Long-term sustainability |

---

## Immediate Recommendation

**Implement Option 1 (Externalize Dependencies)** immediately for the following reasons:

1. ✅ **Standard practice** - CLI tools typically externalize dependencies
2. ✅ **95%+ size reduction** with minimal effort
3. ✅ **No breaking changes** - users already run `npm install`
4. ✅ **Faster CI/CD** - smaller artifacts to publish and download
5. ✅ **Better for npm ecosystem** - reduces registry bloat

Additionally, consider **Option 4** (re-architecting config loading) as a medium-term improvement to eliminate the TypeScript runtime dependency entirely.

---

## Implementation Steps

### Step 1: Update CLI tsup config
```bash
# Edit packages/cli/tsup.config.ts
# Add external array (see Option 1 above)
```

### Step 2: Rebuild and verify
```bash
cd packages/cli
pnpm run clean
pnpm run build
ls -lh dist/  # Should see KB instead of MB
```

### Step 3: Test CLI functionality
```bash
# Test all CLI commands still work
pnpm collie --help
pnpm collie create test-project
pnpm collie check "**/*.collie"
pnpm collie format "**/*.collie"
```

### Step 4: Verify published package size
```bash
npm pack --dry-run
# Check that package tarball is < 500 KB
```

### Step 5 (Optional): Tackle config architecture
```bash
# Investigate jiti or esbuild-register as tsx replacement
# Update @collie-lang/config to use lighter TS loader
# Remove tsx from dependencies
```

---

## Notes

- The current 47 MB distribution is **not sustainable** for npm publishing
- Large packages slow down `npm install`, increase CDN costs, and hurt developer experience
- Most CLI tools in the ecosystem are < 1 MB when built correctly
- The issue is **entirely fixable** with configuration changes - no code rewrites needed for Option 1/2

