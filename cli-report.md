# Collie CLI Feature Enhancement Report

## Introduction

This document provides a comprehensive, prioritized list of 12 proposed CLI enhancements for the Collie language toolchain. Currently, the Collie CLI ([`packages/cli/src/index.ts`](packages/cli/src/index.ts)) only supports `collie init` for Vite projects. These enhancements aim to make Collie a standalone, production-ready development tool that works with any build system and provides a complete developer experience.

Each feature is documented with complete implementation specifications, allowing AI coding assistants to implement them directly from this documentation. Features are ordered by priority, with the most impactful improvements listed first.

**Target Users**: Frontend developers using React with Vite, Next.js, or other build systems who want to leverage Collie's indentation-based templating syntax.

**Current State**: Collie works as a Vite plugin with a single `collie init` command. The compiler API ([`compile()`](packages/compiler/src/index.ts:24-38)) and parser ([`parse()`](packages/compiler/src/parser.ts:60)) are available but not exposed via CLI.

---

## Priority Legend

Features are categorized by priority level based on user impact, ecosystem needs, and implementation complexity:

- 🔴 **Very High Priority**: Critical missing functionality that blocks key use cases or fixes broken promises in documentation
- 🟠 **High Priority**: Significant value-add features that improve developer experience and expand ecosystem compatibility
- 🟡 **Medium Priority**: Quality-of-life improvements that enhance productivity and professional polish
- 🟢 **Low Priority**: Advanced or niche features that serve specialized use cases

---

## Feature #1: `collie format` - Code Formatter

**Status**: ✅ Complete

**Priority**: 🔴 Very High

### Value Proposition

The README currently promises a "Collie formatter" that doesn't exist, creating confusion and broken expectations. A formatter is essential for teams to maintain consistent code style, integrate with editors, and enforce standards in CI/CD pipelines. This feature delivers on the documented promise and provides critical tooling for professional development workflows.

### Command Signature

```bash
collie format [files...] [options]

# Format specific files
collie format src/**/*.collie

# Format and write changes
collie format src/**/*.collie --write

# Check formatting without modifying (for CI)
collie format src/**/*.collie --check

# Show diff of changes
collie format src/**/*.collie --diff
```

**Options**:
- `--write`, `-w`: Write formatted output to files (default: print to stdout)
- `--check`, `-c`: Exit with code 1 if files aren't formatted (no writes)
- `--diff`, `-d`: Show colorized diff of changes
- `--indent <spaces>`: Indentation width (default: 2)

### Use Cases

1. **Pre-commit hooks**: Format code automatically before commits with tools like husky
2. **CI/CD validation**: Ensure all code follows style guidelines with `--check`
3. **Editor integration**: Enable "format on save" in VS Code, Vim, etc.
4. **Team standardization**: Eliminate style debates and maintain consistency
5. **Codebase cleanup**: Bulk format existing files with one command

### Implementation Requirements

**Files to Create/Modify**:
- Modify [`packages/cli/src/index.ts`](packages/cli/src/index.ts) - Add `format` command handler
- Create `packages/cli/src/formatter.ts` - Core formatting logic

**Dependencies**:
```bash
pnpm add -D glob fast-glob picocolors diff
```

**Algorithm**:

1. **Parse input**: Use existing [`parse()`](packages/compiler/src/parser.ts:60) from [`@collie-lang/compiler`](packages/compiler/src/index.ts)
2. **AST traversal**: Walk the AST to reconstruct formatted source
3. **Indentation normalization**: Ensure consistent 2-space indentation
4. **Whitespace handling**: 
   - Remove trailing whitespace
   - Ensure single blank line at EOF
   - Normalize line endings to `\n`
5. **Attribute formatting**:
   - Sort attributes alphabetically (class first, then others)
   - Single space between attributes
   - Consistent quote style (double quotes)
6. **Write/check/diff**: Based on flags, write to file, check differences, or display diff

**Integration Points**:
- Use [`parse()`](packages/compiler/src/parser.ts:60) from `@collie-lang/compiler`
- Use [`Diagnostic`](packages/compiler/src/diagnostics.ts:40-46) interface for error reporting
- Reuse [`detectPackageManager()`](packages/cli/src/index.ts:83) for consistent tooling
- Use `picocolors` (already imported in CLI) for colored output

**Input/Output**:
- **Input**: Glob patterns matching `.collie` files, or individual file paths
- **Output**: 
  - Default: Formatted code to stdout
  - `--write`: Modified files on disk
  - `--check`: Exit code 0 (clean) or 1 (needs formatting)
  - `--diff`: Colorized unified diff format

**Error Handling**:
- If parsing fails, print diagnostic errors and skip file
- If file doesn't exist, print error and continue with next file
- If no files match glob, print "No files found"
- For `--check`, collect all unformatted files and report at end

### Code Examples

**Command Usage**:
```bash
# Format all Collie files and show output
collie format src/**/*.collie

# Format in-place (modify files)
collie format src/**/*.collie --write

# CI check (exits 1 if not formatted)
collie format src/**/*.collie --check
```

**Expected Output** (`--write` mode):
```
Formatting src/components/Button.collie... ✔
Formatting src/components/Card.collie... ✔
Formatted 2 files
```

**Expected Output** (`--check` mode when files need formatting):
```
src/components/Button.collie needs formatting
src/components/Card.collie is formatted

✖ 1 file needs formatting
Run: collie format --write to fix
```

**Core Implementation** (`packages/cli/src/formatter.ts`):
```typescript
import { parse } from "@collie-lang/compiler";
import type { RootNode, Node } from "@collie-lang/compiler/src/ast";
import fs from "node:fs/promises";

export interface FormatOptions {
  indent?: number;
}

export function format(source: string, options: FormatOptions = {}): string {
  const indent = options.indent ?? 2;
  const parseResult = parse(source);
  
  // If parse errors, return original (formatter can't fix invalid syntax)
  if (parseResult.diagnostics.some(d => d.severity === "error")) {
    return source;
  }
  
  return formatNode(parseResult.root, 0, indent);
}

function formatNode(node: Node, level: number, indentSize: number): string {
  const indentStr = " ".repeat(level * indentSize);
  
  switch (node.type) {
    case "Root":
      return node.children.map(child => formatNode(child, level, indentSize)).join("\n") + "\n";
      
    case "Element": {
      let line = `${indentStr}${node.tag}`;
      
      // Sort attributes: class first, then alphabetically
      const attrs = [...node.attributes].sort((a, b) => {
        if (a.name === "class") return -1;
        if (b.name === "class") return 1;
        return a.name.localeCompare(b.name);
      });
      
      for (const attr of attrs) {
        line += ` ${attr.name}="${attr.value}"`;
      }
      
      const children = node.children
        .map(child => formatNode(child, level + 1, indentSize))
        .join("\n");
      
      return children ? `${line}\n${children}` : line;
    }
    
    case "Text":
      return `${indentStr}${node.content}`;
      
    // Handle other node types (Component, Props, For, etc.)
    default:
      return "";
  }
}

export async function formatFile(
  filepath: string,
  options: FormatOptions = {}
): Promise<{ changed: boolean; formatted: string }> {
  const original = await fs.readFile(filepath, "utf-8");
  const formatted = format(original, options);
  return {
    changed: original !== formatted,
    formatted
  };
}
```

**CLI Integration** (add to [`packages/cli/src/index.ts`](packages/cli/src/index.ts)):
```typescript
import { glob } from "fast-glob";
import { format, formatFile } from "./formatter";
import pc from "picocolors";

// Add to main() function after init command
if (cmd === "format") {
  await runFormat(args.slice(1));
  return;
}

async function runFormat(args: string[]): Promise<void> {
  const flags = {
    write: args.includes("--write") || args.includes("-w"),
    check: args.includes("--check") || args.includes("-c"),
    diff: args.includes("--diff") || args.includes("-d")
  };
  
  const patterns = args.filter(a => !a.startsWith("--") && !a.startsWith("-"));
  if (patterns.length === 0) {
    throw new Error("No file patterns provided. Usage: collie format <files...>");
  }
  
  const files = await glob(patterns, { absolute: false });
  if (files.length === 0) {
    console.log(pc.yellow("No .collie files found"));
    return;
  }
  
  let needsFormatting = 0;
  
  for (const file of files) {
    const result = await formatFile(file);
    
    if (flags.check) {
      if (result.changed) {
        console.log(pc.red(`${file} needs formatting`));
        needsFormatting++;
      } else {
        console.log(pc.green(`${file} is formatted`));
      }
    } else if (flags.write) {
      if (result.changed) {
        await fs.writeFile(file, result.formatted, "utf-8");
        console.log(pc.green(`Formatting ${file}... ✔`));
      }
    } else {
      console.log(result.formatted);
    }
  }
  
  if (flags.check && needsFormatting > 0) {
    console.log(pc.red(`\n✖ ${needsFormatting} file(s) need formatting`));
    console.log("Run: collie format --write to fix");
    process.exit(1);
  }
}
```

### Testing Requirements

1. **Unit tests** (`packages/cli/tests/formatter.test.ts`):
   - Test indentation normalization (2-space default)
   - Test attribute sorting (class first, then alphabetical)
   - Test whitespace cleanup (trailing spaces, EOF newline)
   - Test that invalid syntax returns original source
   
2. **Integration tests**:
   - Test `--write` flag modifies files correctly
   - Test `--check` flag exits with code 1 when unformatted
   - Test `--check` flag exits with code 0 when formatted
   - Test glob pattern matching
   - Test handling of nonexistent files
   
3. **Snapshot tests**:
   - Create fixtures with unformatted Collie code
   - Assert formatted output matches expected snapshots

### Estimated Effort

**3-5 hours** for a developer with TypeScript experience:
- 1-2 hours: Core formatting logic (AST traversal and reconstruction)
- 1 hour: CLI integration and flag handling
- 1 hour: File I/O, glob matching, and error handling
- 1 hour: Tests and documentation

### Dependencies

**Prerequisites**: None - this feature is standalone

**Blocks**: None, though it's complementary to Feature #4 (`collie check`)

### Success Criteria

- ✅ `collie format <files>` prints formatted code to stdout
- ✅ `collie format <files> --write` modifies files in-place
- ✅ `collie format <files> --check` exits with code 1 if any file needs formatting
- ✅ Formatted output has consistent 2-space indentation
- ✅ Attributes are sorted (class first, then alphabetically)
- ✅ Trailing whitespace is removed
- ✅ Files end with single newline
- ✅ Invalid syntax doesn't crash; skips file with error message
- ✅ Works with glob patterns to match multiple files
- ✅ Can be used in CI pipelines (via `--check` flag)

---

## Feature #2: `collie watch` - File Watcher for Continuous Compilation

**Status**: ✅ Complete

**Priority**: 🔴 Very High

### Value Proposition

Non-Vite users (Next.js, Webpack, Parcel, custom build systems) currently have no way to use Collie without manually compiling files. A watch mode enables real-time compilation during development, making Collie usable with any build system. This unlocks the entire React ecosystem, not just Vite projects.

### Command Signature

```bash
collie watch [input] [options]

# Watch a directory
collie watch src/components

# Watch with custom output directory
collie watch src/components --outDir dist

# Watch with source maps
collie watch src/components --sourcemap

# Watch specific file extensions
collie watch src --ext .collie
```

**Options**:
- `--outDir <dir>`: Output directory (default: same as input, replaces `.collie` with `.tsx`)
- `--sourcemap`: Generate source maps
- `--ext <extension>`: File extension to watch (default: `.collie`)
- `--jsx <runtime>`: JSX runtime - `automatic` or `classic` (default: `automatic`)
- `--verbose`, `-v`: Log all compilation events

### Use Cases

1. **Next.js development**: Watch and compile Collie files alongside Next.js dev server
2. **Custom build systems**: Use Collie with any bundler that doesn't have a plugin
3. **Standalone development**: Work on Collie components without running a full dev server
4. **Library development**: Build Collie component libraries for distribution
5. **Testing workflows**: Auto-compile for Jest/Vitest that import Collie files

### Implementation Requirements

**Files to Create/Modify**:
- Modify [`packages/cli/src/index.ts`](packages/cli/src/index.ts) - Add `watch` command
- Create `packages/cli/src/watcher.ts` - Watch mode implementation

**Dependencies**:
```bash
pnpm add -D chokidar
```

**Algorithm**:

1. **Initialize chokidar**: Watch specified directory/files for `.collie` files
2. **On file change/add**:
   - Read file contents
   - Call [`compile()`](packages/compiler/src/index.ts:24-38) from `@collie-lang/compiler`
   - Determine output path (replace `.collie` with `.tsx`, respect `--outDir`)
   - Write compiled `.tsx` file
   - Log success or errors using [`Diagnostic`](packages/compiler/src/diagnostics.ts:40-46)
3. **On file delete**: Remove corresponding `.tsx` file
4. **Error handling**: Continue watching even if compilation fails

**Integration Points**:
- Use [`compile()`](packages/compiler/src/index.ts:24-38) from `@collie-lang/compiler`
- Use [`CompileOptions`](packages/compiler/src/index.ts:12-16) interface
- Use [`Diagnostic`](packages/compiler/src/diagnostics.ts:40-46) for error reporting
- Reuse error formatting from existing CLI

**Input/Output**:
- **Input**: Directory path or glob pattern
- **Output**: `.tsx` files written to disk, console logs for each compilation

**Error Handling**:
- If compilation fails, log errors but continue watching
- If output directory can't be created, fail with clear message
- If input directory doesn't exist, fail immediately
- Graceful shutdown on SIGINT (Ctrl+C)

### Code Examples

**Command Usage**:
```bash
# Watch src/components, output to same directory
collie watch src/components

# Watch with custom output directory
collie watch src/components --outDir dist/compiled

# Watch with source maps and verbose logging
collie watch src --sourcemap --verbose
```

**Expected Output**:
```
Watching src/components for changes...

[12:34:56] Compiled src/components/Button.collie → src/components/Button.tsx
[12:34:57] Compiled src/components/Card.collie → src/components/Card.tsx

Watching for file changes...

[12:35:10] Changed: src/components/Button.collie
[12:35:10] Compiled src/components/Button.collie → src/components/Button.tsx
```

**Core Implementation** (`packages/cli/src/watcher.ts`):
```typescript
import chokidar from "chokidar";
import { compile, type CompileOptions } from "@collie-lang/compiler";
import fs from "node:fs/promises";
import path from "node:path";
import pc from "picocolors";

export interface WatchOptions {
  outDir?: string;
  sourcemap?: boolean;
  ext?: string;
  jsxRuntime?: "automatic" | "classic";
  verbose?: boolean;
}

export async function watch(inputPath: string, options: WatchOptions = {}): Promise<void> {
  const ext = options.ext ?? ".collie";
  const pattern = `${inputPath}/**/*${ext}`;
  
  console.log(pc.cyan(`Watching ${inputPath} for changes...\n`));
  
  const watcher = chokidar.watch(pattern, {
    ignored: /node_modules/,
    persistent: true,
    ignoreInitial: false
  });
  
  watcher.on("add", (filepath) => compileFile(filepath, inputPath, options));
  watcher.on("change", (filepath) => {
    if (options.verbose) {
      console.log(pc.gray(`[${getTimestamp()}] Changed: ${filepath}`));
    }
    compileFile(filepath, inputPath, options);
  });
  watcher.on("unlink", (filepath) => deleteCompiledFile(filepath, inputPath, options));
  
  watcher.on("ready", () => {
    console.log(pc.green("\nWatching for file changes...\n"));
  });
  
  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log(pc.yellow("\n\nStopping watch mode..."));
    watcher.close();
    process.exit(0);
  });
}

async function compileFile(
  filepath: string,
  inputBase: string,
  options: WatchOptions
): Promise<void> {
  try {
    const source = await fs.readFile(filepath, "utf-8");
    const componentName = path.basename(filepath, path.extname(filepath));
    
    const compileOptions: CompileOptions = {
      filename: filepath,
      componentNameHint: componentName,
      jsxRuntime: options.jsxRuntime ?? "automatic"
    };
    
    const result = compile(source, compileOptions);
    
    // Check for errors
    const errors = result.diagnostics.filter(d => d.severity === "error");
    if (errors.length > 0) {
      console.error(pc.red(`[${getTimestamp()}] Error compiling ${filepath}:`));
      for (const err of errors) {
        console.error(pc.red(`  ${err.message}`));
      }
      return;
    }
    
    // Determine output path
    const outputPath = getOutputPath(filepath, inputBase, options);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, result.code, "utf-8");
    
    console.log(pc.green(`[${getTimestamp()}] Compiled ${filepath} → ${outputPath}`));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(pc.red(`[${getTimestamp()}] Error: ${message}`));
  }
}

async function deleteCompiledFile(
  filepath: string,
  inputBase: string,
  options: WatchOptions
): Promise<void> {
  try {
    const outputPath = getOutputPath(filepath, inputBase, options);
    await fs.unlink(outputPath);
    console.log(pc.yellow(`[${getTimestamp()}] Deleted ${outputPath}`));
  } catch (error) {
    // File might not exist, ignore
  }
}

function getOutputPath(filepath: string, inputBase: string, options: WatchOptions): string {
  const ext = options.ext ?? ".collie";
  const relative = path.relative(inputBase, filepath);
  const withoutExt = relative.replace(new RegExp(`${ext}$`), ".tsx");
  
  if (options.outDir) {
    return path.join(options.outDir, withoutExt);
  }
  
  return path.join(inputBase, withoutExt);
}

function getTimestamp(): string {
  const now = new Date();
  return now.toLocaleTimeString("en-US", { hour12: false });
}
```

**CLI Integration** (add to [`packages/cli/src/index.ts`](packages/cli/src/index.ts)):
```typescript
import { watch } from "./watcher";

// Add to main() function
if (cmd === "watch") {
  const inputPath = args[1];
  if (!inputPath) {
    throw new Error("No input path provided. Usage: collie watch <path>");
  }
  
  const options = {
    outDir: getFlag(args, "--outDir"),
    sourcemap: args.includes("--sourcemap"),
    ext: getFlag(args, "--ext") ?? ".collie",
    jsxRuntime: (getFlag(args, "--jsx") as "automatic" | "classic") ?? "automatic",
    verbose: args.includes("--verbose") || args.includes("-v")
  };
  
  await watch(inputPath, options);
  return;
}

function getFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index !== -1 && args[index + 1] ? args[index + 1] : undefined;
}
```

### Testing Requirements

1. **Unit tests** (`packages/cli/tests/watcher.test.ts`):
   - Test output path calculation (same dir vs --outDir)
   - Test file extension handling
   - Test timestamp formatting
   
2. **Integration tests**:
   - Create temp directory with `.collie` files
   - Start watcher programmatically
   - Modify file and assert `.tsx` is updated
   - Delete file and assert `.tsx` is removed
   - Test error handling (invalid syntax)
   
3. **Manual testing**:
   - Run `collie watch` in Next.js app
   - Verify hot reload works with Next.js dev server
   - Test Ctrl+C graceful shutdown

### Estimated Effort

**4-6 hours**:
- 2 hours: Core watch logic with chokidar
- 1 hour: Output path handling and directory creation
- 1 hour: Error handling and logging
- 1-2 hours: Testing and edge cases

### Dependencies

**Prerequisites**: None - standalone feature

**Complements**: Feature #3 (`collie build`) - watch is for development, build is for production

### Success Criteria

- ✅ `collie watch <dir>` watches directory and compiles on changes
- ✅ Initial compilation happens for all existing `.collie` files
- ✅ File changes trigger recompilation
- ✅ File deletions remove corresponding `.tsx` files
- ✅ `--outDir` option writes to separate directory
- ✅ Compilation errors are logged but don't stop watching
- ✅ Ctrl+C gracefully shuts down watcher
- ✅ Works with Next.js dev server (compiled files are picked up)
- ✅ Timestamps are shown for each compilation event
- ✅ `--verbose` flag shows additional logging

---

## Feature #3: `collie build` - Standalone Compilation Command

**Status**: ✅ Complete

**Priority**: 🔴 Very High

### Value Proposition

Enables one-off compilation for production builds, CI/CD pipelines, and any workflow that needs deterministic, non-watch compilation. This is the foundation for using Collie with any build system, not just Vite. Essential for library authors and teams with custom build pipelines.

### Command Signature

```bash
collie build [input] [options]

# Compile a single file
collie build src/Button.collie

# Compile a directory
collie build src/components

# Compile with output directory
collie build src --outDir dist

# Compile with source maps
collie build src --sourcemap

# Compile with classic JSX runtime
collie build src --jsx classic
```

**Options**:
- `<input>`: File or directory to compile (required)
- `--outDir <dir>`: Output directory (default: same as input, replaces `.collie` with `.tsx`)
- `--sourcemap`: Generate source maps
- `--jsx <runtime>`: JSX runtime - `automatic` or `classic` (default: `automatic`)
- `--verbose`, `-v`: Log all compilation events
- `--quiet`, `-q`: Suppress output except errors

### Use Cases

1. **Production builds**: Compile all Collie files before bundling
2. **CI/CD pipelines**: Pre-compile as a build step
3. **Library publishing**: Compile Collie to TSX for npm package distribution
4. **Static analysis**: Generate TSX files for type checking
5. **Migration**: Convert Collie files to TSX for gradual migration

### Implementation Requirements

**Files to Create/Modify**:
- Modify [`packages/cli/src/index.ts`](packages/cli/src/index.ts) - Add `build` command
- Create `packages/cli/src/builder.ts` - Build implementation (can reuse logic from watcher)

**Dependencies**:
```bash
pnpm add -D fast-glob
```

**Algorithm**:

1. **Resolve input**: Determine if input is file or directory
2. **Find files**: 
   - If file: compile single file
   - If directory: use `fast-glob` to find all `.collie` files recursively
3. **Compile each file**:
   - Call [`compile()`](packages/compiler/src/index.ts:24-38) from `@collie-lang/compiler`
   - Collect diagnostics
   - Write output `.tsx` file
4. **Report results**: 
   - Log summary (X files compiled, Y errors)
   - Exit with code 1 if any errors, 0 if success

**Integration Points**:
- Use [`compile()`](packages/compiler/src/index.ts:24-38) from `@collie-lang/compiler`
- Use [`CompileOptions`](packages/compiler/src/index.ts:12-16) interface
- Reuse output path logic from Feature #2 if implemented, otherwise implement here
- Use `picocolors` for colored output

**Input/Output**:
- **Input**: File path or directory path
- **Output**: `.tsx` files in output directory, summary to console

**Error Handling**:
- If input doesn't exist, fail immediately with clear message
- If compilation fails for a file, collect error and continue with other files
- After all files, if any had errors, exit with code 1
- If output directory creation fails, fail immediately

### Code Examples

**Command Usage**:
```bash
# Compile single file
collie build src/Button.collie

# Compile directory
collie build src/components

# Compile to different directory
collie build src/components --outDir dist/compiled

# Production build with source maps
collie build src --outDir dist --sourcemap
```

**Expected Output**:
```
Compiling src/components...

✔ src/components/Button.collie → src/components/Button.tsx
✔ src/components/Card.collie → src/components/Card.tsx
✔ src/components/Modal.collie → src/components/Modal.tsx

Successfully compiled 3 files
```

**Expected Output (with errors)**:
```
Compiling src/components...

✔ src/components/Button.collie → src/components/Button.tsx
✖ src/components/Card.collie
  Error: Invalid indentation at line 5
✔ src/components/Modal.collie → src/components/Modal.tsx

Compiled 2 files with 1 error
```

**Core Implementation** (`packages/cli/src/builder.ts`):
```typescript
import { compile, type CompileOptions, type Diagnostic } from "@collie-lang/compiler";
import { glob } from "fast-glob";
import fs from "node:fs/promises";
import path from "node:path";
import pc from "picocolors";
import { existsSync, statSync } from "node:fs";

export interface BuildOptions {
  outDir?: string;
  sourcemap?: boolean;
  jsxRuntime?: "automatic" | "classic";
  verbose?: boolean;
  quiet?: boolean;
}

export interface BuildResult {
  totalFiles: number;
  successfulFiles: number;
  errors: Array<{ file: string; diagnostics: Diagnostic[] }>;
}

export async function build(input: string, options: BuildOptions = {}): Promise<BuildResult> {
  // Validate input
  if (!existsSync(input)) {
    throw new Error(`Input path does not exist: ${input}`);
  }
  
  // Determine if input is file or directory
  const stats = statSync(input);
  const files = stats.isDirectory()
    ? await glob("**/*.collie", { cwd: input, absolute: false })
    : [path.basename(input)];
  
  const baseDir = stats.isDirectory() ? input : path.dirname(input);
  
  if (!options.quiet) {
    console.log(pc.cyan(`Compiling ${input}...\n`));
  }
  
  const result: BuildResult = {
    totalFiles: files.length,
    successfulFiles: 0,
    errors: []
  };
  
  for (const file of files) {
    const filepath = stats.isDirectory() ? path.join(input, file) : input;
    const compiled = await compileSingleFile(filepath, baseDir, options);
    
    if (compiled.success) {
      result.successfulFiles++;
      if (!options.quiet) {
        console.log(pc.green(`✔ ${filepath} → ${compiled.outputPath}`));
      }
    } else {
      result.errors.push({
        file: filepath,
        diagnostics: compiled.diagnostics
      });
      
      if (!options.quiet) {
        console.log(pc.red(`✖ ${filepath}`));
        for (const diag of compiled.diagnostics) {
          console.log(pc.red(`  ${diag.message}`));
        }
      }
    }
  }
  
  // Print summary
  if (!options.quiet) {
    console.log("");
    if (result.errors.length === 0) {
      console.log(pc.green(`Successfully compiled ${result.totalFiles} file(s)`));
    } else {
      console.log(pc.red(
        `Compiled ${result.successfulFiles} file(s) with ${result.errors.length} error(s)`
      ));
    }
  }
  
  return result;
}

interface CompileFileResult {
  success: boolean;
  outputPath?: string;
  diagnostics: Diagnostic[];
}

async function compileSingleFile(
  filepath: string,
  baseDir: string,
  options: BuildOptions
): Promise<CompileFileResult> {
  try {
    const source = await fs.readFile(filepath, "utf-8");
    const componentName = path.basename(filepath, path.extname(filepath));
    
    const compileOptions: CompileOptions = {
      filename: filepath,
      componentNameHint: componentName,
      jsxRuntime: options.jsxRuntime ?? "automatic"
    };
    
    const result = compile(source, compileOptions);
    
    // Check for errors
    const errors = result.diagnostics.filter(d => d.severity === "error");
    if (errors.length > 0) {
      return { success: false, diagnostics: errors };
    }
    
    // Determine output path
    const outputPath = getOutputPath(filepath, baseDir, options);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, result.code, "utf-8");
    
    // Optionally write source map
    if (options.sourcemap && result.map) {
      await fs.writeFile(`${outputPath}.map`, JSON.stringify(result.map), "utf-8");
    }
    
    return { success: true, outputPath, diagnostics: result.diagnostics };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      diagnostics: [{
        severity: "error",
        message,
        file: filepath
      }]
    };
  }
}

function getOutputPath(filepath: string, baseDir: string, options: BuildOptions): string {
  const relative = path.relative(baseDir, filepath);
  const withoutExt = relative.replace(/\.collie$/, ".tsx");
  
  if (options.outDir) {
    return path.join(options.outDir, withoutExt);
  }
  
  return path.join(baseDir, withoutExt);
}
```

**CLI Integration** (add to [`packages/cli/src/index.ts`](packages/cli/src/index.ts)):
```typescript
import { build } from "./builder";

// Add to main() function
if (cmd === "build") {
  const inputPath = args[1];
  if (!inputPath) {
    throw new Error("No input path provided. Usage: collie build <path>");
  }
  
  const options = {
    outDir: getFlag(args, "--outDir"),
    sourcemap: args.includes("--sourcemap"),
    jsxRuntime: (getFlag(args, "--jsx") as "automatic" | "classic") ?? "automatic",
    verbose: args.includes("--verbose") || args.includes("-v"),
    quiet: args.includes("--quiet") || args.includes("-q")
  };
  
  const result = await build(inputPath, options);
  
  // Exit with error code if compilation failed
  if (result.errors.length > 0) {
    process.exit(1);
  }
  
  return;
}

function getFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index !== -1 && args[index + 1] ? args[index + 1] : undefined;
}
```

### Testing Requirements

1. **Unit tests** (`packages/cli/tests/builder.test.ts`):
   - Test single file compilation
   - Test directory compilation
   - Test output path calculation
   - Test error collection
   
2. **Integration tests**:
   - Create temp directory with valid/invalid `.collie` files
   - Run build and assert output files exist
   - Test `--outDir` creates correct structure
   - Test exit code is 1 when errors occur
   - Test exit code is 0 when successful
   
3. **CI test**:
   - Add to GitHub Actions: compile example files as part of CI

### Estimated Effort

**3-4 hours**:
- 1 hour: Core build logic (reuse from watch if available)
- 1 hour: Glob pattern handling and directory traversal
- 1 hour: Error collection and reporting
- 1 hour: Testing and documentation

### Dependencies

**Prerequisites**: None - standalone feature

**Relationship**: Feature #2 (`watch`) can reuse code from this feature

### Success Criteria

- ✅ `collie build <file>` compiles single file
- ✅ `collie build <dir>` compiles all `.collie` files in directory recursively
- ✅ `--outDir` option writes to separate directory preserving structure
- ✅ Compilation errors are collected and reported
- ✅ Exit code is 1 if any file has errors, 0 if all succeed
- ✅ `--sourcemap` option generates source map files
- ✅ `--jsx` option controls JSX runtime (automatic/classic)
- ✅ `--quiet` suppresses all output except errors
- ✅ Summary shows total files and error count
- ✅ Works in CI/CD pipelines (deterministic, proper exit codes)

---

## Feature #4: `collie check` - Syntax Validation

**Status**: ✅ Complete

**Priority**: 🟠 High

### Value Proposition

Enables fast syntax checking without code generation, perfect for CI/CD pipelines, pre-commit hooks, and editor integrations. Provides immediate feedback on syntax errors, improving the developer experience and catching issues before they reach production.

### Command Signature

```bash
collie check [files...] [options]

# Check specific files
collie check src/**/*.collie

# Check with detailed diagnostics
collie check src/**/*.collie --verbose

# Machine-readable output (JSON)
collie check src/**/*.collie --format json
```

**Options**:
- `--verbose`, `-v`: Show detailed diagnostic information including warnings
- `--format <format>`: Output format - `text` or `json` (default: `text`)
- `--no-warnings`: Only report errors, suppress warnings
- `--max-warnings <n>`: Fail if more than N warnings (default: unlimited)

### Use Cases

1. **CI/CD pipelines**: Fast syntax validation as a build step
2. **Pre-commit hooks**: Block commits with syntax errors
3. **Editor integration**: Show real-time syntax errors in IDEs
4. **Code review**: Validate syntax before merging PRs
5. **Learning**: Help new users understand Collie syntax errors

### Implementation Requirements

**Files to Create/Modify**:
- Modify [`packages/cli/src/index.ts`](packages/cli/src/index.ts) - Add `check` command
- Create `packages/cli/src/checker.ts` - Check implementation

**Dependencies**:
```bash
pnpm add -D fast-glob
```

**Algorithm**:

1. **Find files**: Use `fast-glob` to match file patterns
2. **Parse each file**: Call [`parse()`](packages/compiler/src/parser.ts:60) from `@collie-lang/compiler`
3. **Collect diagnostics**: Aggregate all [`Diagnostic`](packages/compiler/src/diagnostics.ts:40-46) results
4. **Format output**:
   - Text mode: Pretty-print diagnostics with color and source context
   - JSON mode: Output machine-readable JSON for tools
5. **Exit code**:
   - 0: No errors (warnings OK unless `--max-warnings` exceeded)
   - 1: Syntax errors found

**Integration Points**:
- Use [`parse()`](packages/compiler/src/parser.ts:60) from `@collie-lang/compiler`
- Use [`Diagnostic`](packages/compiler/src/diagnostics.ts:40-46) interface
- Use [`DiagnosticCode`](packages/compiler/src/diagnostics.ts:3) for error classification
- Use `picocolors` for colored terminal output

**Input/Output**:
- **Input**: Glob patterns matching `.collie` files
- **Output**: 
  - Text: Formatted diagnostics with file location, line numbers, error messages
  - JSON: Structured diagnostic data for tooling integration

**Error Handling**:
- If no files match pattern, exit with error
- If file can't be read, report as error and continue
- Parse errors are collected and reported, not thrown

### Code Examples

**Command Usage**:
```bash
# Check all Collie files
collie check src/**/*.collie

# Check with verbose output
collie check src/**/*.collie --verbose

# CI mode: fail on warnings
collie check src/**/*.collie --max-warnings 0

# Machine-readable output
collie check src/**/*.collie --format json
```

**Expected Output (text mode, no errors)**:
```
Checking 12 files...

✔ All files passed validation
```

**Expected Output (text mode, with errors)**:
```
Checking 3 files...

src/components/Button.collie:5:3
  error COLLIE201: Invalid indentation. Expected 2 spaces but got 3
  
src/components/Card.collie:12:7
  error COLLIE102: Missing closing tag for element 'div'

✖ Found 2 errors in 2 files
```

**Expected Output (JSON mode)**:
```json
{
  "totalFiles": 3,
  "filesWithErrors": 2,
  "diagnostics": [
    {
      "severity": "error",
      "code": "COLLIE201",
      "message": "Invalid indentation. Expected 2 spaces but got 3",
      "file": "src/components/Button.collie",
      "span": {
        "start": { "line": 5, "col": 3, "offset": 89 },
        "end": { "line": 5, "col": 6, "offset": 92 }
      }
    },
    {
      "severity": "error",
      "code": "COLLIE102",
      "message": "Missing closing tag for element 'div'",
      "file": "src/components/Card.collie",
      "span": {
        "start": { "line": 12, "col": 7, "offset": 234 },
        "end": { "line": 12, "col": 10, "offset": 237 }
      }
    }
  ]
}
```

**Core Implementation** (`packages/cli/src/checker.ts`):
```typescript
import { parse, type Diagnostic } from "@collie-lang/compiler";
import { glob } from "fast-glob";
import fs from "node:fs/promises";
import pc from "picocolors";

export interface CheckOptions {
  verbose?: boolean;
  format?: "text" | "json";
  noWarnings?: boolean;
  maxWarnings?: number;
}

export interface CheckResult {
  totalFiles: number;
  filesWithErrors: number;
  filesWithWarnings: number;
  diagnostics: Diagnostic[];
}

export async function check(patterns: string[], options: CheckOptions = {}): Promise<CheckResult> {
  const files = await glob(patterns, { absolute: false });
  
  if (files.length === 0) {
    throw new Error("No .collie files found matching pattern");
  }
  
  if (options.format === "text" || !options.format) {
    console.log(pc.cyan(`Checking ${files.length} file(s)...\n`));
  }
  
  const allDiagnostics: Diagnostic[] = [];
  const filesWithErrors = new Set<string>();
  const filesWithWarnings = new Set<string>();
  
  for (const file of files) {
    try {
      const source = await fs.readFile(file, "utf-8");
      const parseResult = parse(source);
      
      // Attach filename to diagnostics
      const diagnostics = parseResult.diagnostics.map(d => ({
        ...d,
        file: d.file || file
      }));
      
      allDiagnostics.push(...diagnostics);
      
      const errors = diagnostics.filter(d => d.severity === "error");
      const warnings = diagnostics.filter(d => d.severity === "warning");
      
      if (errors.length > 0) {
        filesWithErrors.add(file);
      }
      if (warnings.length > 0 && !options.noWarnings) {
        filesWithWarnings.add(file);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      allDiagnostics.push({
        severity: "error",
        message: `Failed to read file: ${message}`,
        file
      });
      filesWithErrors.add(file);
    }
  }
  
  const result: CheckResult = {
    totalFiles: files.length,
    filesWithErrors: filesWithErrors.size,
    filesWithWarnings: filesWithWarnings.size,
    diagnostics: options.noWarnings 
      ? allDiagnostics.filter(d => d.severity === "error")
      : allDiagnostics
  };
  
  // Format output
  if (options.format === "json") {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printTextDiagnostics(result, options);
  }
  
  return result;
}

function printTextDiagnostics(result: CheckResult, options: CheckOptions): void {
  const errors = result.diagnostics.filter(d => d.severity === "error");
  const warnings = result.diagnostics.filter(d => d.severity === "warning");
  
  // Print diagnostics
  for (const diag of result.diagnostics) {
    const icon = diag.severity === "error" ? pc.red("error") : pc.yellow("warning");
    const code = diag.code ? ` ${diag.code}` : "";
    
    if (diag.span) {
      const location = `${diag.file}:${diag.span.start.line}:${diag.span.start.col}`;
      console.log(pc.gray(location));
      console.log(`  ${icon}${code}: ${diag.message}`);
    } else {
      console.log(`${diag.file}`);
      console.log(`  ${icon}${code}: ${diag.message}`);
    }
    console.log("");
  }
  
  // Print summary
  if (errors.length === 0 && warnings.length === 0) {
    console.log(pc.green(`✔ All files passed validation`));
  } else {
    const errorMsg = errors.length > 0 
      ? pc.red(`${errors.length} error(s)`)
      : null;
    const warnMsg = warnings.length > 0 && !options.noWarnings
      ? pc.yellow(`${warnings.length} warning(s)`)
      : null;
    
    const parts = [errorMsg, warnMsg].filter(Boolean);
    console.log(pc.red(`✖ Found ${parts.join(", ")} in ${result.filesWithErrors + result.filesWithWarnings} file(s)`));
  }
}
```

**CLI Integration** (add to [`packages/cli/src/index.ts`](packages/cli/src/index.ts)):
```typescript
import { check } from "./checker";

// Add to main() function
if (cmd === "check") {
  const patterns = args.slice(1).filter(a => !a.startsWith("--") && !a.startsWith("-"));
  
  if (patterns.length === 0) {
    throw new Error("No file patterns provided. Usage: collie check <files...>");
  }
  
  const options = {
    verbose: args.includes("--verbose") || args.includes("-v"),
    format: (getFlag(args, "--format") as "text" | "json") ?? "text",
    noWarnings: args.includes("--no-warnings"),
    maxWarnings: parseInt(getFlag(args, "--max-warnings") ?? "-1")
  };
  
  try {
    const result = await check(patterns, options);
    
    // Exit with error code if errors found or max warnings exceeded
    const errors = result.diagnostics.filter(d => d.severity === "error");
    const warnings = result.diagnostics.filter(d => d.severity === "warning");
    
    if (errors.length > 0) {
      process.exit(1);
    }
    
    if (options.maxWarnings >= 0 && warnings.length > options.maxWarnings) {
      console.error(pc.red(`\nExceeded maximum warnings: ${warnings.length} > ${options.maxWarnings}`));
      process.exit(1);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(pc.red(message));
    process.exit(1);
  }
  
  return;
}
```

### Testing Requirements

1. **Unit tests** (`packages/cli/tests/checker.test.ts`):
   - Test diagnostic collection from multiple files
   - Test error vs warning filtering
   - Test `--no-warnings` flag
   - Test `--max-warnings` threshold
   - Test JSON output format
   
2. **Integration tests**:
   - Create fixtures with valid/invalid Collie files
   - Run check and assert correct exit codes
   - Test glob pattern matching
   - Test JSON output is valid and complete
   
3. **CI integration**:
   - Add `collie check` to GitHub Actions workflow
   - Ensure it fails on syntax errors

### Estimated Effort

**3-4 hours**:
- 1 hour: Core checking logic and diagnostic collection
- 1 hour: Text formatting with colors and pretty printing
- 1 hour: JSON output format
- 1 hour: Testing and edge cases

### Dependencies

**Prerequisites**: None - standalone feature

**Complements**: Feature #1 (`format`) - check validates syntax, format fixes style

### Success Criteria

- ✅ `collie check <files>` validates all matching files
- ✅ Exits with code 0 if no errors, 1 if errors found
- ✅ `--max-warnings` flag enforces warning threshold
- ✅ `--no-warnings` suppresses warning output
- ✅ Text output shows file location, line, column, and error message
- ✅ `--format json` outputs valid, machine-readable JSON
- ✅ Works with glob patterns to match multiple files
- ✅ Can be integrated into CI/CD pipelines
- ✅ Diagnostic codes are included (e.g., COLLIE201)
- ✅ Proper error handling for unreadable files

---

## Feature #5: `collie create` - Project Scaffolding

**Status**: ✅ Complete

**Priority**: 🟠 High

### Value Proposition

Dramatically improves onboarding by creating ready-to-use Collie projects with a single command. New users can start with working examples immediately, reducing setup friction and time-to-first-component. Provides templates for common frameworks (Vite, Next.js) with best practices baked in.

### Command Signature

```bash
collie create [project-name] [options]

# Interactive mode (prompts for all options)
collie create

# Create Vite project
collie create my-app --template vite

# Create Next.js project
collie create my-app --template nextjs

# Create with TypeScript (default)
collie create my-app --typescript

# Create with JavaScript
collie create my-app --javascript
```

**Options**:
- `<project-name>`: Name of the project directory (optional, prompts if not provided)
- `--template <template>`: Project template - `vite`, `nextjs` (default: prompts)
- `--typescript`: Use TypeScript (default)
- `--javascript`: Use JavaScript instead of TypeScript
- `--package-manager <pm>`: Package manager - `npm`, `yarn`, `pnpm` (default: auto-detect)
- `--no-install`: Skip dependency installation
- `--no-git`: Skip git initialization

### Use Cases

1. **Quick start**: New users get started instantly with `collie create my-app`
2. **Framework templates**: Pre-configured Vite or Next.js projects with Collie
3. **Learning**: Example components demonstrate Collie syntax and patterns
4. **Prototyping**: Rapid setup for new ideas and experiments
5. **Teaching**: Instructors create clean environments for students

### Implementation Requirements

**Files to Create/Modify**:
- Modify [`packages/cli/src/index.ts`](packages/cli/src/index.ts) - Add `create` command
- Create `packages/cli/src/creator.ts` - Project scaffolding logic
- Create `packages/cli/templates/` directory with templates:
  - `packages/cli/templates/vite-react-ts/` - Vite + React + TypeScript + Collie
  - `packages/cli/templates/nextjs-ts/` - Next.js + TypeScript + Collie (if Feature #6)

**Dependencies**:
```bash
pnpm add -D prompts
```

**Algorithm**:

1. **Prompt for options** (if not provided via flags):
   - Project name
   - Template (vite, nextjs)
   - Language (TypeScript/JavaScript)
   - Package manager
2. **Validate**:
   - Check if directory already exists
   - Ensure project name is valid (no special characters)
3. **Copy template files**:
   - Recursively copy template directory to target
   - Replace placeholders in files (`__PROJECT_NAME__`, etc.)
4. **Initialize git**: Run `git init` unless `--no-git`
5. **Install dependencies**: Run package manager install unless `--no-install`
6. **Print success message**: Show next steps

**Integration Points**:
- Reuse [`detectPackageManager()`](packages/cli/src/index.ts:83) from existing CLI
- Reuse [`installDevDependencies()`](packages/cli/src/index.ts:89) pattern
- Use existing `picocolors` for colored output
- Use `spawn` for running commands

**Input/Output**:
- **Input**: Project name, template choice, language preference
- **Output**: Complete project directory with dependencies installed

**Error Handling**:
- If directory exists, ask to overwrite or exit
- If template doesn't exist, show available templates
- If dependency installation fails, show error but complete scaffolding
- If git init fails (no git installed), warn but continue

### Code Examples

**Command Usage**:
```bash
# Interactive mode
collie create

# Quick start with defaults
collie create my-collie-app

# Vite + TypeScript (explicit)
collie create my-app --template vite --typescript

# Next.js + JavaScript
collie create my-app --template nextjs --javascript

# Skip installation
collie create my-app --no-install
```

**Expected Output (interactive)**:
```
✨ Create Collie App

? Project name: › my-app
? Select a template: › Vite + React
? Use TypeScript? › Yes
? Package manager: › pnpm

Creating project in ./my-app...

✔ Copied template files
✔ Initialized git repository
✔ Installing dependencies with pnpm...

🎉 Success! Created my-app

Next steps:
  cd my-app
  pnpm dev

Happy coding with Collie! 🐕
```

**Template Structure** (Vite template):
```
packages/cli/templates/vite-react-ts/
├── package.json.template         # With __PROJECT_NAME__ placeholder
├── tsconfig.json
├── vite.config.ts
├── index.html
├── .gitignore
├── README.md
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── collie.d.ts
    └── components/
        └── Welcome.collie        # Example component
```

**Core Implementation** (`packages/cli/src/creator.ts`):
```typescript
import prompts from "prompts";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import pc from "picocolors";

export interface CreateOptions {
  projectName?: string;
  template?: "vite" | "nextjs";
  typescript?: boolean;
  packageManager?: "npm" | "yarn" | "pnpm";
  noInstall?: boolean;
  noGit?: boolean;
}

export async function create(options: CreateOptions = {}): Promise<void> {
  // Prompt for missing options
  const config = await promptForOptions(options);
  
  // Validate
  const targetDir = path.resolve(process.cwd(), config.projectName);
  if (existsSync(targetDir)) {
    const { overwrite } = await prompts({
      type: "confirm",
      name: "overwrite",
      message: `Directory ${config.projectName} already exists. Overwrite?`,
      initial: false
    });
    
    if (!overwrite) {
      console.log(pc.yellow("Cancelled"));
      return;
    }
    
    await fs.rm(targetDir, { recursive: true, force: true });
  }
  
  console.log(pc.cyan(`\nCreating project in ${targetDir}...\n`));
  
  // Copy template
  const templateDir = getTemplateDir(config.template, config.typescript);
  await copyTemplate(templateDir, targetDir, config);
  console.log(pc.green("✔ Copied template files"));
  
  // Initialize git
  if (!config.noGit) {
    try {
      await runCommand("git", ["init"], targetDir);
      console.log(pc.green("✔ Initialized git repository"));
    } catch {
      console.log(pc.yellow("⚠ Failed to initialize git (is git installed?)"));
    }
  }
  
  // Install dependencies
  if (!config.noInstall) {
    console.log(pc.cyan(`✔ Installing dependencies with ${config.packageManager}...`));
    try {
      await installDependencies(config.packageManager, targetDir);
    } catch (error) {
      console.log(pc.yellow("⚠ Failed to install dependencies. Run manually."));
    }
  }
  
  // Success message
  printSuccessMessage(config);
}

async function promptForOptions(options: CreateOptions): Promise<Required<CreateOptions>> {
  const questions = [];
  
  if (!options.projectName) {
    questions.push({
      type: "text",
      name: "projectName",
      message: "Project name:",
      initial: "my-collie-app",
      validate: (value: string) => {
        if (!value.trim()) return "Project name is required";
        if (!/^[a-z0-9-_]+$/i.test(value)) return "Invalid project name";
        return true;
      }
    });
  }
  
  if (!options.template) {
    questions.push({
      type: "select",
      name: "template",
      message: "Select a template:",
      choices: [
        { title: "Vite + React", value: "vite" },
        { title: "Next.js", value: "nextjs" }
      ]
    });
  }
  
  if (options.typescript === undefined) {
    questions.push({
      type: "confirm",
      name: "typescript",
      message: "Use TypeScript?",
      initial: true
    });
  }
  
  if (!options.packageManager) {
    const detected = detectPackageManager(process.cwd());
    questions.push({
      type: "select",
      name: "packageManager",
      message: "Package manager:",
      choices: [
        { title: "pnpm", value: "pnpm" },
        { title: "npm", value: "npm" },
        { title: "yarn", value: "yarn" }
      ],
      initial: detected === "pnpm" ? 0 : detected === "npm" ? 1 : 2
    });
  }
  
  const answers = questions.length > 0 ? await prompts(questions) : {};
  
  // Check if user cancelled (Ctrl+C)
  if (questions.length > 0 && Object.keys(answers).length === 0) {
    console.log(pc.yellow("\nCancelled"));
    process.exit(0);
  }
  
  return {
    projectName: options.projectName || answers.projectName,
    template: options.template || answers.template,
    typescript: options.typescript ?? answers.typescript ?? true,
    packageManager: options.packageManager || answers.packageManager,
    noInstall: options.noInstall ?? false,
    noGit: options.noGit ?? false
  };
}

function getTemplateDir(template: string, typescript: boolean): string {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const suffix = typescript ? "-ts" : "-js";
  const templateName = `${template}-react${suffix}`;
  return path.resolve(dir, "..", "templates", templateName);
}

async function copyTemplate(
  templateDir: string,
  targetDir: string,
  config: Required<CreateOptions>
): Promise<void> {
  await fs.mkdir(targetDir, { recursive: true });
  
  const files = await fs.readdir(templateDir, { recursive: true, withFileTypes: true });
  
  for (const file of files) {
    const sourcePath = path.join(file.path, file.name);
    const relativePath = path.relative(templateDir, sourcePath);
    const targetPath = path.join(targetDir, relativePath);
    
    if (file.isDirectory()) {
      await fs.mkdir(targetPath, { recursive: true });
    } else {
      let content = await fs.readFile(sourcePath, "utf-8");
      
      // Replace placeholders
      if (file.name.endsWith(".template")) {
        content = content.replace(/__PROJECT_NAME__/g, config.projectName);
        const newName = file.name.replace(/\.template$/, "");
        const newPath = path.join(path.dirname(targetPath), newName);
        await fs.writeFile(newPath, content, "utf-8");
      } else {
        await fs.writeFile(targetPath, content, "utf-8");
      }
    }
  }
}

async function installDependencies(packageManager: string, cwd: string): Promise<void> {
  const command = packageManager;
  const args = packageManager === "npm" ? ["install"] : ["install"];
  await runCommand(command, args, cwd);
}

function runCommand(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

function detectPackageManager(cwd: string): "npm" | "yarn" | "pnpm" {
  if (existsSync(path.join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(path.join(cwd, "yarn.lock"))) return "yarn";
  return "npm";
}

function printSuccessMessage(config: Required<CreateOptions>): void {
  const cdCommand = `cd ${config.projectName}`;
  const devCommand = config.packageManager === "npm" 
    ? "npm run dev" 
    : `${config.packageManager} dev`;
  
  console.log(pc.green(`\n🎉 Success! Created ${config.projectName}\n`));
  console.log("Next steps:");
  console.log(pc.cyan(`  ${cdCommand}`));
  if (config.noInstall) {
    console.log(pc.cyan(`  ${config.packageManager} install`));
  }
  console.log(pc.cyan(`  ${devCommand}`));
  console.log(pc.gray("\nHappy coding with Collie! 🐕\n"));
}
```

**CLI Integration** (add to [`packages/cli/src/index.ts`](packages/cli/src/index.ts)):
```typescript
import { create } from "./creator";

// Add to main() function
if (cmd === "create") {
  const projectName = args[1] && !args[1].startsWith("--") ? args[1] : undefined;
  
  const options = {
    projectName,
    template: getFlag(args, "--template") as "vite" | "nextjs" | undefined,
    typescript: args.includes("--javascript") ? false : undefined,
    packageManager: getFlag(args, "--package-manager") as "npm" | "yarn" | "pnpm" | undefined,
    noInstall: args.includes("--no-install"),
    noGit: args.includes("--no-git")
  };
  
  await create(options);
  return;
}
```

### Testing Requirements

1. **Unit tests** (`packages/cli/tests/creator.test.ts`):
   - Test template file copying
   - Test placeholder replacement
   - Test option validation
   
2. **Integration tests**:
   - Create project in temp directory
   - Assert all template files exist
   - Assert package.json has correct name
   - Test `--no-install` skips installation
   - Test `--no-git` skips git init
   
3. **Manual testing**:
   - Run `collie create` interactively
   - Verify created project runs (`npm dev`)
   - Test both Vite and Next.js templates

### Estimated Effort

**6-8 hours**:
- 2 hours: Core scaffolding logic
- 2 hours: Interactive prompts and option handling
- 2-3 hours: Creating template directories (Vite + Next.js)
- 1-2 hours: Testing and polish

### Dependencies

**Prerequisites**: None for Vite template. Feature #6 for Next.js template.

**Enables**: Faster onboarding, better first impressions

### Success Criteria

- ✅ `collie create` runs interactive wizard
- ✅ `collie create my-app` creates project with defaults
- ✅ Template files are copied correctly
- ✅ Placeholders are replaced (project name, etc.)
- ✅ Dependencies are installed automatically
- ✅ Git repository is initialized
- ✅ `--no-install` and `--no-git` flags work
- ✅ Created project runs successfully with `npm dev`
- ✅ Both TypeScript and JavaScript templates work
- ✅ Vite template is functional out-of-the-box

---

## Feature #6: `collie init --nextjs` - Next.js Support

**Status**: ✅ Complete

**Priority**: 🟠 High

### Value Proposition

Expands Collie beyond Vite to the massive Next.js ecosystem, the most popular React framework. Enables server components, app router, and server-side rendering with Collie templates. This feature is critical for ecosystem growth and adoption by production apps.

### Command Signature

```bash
collie init --nextjs

# Initialize in Next.js app directory
cd my-nextjs-app
collie init --nextjs

# Or specify during creation
collie create my-app --template nextjs
```

**Options** (extends existing `init` command):
- `--nextjs`: Configure Collie for Next.js instead of Vite

### Use Cases

1. **Next.js App Router**: Use Collie components in Server Components
2. **Pages Router**: Use Collie in traditional Next.js pages
3. **SSR/SSG**: Benefits from Next.js rendering modes
4. **Production apps**: Enterprise teams using Next.js can adopt Collie
5. **Existing projects**: Add Collie to established Next.js codebases

### Implementation Requirements

**Files to Create/Modify**:
- Modify [`packages/cli/src/index.ts`](packages/cli/src/index.ts) - Extend `runInit()` to detect Next.js
- Create `packages/cli/src/nextjs-setup.ts` - Next.js-specific configuration

**Dependencies** (no new CLI dependencies, but Next.js integration needs):
```bash
# Users install in their Next.js project
npm install --save-dev @collie-lang/compiler
```

**Algorithm**:

1. **Detect Next.js**: Check for `next` in package.json dependencies
2. **Create next.config.js modification**:
   - Add webpack loader for `.collie` files
   - Configure to use [`compile()`](packages/compiler/src/index.ts:24-38) from `@collie-lang/compiler`
3. **Install compiler**: Add `@collie-lang/compiler` as devDependency
4. **Create type declarations**: Add `collie.d.ts` for TypeScript support
5. **Create example component**: Add sample `.collie` file
6. **Print instructions**: Explain import patterns for App Router vs Pages Router

**Integration Points**:
- Use [`compile()`](packages/compiler/src/index.ts:24-38) in webpack loader
- Reuse type declaration from Vite setup
- Reuse package manager detection

**Input/Output**:
- **Input**: Next.js project directory
- **Output**: Modified `next.config.js`, type declarations, example component

**Error Handling**:
- If `next` not found in package.json, show error "Not a Next.js project"
- If next.config.js has complex configuration, warn about manual merge
- If compiler installation fails, show clear error

### Code Examples

**Command Usage**:
```bash
# In a Next.js project
cd my-nextjs-app
collie init --nextjs
```

**Expected Output**:
```
Detected Next.js project

✔ Installing @collie-lang/compiler...
✔ Configuring next.config.js...
✔ Writing type declarations...
✔ Created example component: app/components/Welcome.collie

🎉 Collie is ready for Next.js!

Next steps:
  - Import .collie components in your app:
    import Welcome from './components/Welcome.collie'
  
  - For App Router, components work as Server Components by default
  - For client components, add 'use client' to your .collie file
  
  - Run your Next.js dev server:
    npm run dev
```

**Next.js webpack config** (added to `next.config.js`):
```javascript
// Auto-generated by collie init --nextjs
const { compile } = require("@collie-lang/compiler");

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.module.rules.push({
      test: /\.collie$/,
      use: [
        {
          loader: "babel-loader",
          options: {
            presets: ["next/babel"]
          }
        },
        {
          loader: require.resolve("./collie-loader.js")
        }
      ]
    });
    
    return config;
  }
};

module.exports = nextConfig;
```

**Webpack loader** (`collie-loader.js` - created by CLI):
```javascript
const { compile } = require("@collie-lang/compiler");
const path = require("path");

module.exports = function collieLoader(source) {
  const callback = this.async();
  const filename = this.resourcePath;
  const componentName = path.basename(filename, ".collie");
  
  try {
    const result = compile(source, {
      filename,
      componentNameHint: componentName,
      jsxRuntime: "automatic"
    });
    
    // Report errors as webpack warnings/errors
    for (const diag of result.diagnostics) {
      if (diag.severity === "error") {
        this.emitError(new Error(`${diag.file}: ${diag.message}`));
      } else {
        this.emitWarning(new Error(`${diag.file}: ${diag.message}`));
      }
    }
    
    callback(null, result.code);
  } catch (error) {
    callback(error);
  }
};
```

**Core Implementation** (`packages/cli/src/nextjs-setup.ts`):
```typescript
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import pc from "picocolors";

export async function setupNextJs(projectRoot: string): Promise<void> {
  // Verify Next.js project
  const packageJsonPath = path.join(projectRoot, "package.json");
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf-8"));
  
  const hasNext = packageJson.dependencies?.next || packageJson.devDependencies?.next;
  if (!hasNext) {
    throw new Error("Not a Next.js project. 'next' not found in package.json");
  }
  
  console.log(pc.cyan("Detected Next.js project\n"));
  
  // Create webpack loader
  const loaderPath = path.join(projectRoot, "collie-loader.js");
  await fs.writeFile(loaderPath, WEBPACK_LOADER_TEMPLATE, "utf-8");
  
  // Modify or create next.config.js
  await patchNextConfig(projectRoot);
  console.log(pc.green("✔ Configured next.config.js"));
  
  // Create type declarations
  const appDir = existsSync(path.join(projectRoot, "app")) ? "app" : "src";
  const declPath = path.join(projectRoot, appDir, "collie.d.ts");
  await fs.writeFile(declPath, TYPE_DECLARATION, "utf-8");
  console.log(pc.green("✔ Writing type declarations"));
  
  // Create example component
  const examplePath = path.join(projectRoot, appDir, "components", "Welcome.collie");
  await fs.mkdir(path.dirname(examplePath), { recursive: true });
  await fs.writeFile(examplePath, EXAMPLE_COMPONENT, "utf-8");
  console.log(pc.green(`✔ Created example component: ${path.relative(projectRoot, examplePath)}`));
}

async function patchNextConfig(projectRoot: string): Promise<void> {
  const configPaths = [
    "next.config.js",
    "next.config.mjs",
    "next.config.ts"
  ];
  
  let configPath: string | null = null;
  for (const p of configPaths) {
    const fullPath = path.join(projectRoot, p);
    if (existsSync(fullPath)) {
      configPath = fullPath;
      break;
    }
  }
  
  if (!configPath) {
    // Create default config
    configPath = path.join(projectRoot, "next.config.js");
    await fs.writeFile(configPath, NEXT_CONFIG_TEMPLATE, "utf-8");
    return;
  }
  
  // Patch existing config
  let content = await fs.readFile(configPath, "utf-8");
  
  if (content.includes("collie-loader")) {
    console.log(pc.yellow("⚠ next.config.js already configured for Collie"));
    return;
  }
  
  // Simple injection - insert webpack config
  // This is a basic implementation; production would use AST manipulation
  if (content.includes("webpack:")) {
    console.log(pc.yellow("⚠ Complex webpack config detected. Add Collie loader manually:"));
    console.log(pc.gray(MANUAL_CONFIG_SNIPPET));
  } else {
    content = content.replace(
      /module\.exports\s*=\s*{/,
      `module.exports = {\n  webpack: (config) => {\n${WEBPACK_CONFIG_SNIPPET}\n    return config;\n  },`
    );
    await fs.writeFile(configPath, content, "utf-8");
  }
}

const WEBPACK_LOADER_TEMPLATE = `const { compile } = require("@collie-lang/compiler");
const path = require("path");

module.exports = function collieLoader(source) {
  const callback = this.async();
  const filename = this.resourcePath;
  const componentName = path.basename(filename, ".collie");
  
  try {
    const result = compile(source, {
      filename,
      componentNameHint: componentName,
      jsxRuntime: "automatic"
    });
    
    for (const diag of result.diagnostics) {
      if (diag.severity === "error") {
        this.emitError(new Error(\`\${diag.file}: \${diag.message}\`));
      } else {
        this.emitWarning(new Error(\`\${diag.file}: \${diag.message}\`));
      }
    }
    
    callback(null, result.code);
  } catch (error) {
    callback(error);
  }
};
`;

const NEXT_CONFIG_TEMPLATE = `/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.module.rules.push({
      test: /\\.collie$/,
      use: [
        {
          loader: "babel-loader",
          options: {
            presets: ["next/babel"]
          }
        },
        {
          loader: require.resolve("./collie-loader.js")
        }
      ]
    });
    
    return config;
  }
};

module.exports = nextConfig;
`;

const WEBPACK_CONFIG_SNIPPET = `    config.module.rules.push({
      test: /\\.collie$/,
      use: [
        {
          loader: "babel-loader",
          options: { presets: ["next/babel"] }
        },
        {
          loader: require.resolve("./collie-loader.js")
        }
      ]
    });`;

const MANUAL_CONFIG_SNIPPET = `
  config.module.rules.push({
    test: /\\.collie$/,
    use: [
      { loader: "babel-loader", options: { presets: ["next/babel"] } },
      { loader: require.resolve("./collie-loader.js") }
    ]
  });
`;

const TYPE_DECLARATION = `declare module "*.collie" {
  import type { ComponentType } from "react";
  const component: ComponentType<Record<string, unknown>>;
  export default component;
}
`;

const EXAMPLE_COMPONENT = `props
  message: string = "Welcome to Collie with Next.js!"

div class="welcome"
  h1
    {message}
  p
    Edit this component in app/components/Welcome.collie
`;
```

**CLI Integration** (modify `runInit()` in [`packages/cli/src/index.ts`](packages/cli/src/index.ts)):
```typescript
import { setupNextJs } from "./nextjs-setup";

async function runInit(): Promise<void> {
  const projectRoot = process.cwd();
  const args = process.argv.slice(2);
  
  // Check for --nextjs flag
  if (args.includes("--nextjs")) {
    await setupNextJs(projectRoot);
    console.log(pc.green("\n🎉 Collie is ready for Next.js!"));
    printNextJsInstructions();
    return;
  }
  
  // Existing Vite setup...
  // (keep current implementation)
}

function printNextJsInstructions(): void {
  console.log(pc.cyan("\nNext steps:"));
  console.log("  - Import .collie components in your app:");
  console.log(pc.gray("    import Welcome from './components/Welcome.collie'"));
  console.log("");
  console.log("  - For App Router, components work as Server Components by default");
  console.log("  - For client components, add 'use client' to your .collie file");
  console.log("");
  console.log("  - Run your Next.js dev server:");
  console.log(pc.gray("    npm run dev"));
}
```

### Testing Requirements

1. **Unit tests**:
   - Test Next.js project detection
   - Test next.config.js patching
   - Test webpack loader code generation
   
2. **Integration tests**:
   - Create temp Next.js project
   - Run `collie init --nextjs`
   - Assert config files are created
   - Assert webpack loader exists
   
3. **Manual testing**:
   - Test with Next.js App Router project
   - Test with Next.js Pages Router project
   - Verify hot reload works
   - Test Server Components vs Client Components

### Estimated Effort

**6-8 hours**:
- 2 hours: Next.js architecture research and webpack loader setup
- 2 hours: Configuration file patching and loader implementation
- 1 hour: Type declarations and example components
- 1-2 hours: Testing with App Router and Pages Router
- 1 hour: Documentation and troubleshooting

### Dependencies

**Prerequisites**: None - standalone enhancement to existing `init` command

**Enables**: Feature #5 (`collie create --template nextjs`) can use this setup

### Success Criteria

- ✅ `collie init --nextjs` detects Next.js projects correctly
- ✅ Webpack loader is created and configured in next.config.js
- ✅ Type declarations are added to project
- ✅ Example component is created in correct directory (app vs pages)
- ✅ `.collie` files compile during Next.js dev server
- ✅ Hot reload works with file changes
- ✅ Works with both App Router and Pages Router
- ✅ Server Components work by default
- ✅ Client components work with 'use client' directive
- ✅ Error handling gracefully handles complex configs

---

## Feature #7: Collie Config System Reset

**Status**: 🚧 Rebooting

**Priority**: 🟡 Medium

### Current Status

- Legacy `.collierc` / `collie.config.*` loader specs have been removed from the repo.
- The CLI no longer advertises a `--config` flag or automatic config discovery.
- No config loader modules exist yet; Stage 0 intentionally leaves a clean slate.

### Next Steps

1. Follow the staged rollout described in [`collie-config-implementation-plan.md`](collie-config-implementation-plan.md).
2. Stage 1 adds the new `@collie-lang/config` package with typed helpers.
3. Later stages will add disk loading, normalization, and CLI integrations.

### Notes

- Until the new system ships, teams must configure CLI behavior via explicit flags.
- Do **not** reintroduce `.collierc` references; the new root-level `collie.config.*` files will replace it.

---

## Feature #8: `collie convert` - JSX to Collie Converter

**Priority**: 🟡 Medium

### Value Proposition

Dramatically lowers the barrier to adoption by automatically converting existing JSX/TSX components to Collie syntax. Teams can migrate incrementally without manual conversion. Reduces learning curve and enables experimentation with Collie on existing codebases.

### Command Signature

```bash
collie convert [files...] [options]

# Convert single file
collie convert src/Button.tsx

# Convert multiple files
collie convert src/**/*.tsx

# Convert and write to new extension
collie convert src/Button.tsx --write

# Convert and print to stdout
collie convert src/Button.tsx
```

**Options**:
- `--write`, `-w`: Write converted output to `.collie` file (default: stdout)
- `--overwrite`: Overwrite existing `.collie` files
- `--remove-original`: Delete original `.tsx` file after conversion

### Use Cases

1. **Migration path**: Convert existing components to try Collie
2. **Team adoption**: Gradually migrate codebase component-by-component
3. **Learning tool**: See JSX and Collie side-by-side
4. **Code review**: Generate Collie version for comparison
5. **Prototyping**: Quickly convert mock components to Collie

### Implementation Requirements

**Files to Create/Modify**:
- Modify [`packages/cli/src/index.ts`](packages/cli/src/index.ts) - Add `convert` command
- Create `packages/cli/src/converter.ts` - JSX to Collie conversion logic

**Dependencies**:
```bash
pnpm add -D @babel/parser @babel/traverse @babel/types
```

**Algorithm**:

1. **Parse JSX**: Use `@babel/parser` to parse TSX/JSX into AST
2. **Extract props interface**: Find TypeScript interface or prop types
3. **Convert JSX to Collie**:
   - `<div className="foo">` → `div class="foo"`
   - Nested elements → Indented children
   - `{expression}` → `{expression}` (preserve)
   - Remove closing tags
   - Convert attributes (className → class, etc.)
4. **Generate Collie format**:
   - Props block at top (from TypeScript interface)
   - Template body with proper indentation
5. **Write output**: Stdout or `.collie` file

**Integration Points**:
- None - standalone conversion tool
- Could validate output with [`parse()`](packages/compiler/src/parser.ts:60) to ensure valid Collie

**Input/Output**:
- **Input**: JSX/TSX file paths
- **Output**: Collie-formatted templates (stdout or `.collie` files)

**Error Handling**:
- If JSX parsing fails, show syntax error
- If file isn't valid React component, warn and skip
- If props can't be extracted, create empty props block
- If `.collie` exists and no `--overwrite`, warn and skip

### Code Examples

**Input JSX** (`Button.tsx`):
```tsx
interface ButtonProps {
  label: string;
  onClick?: () => void;
  variant?: "primary" | "secondary";
}

export default function Button({ label, onClick, variant = "primary" }: ButtonProps) {
  return (
    <button className={`btn btn-${variant}`} onClick={onClick}>
      <span className="label">{label}</span>
    </button>
  );
}
```

**Output Collie** (command: `collie convert Button.tsx`):
```
props
  label: string
  onClick?: () => void
  variant?: "primary" | "secondary" = "primary"

button class={`btn btn-${variant}`} onClick={onClick}
  span class="label"
    {label}
```

**Command Usage**:
```bash
# Convert and print to stdout
collie convert src/Button.tsx

# Convert and write to Button.collie
collie convert src/Button.tsx --write

# Convert all components
collie convert src/components/**/*.tsx --write
```

**Core Implementation** (`packages/cli/src/converter.ts`):
```typescript
import { parse as babelParse } from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import fs from "node:fs/promises";
import path from "node:path";

export interface ConvertOptions {
  write?: boolean;
  overwrite?: boolean;
  removeOriginal?: boolean;
}

export async function convert(filepath: string, options: ConvertOptions = {}): Promise<string> {
  const source = await fs.readFile(filepath, "utf-8");
  const ast = babelParse(source, {
    sourceType: "module",
    plugins: ["typescript", "jsx"]
  });
  
  let propsInterface: string | null = null;
  let jsxElement: any = null;
  
  // Extract props interface and JSX
  traverse(ast, {
    TSInterfaceDeclaration(path) {
      if (path.node.id.name.endsWith("Props")) {
        propsInterface = generatePropsBlock(path.node);
      }
    },
    FunctionDeclaration(path) {
      const body = path.node.body.body;
      const returnStmt = body.find(stmt => t.isReturnStatement(stmt)) as t.ReturnStatement | undefined;
      if (returnStmt?.argument && t.isJSXElement(returnStmt.argument)) {
        jsxElement = returnStmt.argument;
      }
    },
    ArrowFunctionExpression(path) {
      if (t.isJSXElement(path.node.body)) {
        jsxElement = path.node.body;
      }
    }
  });
  
  let collieCode = "";
  
  if (propsInterface) {
    collieCode += propsInterface + "\n\n";
  }
  
  if (jsxElement) {
    collieCode += convertJSXToCollie(jsxElement, 0);
  }
  
  if (options.write) {
    const outputPath = filepath.replace(/\.tsx?$/, ".collie");
    
    // Check if file exists
    if (!options.overwrite) {
      try {
        await fs.access(outputPath);
        throw new Error(`${outputPath} already exists. Use --overwrite to replace.`);
      } catch {
        // File doesn't exist, proceed
      }
    }
    
    await fs.writeFile(outputPath, collieCode, "utf-8");
    
    if (options.removeOriginal) {
      await fs.unlink(filepath);
    }
  }
  
  return collieCode;
}

function generatePropsBlock(node: t.TSInterfaceDeclaration): string {
  let props = "props\n";
  
  for (const prop of node.body.body) {
    if (t.isTSPropertySignature(prop) && t.isIdentifier(prop.key)) {
      const name = prop.key.name;
      const optional = prop.optional ? "?" : "";
      const typeAnnotation = prop.typeAnnotation
        ? generateTypeAnnotation(prop.typeAnnotation.typeAnnotation)
        : "any";
      
      props += `  ${name}${optional}: ${typeAnnotation}\n`;
    }
  }
  
  return props.trimEnd();
}

function generateTypeAnnotation(node: t.TSType): string {
  if (t.isTSStringKeyword(node)) return "string";
  if (t.isTSNumberKeyword(node)) return "number";
  if (t.isTSBooleanKeyword(node)) return "boolean";
  if (t.isTSUnionType(node)) {
    return node.types.map(generateTypeAnnotation).join(" | ");
  }
  if (t.isTSLiteralType(node)) {
    if (t.isStringLiteral(node.literal)) return `"${node.literal.value}"`;
    return String(node.literal);
  }
  return "any";
}

function convertJSXToCollie(node: any, indent: number): string {
  const indentStr = "  ".repeat(indent);
  
  if (t.isJSXElement(node)) {
    const opening = node.openingElement;
    const tagName = t.isJSXIdentifier(opening.name)
      ? opening.name.name
      : "div";
    
    let line = `${indentStr}${tagName}`;
    
    // Convert attributes
    for (const attr of opening.attributes) {
      if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name)) {
        const name = attr.name.name === "className" ? "class" : attr.name.name;
        
        if (attr.value === null) {
          // Boolean attribute
          line += ` ${name}`;
        } else if (t.isStringLiteral(attr.value)) {
          line += ` ${name}="${attr.value.value}"`;
        } else if (t.isJSXExpressionContainer(attr.value)) {
          const expr = generate(attr.value.expression);
          line += ` ${name}={${expr}}`;
        }
      }
    }
    
    // Convert children
    const children = node.children
      .filter((child: any) => !t.isJSXText(child) || child.value.trim())
      .map((child: any) => convertJSXToCollie(child, indent + 1))
      .filter(Boolean)
      .join("\n");
    
    return children ? `${line}\n${children}` : line;
  }
  
  if (t.isJSXText(node)) {
    const text = node.value.trim();
    return text ? `${indentStr}${text}` : "";
  }
  
  if (t.isJSXExpressionContainer(node)) {
    const expr = generate(node.expression);
    return `${indentStr}{${expr}}`;
  }
  
  return "";
}

// Simplified code generator for expressions
function generate(node: any): string {
  if (t.isIdentifier(node)) return node.name;
  if (t.isStringLiteral(node)) return `"${node.value}"`;
  if (t.isTemplateLiteral(node)) {
    // Simplified template literal handling
    return "`" + node.quasis.map((q: any) => q.value.raw).join("${...}") + "`";
  }
  return "...";
}
```

**CLI Integration** (add to [`packages/cli/src/index.ts`](packages/cli/src/index.ts)):
```typescript
import { convert } from "./converter";
import { glob } from "fast-glob";

if (cmd === "convert") {
  const patterns = args.slice(1).filter(a => !a.startsWith("--") && !a.startsWith("-"));
  
  if (patterns.length === 0) {
    throw new Error("No files provided. Usage: collie convert <files...>");
  }
  
  const files = await glob(patterns);
  const options = {
    write: args.includes("--write") || args.includes("-w"),
    overwrite: args.includes("--overwrite"),
    removeOriginal: args.includes("--remove-original")
  };
  
  for (const file of files) {
    try {
      const result = await convert(file, options);
      
      if (!options.write) {
        console.log(pc.gray(`// Converted from ${file}\n`));
        console.log(result);
        console.log("");
      } else {
        const outputFile = file.replace(/\.tsx?$/, ".collie");
        console.log(pc.green(`✔ Converted ${file} → ${outputFile}`));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(pc.red(`✖ Failed to convert ${file}: ${message}`));
    }
  }
  
  return;
}
```

### Testing Requirements

1. **Unit tests** (`packages/cli/tests/converter.test.ts`):
   - Test props interface extraction
   - Test JSX element conversion
   - Test attribute mapping (className → class)
   - Test nested elements and indentation
   
2. **Integration tests**:
   - Convert sample React components
   - Assert output is valid Collie (parse with [`parse()`](packages/compiler/src/parser.ts:60))
   - Test `--write` creates `.collie` files
   - Test `--overwrite` behavior

### Estimated Effort

**6-8 hours**:
- 3 hours: Babel AST traversal and JSX parsing
- 2 hours: Props extraction and type conversion
- 1 hour: Collie output generation
- 1-2 hours: Testing and edge cases

### Dependencies

**Prerequisites**: None - standalone feature

**Enables**: Easier migration and adoption

### Success Criteria

- ✅ Converts simple JSX components to Collie
- ✅ Extracts TypeScript props interfaces
- ✅ Maps JSX attributes correctly (className → class)
- ✅ Preserves expressions in curly braces
- ✅ Maintains proper indentation
- ✅ `--write` creates `.collie` files
- ✅ `--overwrite` replaces existing files
- ✅ Handles nested elements correctly
- ✅ Works with both function and arrow function components

---

## Feature #9: `collie doctor` - Environment Diagnostics

**Status**: ✅ Complete

**Priority**: 🟡 Medium

### Value Proposition

Reduces support burden by automatically diagnosing common setup issues. Helps users troubleshoot problems independently with clear, actionable feedback. Essential for smooth onboarding and reducing friction when issues arise.

### Command Signature

```bash
collie doctor

# Run diagnostics and show results
collie doctor

# Output as JSON
collie doctor --json

# Check specific subsystem
collie doctor --check compiler
```

**Options**:
- `--json`: Output results as JSON
- `--check <subsystem>`: Check specific subsystem (compiler, vite, nextjs, etc.)

### Use Cases

1. **Troubleshooting**: User reports "Collie not working"
2. **Setup verification**: After `collie init`, verify everything is configured
3. **CI debugging**: Check environment in CI/CD
4. **Version compatibility**: Ensure all dependencies are compatible
5. **Support tickets**: Users provide `doctor` output for debugging

### Implementation Requirements

**Files to Create/Modify**:
- Modify [`packages/cli/src/index.ts`](packages/cli/src/index.ts) - Add `doctor` command
- Create `packages/cli/src/doctor.ts` - Diagnostic checks

**Dependencies**: None (use built-in Node.js APIs)

**Algorithm**:

1. **Check Node.js version**: Ensure compatible version (>= 18)
2. **Check package.json**: Verify Collie packages are installed
3. **Check for Vite/Next.js**: Detect build system
4. **Check config files**: Verify vite.config.ts or next.config.js has Collie setup
5. **Check .collie files**: Find any `.collie` files in project
6. **Test compilation**: Try compiling a simple `.collie` template
7. **Report results**: Green checkmarks for OK, red X for issues with fix suggestions

**Integration Points**:
- Use [`compile()`](packages/compiler/src/index.ts:24-38) to test compilation
- Check package.json for dependencies
- Detect project type (Vite vs Next.js)

**Input/Output**:
- **Input**: Current project directory
- **Output**: Diagnostic report with pass/fail for each check

**Error Handling**:
- All checks should be try/catch wrapped
- Failed checks show actionable fix suggestions
- Never crash, always complete all checks

### Code Examples

**Command Usage**:
```bash
# Run all diagnostics
collie doctor

# JSON output for programmatic use
collie doctor --json
```

**Expected Output** (healthy project):
```
Collie Doctor - Diagnosing your environment...

✔ Node.js version: v20.10.0 (compatible)
✔ Collie compiler installed: @collie-lang/compiler@0.1.0
✔ Vite plugin installed: @collie-lang/vite@0.1.0
✔ Vite config found: vite.config.ts
✔ Collie plugin configured in Vite
✔ Type declarations found: src/collie.d.ts
✔ Found 3 .collie files
✔ Test compilation successful

🎉 Everything looks good!
```

**Expected Output** (with issues):
```
Collie Doctor - Diagnosing your environment...

✔ Node.js version: v20.10.0 (compatible)
✘ Collie compiler not found in package.json
  → Fix: Run 'npm install --save-dev @collie-lang/compiler'
  
✘ Vite plugin not configured
  → Fix: Add collie() to your Vite plugins array
  
⚠ No .collie files found
  → You haven't created any Collie templates yet

2 errors, 1 warning
Run the suggested fixes and try again.
```

**Core Implementation** (`packages/cli/src/doctor.ts`):
```typescript
import { compile } from "@collie-lang/compiler";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { glob } from "fast-glob";

export interface DiagnosticResult {
  check: string;
  status: "pass" | "fail" | "warn";
  message: string;
  fix?: string;
}

export async function runDiagnostics(cwd: string = process.cwd()): Promise<DiagnosticResult[]> {
  const results: DiagnosticResult[] = [];
  
  // Check Node.js version
  results.push(checkNodeVersion());
  
  // Check package.json
  results.push(await checkPackageJson(cwd));
  
  // Check for Vite or Next.js
  const buildSystem = await detectBuildSystem(cwd);
  results.push(buildSystem);
  
  // Check config files
  if (buildSystem.message.includes("Vite")) {
    results.push(await checkViteConfig(cwd));
  } else if (buildSystem.message.includes("Next.js")) {
    results.push(await checkNextConfig(cwd));
  }
  
  // Check type declarations
  results.push(await checkTypeDeclarations(cwd));
  
  // Check for .collie files
  results.push(await checkCollieFiles(cwd));
  
  // Test compilation
  results.push(await testCompilation());
  
  return results;
}

function checkNodeVersion(): DiagnosticResult {
  const version = process.version;
  const major = parseInt(version.slice(1).split(".")[0]);
  
  if (major >= 18) {
    return {
      check: "Node.js version",
      status: "pass",
      message: `${version} (compatible)`
    };
  }
  
  return {
    check: "Node.js version",
    status: "fail",
    message: `${version} (incompatible)`,
    fix: "Upgrade to Node.js 18 or higher"
  };
}

async function checkPackageJson(cwd: string): DiagnosticResult {
  try {
    const pkgPath = path.join(cwd, "package.json");
    const pkg = JSON.parse(await fs.readFile(pkgPath, "utf-8"));
    
    const hasCompiler = pkg.dependencies?.["@collie-lang/compiler"] ||
                       pkg.devDependencies?.["@collie-lang/compiler"];
    
    if (!hasCompiler) {
      return {
        check: "Collie compiler",
        status: "fail",
        message: "Not found in package.json",
        fix: "Run 'npm install --save-dev @collie-lang/compiler'"
      };
    }
    
    const version = hasCompiler.replace(/^[\^~]/, "");
    return {
      check: "Collie compiler",
      status: "pass",
      message: `@collie-lang/compiler@${version}`
    };
  } catch {
    return {
      check: "package.json",
      status: "fail",
      message: "Not found",
      fix: "Initialize npm project with 'npm init'"
    };
  }
}

async function detectBuildSystem(cwd: string): Promise<DiagnosticResult> {
  const pkgPath = path.join(cwd, "package.json");
  
  try {
    const pkg = JSON.parse(await fs.readFile(pkgPath, "utf-8"));
    const hasVite = pkg.dependencies?.vite || pkg.devDependencies?.vite;
    const hasNext = pkg.dependencies?.next || pkg.devDependencies?.next;
    
    if (hasVite) {
      return {
        check: "Build system",
        status: "pass",
        message: "Vite detected"
      };
    }
    
    if (hasNext) {
      return {
        check: "Build system",
        status: "pass",
        message: "Next.js detected"
      };
    }
    
    return {
      check: "Build system",
      status: "warn",
      message: "No Vite or Next.js found",
      fix: "Collie works best with Vite or Next.js"
    };
  } catch {
    return {
      check: "Build system",
      status: "fail",
      message: "Could not detect",
      fix: "Initialize a Vite or Next.js project"
    };
  }
}

async function checkViteConfig(cwd: string): Promise<DiagnosticResult> {
  const configFiles = ["vite.config.ts", "vite.config.js", "vite.config.mts", "vite.config.mjs"];
  
  for (const file of configFiles) {
    const configPath = path.join(cwd, file);
    if (existsSync(configPath)) {
      const content = await fs.readFile(configPath, "utf-8");
      
      if (content.includes("@collie-lang/vite") && content.includes("collie()")) {
        return {
          check: "Vite config",
          status: "pass",
          message: `Collie plugin configured in ${file}`
        };
      }
      
      return {
        check: "Vite config",
        status: "fail",
        message: `Found ${file} but Collie plugin not configured`,
        fix: "Run 'collie init' to configure Vite"
      };
    }
  }
  
  return {
    check: "Vite config",
    status: "fail",
    message: "vite.config.ts not found",
    fix: "Create vite.config.ts or run 'collie init'"
  };
}

async function checkNextConfig(cwd: string): Promise<DiagnosticResult> {
  const configFiles = ["next.config.js", "next.config.mjs", "next.config.ts"];
  
  for (const file of configFiles) {
    const configPath = path.join(cwd, file);
    if (existsSync(configPath)) {
      const content = await fs.readFile(configPath, "utf-8");
      
      if (content.includes("collie-loader")) {
        return {
          check: "Next.js config",
          status: "pass",
          message: `Collie loader configured in ${file}`
        };
      }
      
      return {
        check: "Next.js config",
        status: "fail",
        message: `Found ${file} but Collie loader not configured`,
        fix: "Run 'collie init --nextjs' to configure Next.js"
      };
    }
  }
  
  return {
    check: "Next.js config",
    status: "fail",
    message: "next.config.js not found",
    fix: "Run 'collie init --nextjs'"
  };
}

async function checkTypeDeclarations(cwd: string): Promise<DiagnosticResult> {
  const declPaths = [
    path.join(cwd, "src", "collie.d.ts"),
    path.join(cwd, "app", "collie.d.ts"),
    path.join(cwd, "collie.d.ts")
  ];
  
  for (const declPath of declPaths) {
    if (existsSync(declPath)) {
      return {
        check: "Type declarations",
        status: "pass",
        message: `Found ${path.relative(cwd, declPath)}`
      };
    }
  }
  
  return {
    check: "Type declarations",
    status: "warn",
    message: "collie.d.ts not found",
    fix: "Create src/collie.d.ts for TypeScript support"
  };
}

async function checkCollieFiles(cwd: string): Promise<DiagnosticResult> {
  const files = await glob("**/*.collie", { cwd, ignore: ["node_modules/**"] });
  
  if (files.length === 0) {
    return {
      check: "Collie files",
      status: "warn",
      message: "No .collie files found",
      fix: "Create a .collie template file to get started"
    };
  }
  
  return {
    check: "Collie files",
    status: "pass",
    message: `Found ${files.length} .collie file(s)`
  };
}

async function testCompilation(): Promise<DiagnosticResult> {
  const testTemplate = `div class="test"\n  p\n    Hello Collie`;
  
  try {
    const result = compile(testTemplate, { componentNameHint: "Test" });
    
    const hasErrors = result.diagnostics.some(d => d.severity === "error");
    if (hasErrors) {
      return {
        check: "Test compilation",
        status: "fail",
        message: "Compiler returned errors",
        fix: "Check compiler installation"
      };
    }
    
    return {
      check: "Test compilation",
      status: "pass",
      message: "Successful"
    };
  } catch (error) {
    return {
      check: "Test compilation",
      status: "fail",
      message: "Failed to compile test template",
      fix: "Reinstall @collie-lang/compiler"
    };
  }
}

export function printDiagnostics(results: DiagnosticResult[]): void {
  console.log(pc.bold("Collie Doctor - Diagnosing your environment...\n"));
  
  let errors = 0;
  let warnings = 0;
  
  for (const result of results) {
    const icon = result.status === "pass"
      ? pc.green("✔")
      : result.status === "warn"
        ? pc.yellow("⚠")
        : pc.red("✘");
    
    console.log(`${icon} ${result.check}: ${result.message}`);
    
    if (result.fix) {
      console.log(pc.gray(`  → Fix: ${result.fix}`));
    }
    
    if (result.status === "fail") errors++;
    if (result.status === "warn") warnings++;
    
    console.log("");
  }
  
  if (errors === 0 && warnings === 0) {
    console.log(pc.green("🎉 Everything looks good!"));
  } else {
    const parts = [];
    if (errors > 0) parts.push(`${errors} error(s)`);
    if (warnings > 0) parts.push(`${warnings} warning(s)`);
    
    console.log(pc.red(parts.join(", ")));
    console.log("Run the suggested fixes and try again.");
  }
}
```

**CLI Integration** (add to [`packages/cli/src/index.ts`](packages/cli/src/index.ts)):
```typescript
import { runDiagnostics, printDiagnostics } from "./doctor";

if (cmd === "doctor") {
  const results = await runDiagnostics(process.cwd());
  
  if (args.includes("--json")) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    printDiagnostics(results);
  }
  
  const hasErrors = results.some(r => r.status === "fail");
  if (hasErrors) {
    process.exit(1);
  }
  
  return;
}
```

### Testing Requirements

1. **Unit tests** (`packages/cli/tests/doctor.test.ts`):
   - Test each diagnostic check individually
   - Test Node.js version detection
   - Test package.json parsing
   
2. **Integration tests**:
   - Create temp projects with various issues
   - Run doctor and assert correct diagnostics
   - Test JSON output format

### Estimated Effort

**4-5 hours**:
- 2 hours: Implement diagnostic checks
- 1 hour: Output formatting
- 1 hour: JSON mode and error handling
- 1 hour: Testing

### Dependencies

**Prerequisites**: None - standalone feature

**Benefits**: All users - helps with troubleshooting

### Success Criteria

- ✅ Checks Node.js version compatibility
- ✅ Verifies Collie packages are installed
- ✅ Detects Vite or Next.js
- ✅ Checks config files are properly set up
- ✅ Finds .collie files in project
- ✅ Tests compilation works
- ✅ Provides actionable fix suggestions
- ✅ `--json` outputs machine-readable format
- ✅ Exits with code 1 if errors found

---

## Feature #10: `collie generate` - Component Scaffolding

**Priority**: 🟡 Medium

### Value Proposition

Boosts productivity by auto-generating boilerplate Collie components from templates. Enforces team conventions and reduces copy-paste errors. Particularly valuable for component libraries and design systems.

### Command Signature

```bash
collie generate <type> <name> [options]

# Generate a component
collie generate component Button

# Generate with props
collie generate component Card --props "title:string,image:string"

# Generate in specific directory
collie generate component Modal --dir src/components

# Use custom template
collie generate component Form --template custom-form
```

**Options**:
- `<type>`: Component type to generate (component, page, layout)
- `<name>`: Component name (PascalCase)
- `--props <props>`: Comma-separated props (name:type format)
- `--dir <directory>`: Output directory (default: src/components)
- `--template <name>`: Use custom template from `.collie/templates/`

### Use Cases

1. **Rapid prototyping**: Quickly create component stubs
2. **Team conventions**: Enforce consistent component structure
3. **Design systems**: Generate components from design tokens
4. **Learning**: New developers get familiar with patterns
5. **Boilerplate reduction**: Don't start from scratch every time

### Implementation Requirements

**Files to Create/Modify**:
- Modify [`packages/cli/src/index.ts`](packages/cli/src/index.ts) - Add `generate` command
- Create `packages/cli/src/generator.ts` - Component generation logic
- Create `packages/cli/templates/component.collie.template` - Default component template

**Dependencies**: None (use built-in Node.js APIs)

**Algorithm**:

1. **Parse arguments**: Extract component type, name, and options
2. **Load template**: Read template file (built-in or custom)
3. **Replace placeholders**:
   - `__COMPONENT_NAME__` → component name
   - `__PROPS__` → generated props block
   - `__DATE__` → current date
4. **Create file**: Write to specified directory
5. **Report success**: Show created file path

**Integration Points**:
- None - standalone code generation

**Input/Output**:
- **Input**: Component type, name, props specification
- **Output**: Generated `.collie` file

**Error Handling**:
- If file exists, ask to overwrite or exit
- If directory doesn't exist, create it
- If props format is invalid, show error
- If template not found, show available templates

### Code Examples

**Command Usage**:
```bash
# Generate simple component
collie generate component Button

# Generate with props
collie generate component Card --props "title:string,subtitle:string,onClick:()=>void"

# Generate in custom directory
collie generate component Header --dir src/layouts
```

**Expected Output**:
```
✔ Generated src/components/Button.collie

Next steps:
  - Edit src/components/Button.collie
  - Import in your app: import Button from './components/Button.collie'
```

**Generated File** (`src/components/Button.collie`):
```collie
props
  label: string = "Click me"
  onClick?: () => void
  disabled?: boolean = false

button
  class={disabled ? "btn btn-disabled" : "btn btn-primary"}
  onClick={onClick}
  disabled={disabled}
  {label}
```

**Default Template** (`packages/cli/templates/component.collie.template`):
```
props
__PROPS__

div class="__COMPONENT_NAME_LOWER__"
  // TODO: Add your component markup here
  p
    {/* Replace this with your content */}
```

**Core Implementation** (`packages/cli/src/generator.ts`):
```typescript
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pc from "picocolors";

export interface GenerateOptions {
  name: string;
  type: "component" | "page" | "layout";
  props?: string;
  dir?: string;
  template?: string;
}

export async function generate(options: GenerateOptions): Promise<string> {
  // Validate component name
  if (!/^[A-Z][A-Za-z0-9]*$/.test(options.name)) {
    throw new Error("Component name must be PascalCase (e.g., MyComponent)");
  }
  
  // Determine output directory
  const outputDir = options.dir || "src/components";
  const outputPath = path.join(process.cwd(), outputDir, `${options.name}.collie`);
  
  // Check if file exists
  if (existsSync(outputPath)) {
    throw new Error(`${outputPath} already exists`);
  }
  
  // Load template
  const templateContent = await loadTemplate(options.type, options.template);
  
  // Parse props
  const propsBlock = options.props ? parseProps(options.props) : "  // No props defined";
  
  // Replace placeholders
  const content = templateContent
    .replace(/__COMPONENT_NAME__/g, options.name)
    .replace(/__COMPONENT_NAME_LOWER__/g, toLowerCaseFirst(options.name))
    .replace(/__PROPS__/g, propsBlock)
    .replace(/__DATE__/g, new Date().toISOString().split("T")[0]);
  
  // Create directory if needed
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  
  // Write file
  await fs.writeFile(outputPath, content, "utf-8");
  
  return outputPath;
}

async function loadTemplate(type: string, customTemplate?: string): Promise<string> {
  if (customTemplate) {
    const customPath = path.join(process.cwd(), ".collie", "templates", `${customTemplate}.collie.template`);
    if (existsSync(customPath)) {
      return await fs.readFile(customPath, "utf-8");
    }
    throw new Error(`Custom template not found: ${customPath}`);
  }
  
  // Load built-in template
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const templatePath = path.resolve(dir, "..", "templates", `${type}.collie.template`);
  
  if (!existsSync(templatePath)) {
    throw new Error(`Built-in template not found: ${type}`);
  }
  
  return await fs.readFile(templatePath, "utf-8");
}

function parseProps(propsString: string): string {
  const props = propsString.split(",").map(p => p.trim());
  const lines: string[] = [];
  
  for (const prop of props) {
    const match = prop.match(/^(\w+)(\?)?:\s*(.+?)(?:\s*=\s*(.+))?$/);
    if (!match) {
      throw new Error(`Invalid prop format: ${prop}. Use "name:type" or "name:type=default"`);
    }
    
    const [, name, optional, type, defaultValue] = match;
    const opt = optional || "";
    const def = defaultValue ? ` = ${defaultValue}` : "";
    
    lines.push(`  ${name}${opt}: ${type}${def}`);
  }
  
  return lines.join("\n");
}

function toLowerCaseFirst(str: string): string {
  return str.charAt(0).toLowerCase() + str.slice(1);
}
```

**CLI Integration** (add to [`packages/cli/src/index.ts`](packages/cli/src/index.ts)):
```typescript
import { generate } from "./generator";

if (cmd === "generate" || cmd === "g") {
  const type = args[1] as "component" | "page" | "layout";
  const name = args[2];
  
  if (!type || !name) {
    throw new Error("Usage: collie generate <type> <name> [options]");
  }
  
  const options = {
    type,
    name,
    props: getFlag(args, "--props"),
    dir: getFlag(args, "--dir"),
    template: getFlag(args, "--template")
  };
  
  try {
    const outputPath = await generate(options);
    console.log(pc.green(`✔ Generated ${path.relative(process.cwd(), outputPath)}`));
    console.log("");
    console.log("Next steps:");
    console.log(`  - Edit ${path.relative(process.cwd(), outputPath)}`);
    console.log(`  - Import in your app: import ${name} from './${path.relative("src", outputPath).replace(".collie", "")}.collie'`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(pc.red(`✖ ${message}`));
    process.exit(1);
  }
  
  return;
}
```

### Testing Requirements

1. **Unit tests** (`packages/cli/tests/generator.test.ts`):
   - Test props parsing
   - Test placeholder replacement
   - Test component name validation
   
2. **Integration tests**:
   - Generate component in temp directory
   - Assert file exists with correct content
   - Test custom templates
   - Test props formatting

### Estimated Effort

**3-4 hours**:
- 1 hour: Template loading and placeholder replacement
- 1 hour: Props parsing and validation
- 1 hour: CLI integration
- 1 hour: Create default templates and testing

### Dependencies

**Prerequisites**: None - standalone feature

**Benefits**: Productivity boost for all users

### Success Criteria

- ✅ `collie generate component <name>` creates component file
- ✅ Props can be specified with `--props` flag
- ✅ Output directory can be customized with `--dir`
- ✅ Custom templates can be used with `--template`
- ✅ Placeholders are replaced correctly
- ✅ Component name validation (PascalCase)
- ✅ Prevents overwriting existing files
- ✅ Creates output directory if it doesn't exist

---

## Feature #11: `collie ast` - AST Inspector

**Priority**: 🟢 Low

### Value Proposition

Provides visibility into how Collie parses templates, useful for advanced users, tool developers, and debugging complex syntax issues. Educational for users learning the language internals. Critical for building editor extensions and language servers.

### Command Signature

```bash
collie ast <file> [options]

# Print AST as JSON
collie ast src/Button.collie

# Pretty-print with colors
collie ast src/Button.collie --pretty

# Show specific node types
collie ast src/Button.collie --filter Element
```

**Options**:
- `--pretty`, `-p`: Pretty-print with syntax highlighting
- `--filter <type>`: Show only nodes of specific type
- `--json`: Output as JSON (default)

### Use Cases

1. **Debugging**: Understand why template isn't parsing as expected
2. **Tool development**: Build editor extensions, linters
3. **Learning**: Understand Collie's internal representation
4. **Language server**: Foundation for LSP implementation
5. **Code analysis**: Build custom static analysis tools

### Implementation Requirements

**Files to Create/Modify**:
- Modify [`packages/cli/src/index.ts`](packages/cli/src/index.ts) - Add `ast` command
- Create `packages/cli/src/ast-inspector.ts` - AST printing logic

**Dependencies**:
```bash
pnpm add -D cli-highlight
```

**Algorithm**:

1. **Read file**: Load `.collie` file
2. **Parse**: Use [`parse()`](packages/compiler/src/parser.ts:60)
3. **Filter** (optional): Remove nodes not matching filter
4. **Format**: Pretty-print or JSON stringify
5. **Colorize** (if `--pretty`): Syntax highlight JSON output
6. **Print**: Output to stdout

**Integration Points**:
- Use [`parse()`](packages/compiler/src/parser.ts:60) from `@collie-lang/compiler`
- Use AST types from [`packages/compiler/src/ast.ts`](packages/compiler/src/ast.ts)

**Input/Output**:
- **Input**: `.collie` file path
- **Output**: JSON AST representation

**Error Handling**:
- If file doesn't exist, show error
- If parse fails, show diagnostics
- If filter type doesn't match any nodes, print empty array

### Code Examples

**Command Usage**:
```bash
# Print AST
collie ast src/Button.collie

# Pretty-print with colors
collie ast src/Button.collie --pretty

# Filter specific node types
collie ast src/Button.collie --filter Element
```

**Expected Output** (default):
```json
{
  "type": "Root",
  "children": [
    {
      "type": "PropsDecl",
      "fields": [
        {
          "name": "label",
          "typeAnnotation": "string",
          "optional": false,
          "defaultValue": "\"Click me\""
        }
      ]
    },
    {
      "type": "Element",
      "tag": "button",
      "attributes": [
        {
          "name": "class",
          "value": "btn"
        }
      ],
      "children": [
        {
          "type": "Expression",
          "code": "label"
        }
      ]
    }
  ]
}
```

**Core Implementation** (`packages/cli/src/ast-inspector.ts`):
```typescript
import { parse } from "@collie-lang/compiler";
import type { Node } from "@collie-lang/compiler/src/ast";
import fs from "node:fs/promises";
import { highlight } from "cli-highlight";

export interface ASTOptions {
  pretty?: boolean;
  filter?: string;
}

export async function inspectAST(filepath: string, options: ASTOptions = {}): Promise<string> {
  const source = await fs.readFile(filepath, "utf-8");
  const parseResult = parse(source);
  
  // Check for errors
  const errors = parseResult.diagnostics.filter(d => d.severity === "error");
  if (errors.length > 0) {
    throw new Error(`Parse errors:\n${errors.map(e => e.message).join("\n")}`);
  }
  
  let ast: any = parseResult.root;
  
  // Apply filter if specified
  if (options.filter) {
    ast = filterNodes(ast, options.filter);
  }
  
  const json = JSON.stringify(ast, null, 2);
  
  if (options.pretty) {
    return highlight(json, { language: "json" });
  }
  
  return json;
}

function filterNodes(node: Node, type: string): Node[] {
  const results: Node[] = [];
  
  if (node.type === type) {
    results.push(node);
  }
  
  if ("children" in node && Array.isArray(node.children)) {
    for (const child of node.children) {
      results.push(...filterNodes(child, type));
    }
  }
  
  return results;
}
```

**CLI Integration** (add to [`packages/cli/src/index.ts`](packages/cli/src/index.ts)):
```typescript
import { inspectAST } from "./ast-inspector";

if (cmd === "ast") {
  const filepath = args[1];
  
  if (!filepath) {
    throw new Error("No file provided. Usage: collie ast <file>");
  }
  
  const options = {
    pretty: args.includes("--pretty") || args.includes("-p"),
    filter: getFlag(args, "--filter")
  };
  
  try {
    const output = await inspectAST(filepath, options);
    console.log(output);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(pc.red(message));
    process.exit(1);
  }
  
  return;
}
```

### Testing Requirements

1. **Unit tests**:
   - Test AST extraction
   - Test node filtering
   - Test JSON formatting
   
2. **Integration tests**:
   - Parse sample files and verify AST structure
   - Test filter option

### Estimated Effort

**2-3 hours**:
- 1 hour: AST extraction and formatting
- 1 hour: Filtering and pretty-printing
- 1 hour: Testing

### Dependencies

**Prerequisites**: None

**Benefits**: Advanced users, tool developers

### Success Criteria

- ✅ Outputs valid JSON AST
- ✅ `--pretty` adds syntax highlighting
- ✅ `--filter` shows only specific node types
- ✅ Shows parse errors clearly
- ✅ Can be piped to other tools (jq, etc.)

---

## Feature #12: `collie diff` - Compare Collie vs JSX Output

**Priority**: 🟢 Low

### Value Proposition

Educational tool that helps users understand what Collie compiles to, building trust and aiding debugging. Particularly useful for learning how Collie maps to React/JSX and for troubleshooting unexpected output.

### Command Signature

```bash
collie diff <file> [options]

# Show side-by-side diff
collie diff src/Button.collie

# Show unified diff
collie diff src/Button.collie --unified

# Compare with existing TSX file
collie diff src/Button.collie --compare src/Button.tsx
```

**Options**:
- `--unified`, `-u`: Show unified diff format
- `--compare <file>`: Compare with existing TSX file
- `--color`: Colorize output (default: auto-detect TTY)

### Use Cases

1. **Learning**: Understand Collie-to-JSX compilation
2. **Debugging**: See what generated code looks like
3. **Migration**: Compare converted output with original
4. **Code review**: Verify compilation output
5. **Trust building**: Show users what's happening under the hood

### Implementation Requirements

**Files to Create/Modify**:
- Modify [`packages/cli/src/index.ts`](packages/cli/src/index.ts) - Add `diff` command
- Create `packages/cli/src/differ.ts` - Diff logic

**Dependencies**:
```bash
pnpm add -D diff
```

**Algorithm**:

1. **Compile Collie**: Use [`compile()`](packages/compiler/src/index.ts:24-38) to generate TSX
2. **Format both**: Optionally format for better comparison
3. **Generate diff**: Use `diff` library
4. **Colorize**: Add colors for adds/removes
5. **Print**: Output side-by-side or unified

**Integration Points**:
- Use [`compile()`](packages/compiler/src/index.ts:24-38) from `@collie-lang/compiler`

**Input/Output**:
- **Input**: `.collie` file (and optional `.tsx` for comparison)
- **Output**: Colorized diff

**Error Handling**:
- If file doesn't exist, show error
- If compilation fails, show diagnostics
- If compare file doesn't exist, show error

### Code Examples

**Command Usage**:
```bash
# Show what Collie compiles to
collie diff src/Button.collie

# Compare with hand-written TSX
collie diff src/Button.collie --compare src/Button.tsx
```

**Expected Output**:
```diff
--- src/Button.collie (source)
+++ src/Button.tsx (compiled)

@@ -1,4 +1,12 @@
-props
-  label: string
+export default function Button(props: { label: string }) {
+  return (
+    <button className="btn">
+      {props.label}
+    </button>
+  );
+}

-button class="btn"
-  {label}
```

**Core Implementation** (`packages/cli/src/differ.ts`):
```typescript
import { compile } from "@collie-lang/compiler";
import { diffLines, Change } from "diff";
import fs from "node:fs/promises";
import pc from "picocolors";

export interface DiffOptions {
  unified?: boolean;
  compare?: string;
  color?: boolean;
}

export async function showDiff(filepath: string, options: DiffOptions = {}): Promise<string> {
  const source = await fs.readFile(filepath, "utf-8");
  const componentName = filepath.split("/").pop()?.replace(".collie", "") || "Component";
  
  const result = compile(source, { componentNameHint: componentName });
  
  // Check for errors
  const errors = result.diagnostics.filter(d => d.severity === "error");
  if (errors.length > 0) {
    throw new Error(`Compilation errors:\n${errors.map(e => e.message).join("\n")}`);
  }
  
  const compiledCode = result.code;
  
  // If comparing with existing file
  if (options.compare) {
    const compareCode = await fs.readFile(options.compare, "utf-8");
    return formatDiff(source, compareCode, filepath, options.compare, options);
  }
  
  // Show source vs compiled
  return formatDiff(source, compiledCode, `${filepath} (source)`, `${filepath} (compiled)`, options);
}

function formatDiff(
  left: string,
  right: string,
  leftLabel: string,
  rightLabel: string,
  options: DiffOptions
): string {
  const diff = diffLines(left, right);
  const color = options.color ?? process.stdout.isTTY;
  
  if (options.unified) {
    return formatUnifiedDiff(diff, leftLabel, rightLabel, color);
  }
  
  return formatSideBySideDiff(diff, leftLabel, rightLabel, color);
}

function formatUnifiedDiff(diff: Change[], leftLabel: string, rightLabel: string, color: boolean): string {
  const lines: string[] = [];
  
  lines.push(`--- ${leftLabel}`);
  lines.push(`+++ ${rightLabel}`);
  lines.push("");
  
  for (const part of diff) {
    const prefix = part.added ? "+" : part.removed ? "-" : " ";
    const text = part.value.split("\n").filter(l => l.length).map(l => `${prefix}${l}`).join("\n");
    
    if (color) {
      if (part.added) {
        lines.push(pc.green(text));
      } else if (part.removed) {
        lines.push(pc.red(text));
      } else {
        lines.push(pc.gray(text));
      }
    } else {
      lines.push(text);
    }
  }
  
  return lines.join("\n");
}

function formatSideBySideDiff(diff: Change[], leftLabel: string, rightLabel: string, color: boolean): string {
  const lines: string[] = [];
  
  lines.push(`${leftLabel} | ${rightLabel}`);
  lines.push("-".repeat(80));
  
  for (const part of diff) {
    const label = part.added ? "+ " : part.removed ? "- " : "  ";
    const text = part.value.trim();
    
    if (text) {
      const formatted = `${label}${text}`;
      
      if (color) {
        if (part.added) {
          lines.push(pc.green(formatted));
        } else if (part.removed) {
          lines.push(pc.red(formatted));
        } else {
          lines.push(formatted);
        }
      } else {
        lines.push(formatted);
      }
    }
  }
  
  return lines.join("\n");
}
```

**CLI Integration** (add to [`packages/cli/src/index.ts`](packages/cli/src/index.ts)):
```typescript
import { showDiff } from "./differ";

if (cmd === "diff") {
  const filepath = args[1];
  
  if (!filepath) {
    throw new Error("No file provided. Usage: collie diff <file>");
  }
  
  const options = {
    unified: args.includes("--unified") || args.includes("-u"),
    compare: getFlag(args, "--compare"),
    color: !args.includes("--no-color")
  };
  
  try {
    const output = await showDiff(filepath, options);
    console.log(output);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(pc.red(message));
    process.exit(1);
  }
  
  return;
}
```

### Testing Requirements

1. **Unit tests**:
   - Test diff generation
   - Test unified vs side-by-side formats
   - Test colorization
   
2. **Integration tests**:
   - Compile sample files and generate diffs
   - Test --compare option

### Estimated Effort

**2-3 hours**:
- 1 hour: Diff generation and formatting
- 1 hour: Colorization and output modes
- 1 hour: Testing

### Dependencies

**Prerequisites**: None

**Benefits**: Educational tool for all users

### Success Criteria

- ✅ Shows source vs compiled output
- ✅ `--unified` shows unified diff format
- ✅ `--compare` compares with existing file
- ✅ Colorization works in terminal
- ✅ `--no-color` disables colors for piping
- ✅ Clear visual indication of differences

---

## Conclusion

This report documents 12 prioritized CLI enhancements for the Collie language. Each feature is designed to be implementation-ready, with complete specifications that enable AI coding assistants to build them directly from this documentation.

**Implementation Roadmap**:

1. **Phase 1 - Foundation** (Features #1-3): Essential tooling that unblocks non-Vite users
2. **Phase 2 - Ecosystem** (Features #4-6): Expand compatibility and improve onboarding
3. **Phase 3 - Polish** (Features #7-10): Professional quality-of-life improvements
4. **Phase 4 - Advanced** (Features #11-12): Power-user and developer tools

**Total Estimated Effort**: 45-60 hours for all features

Each feature can be implemented independently, allowing for incremental delivery and user feedback between releases.
