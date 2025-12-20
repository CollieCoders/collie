# Next.js Support Implementation Plan for Collie

## Overview

This document outlines the plan to add Next.js support to Collie, an indentation-based template language that currently only supports Vite projects. This will enable developers to use Collie templates in Next.js applications with full feature parity to the existing Vite implementation.

---

## Section 1: High-Level Overview (Human-Readable)

### What is Needed

To add Next.js support to Collie, we need to create integration packages and tooling that enable Next.js projects to compile `.collie` files the same way Vite projects currently do. This involves:

1. **A webpack loader** - Next.js uses webpack (or Turbopack) for bundling, not Vite. We need a webpack loader that can intercept `.collie` files during the build process and compile them to JavaScript.

2. **A Next.js plugin** - A convenience package that configures Next.js to use the webpack loader and handle `.collie` files correctly.

3. **TypeScript support** - TypeScript declaration files so that importing `.collie` files doesn't produce type errors in Next.js projects.

4. **CLI enhancement** - Extend the existing `collie init` command to support creating Next.js projects with a `--nextjs` flag.

5. **Example project** - A working Next.js example to demonstrate usage and serve as a template.

### Why These Changes Are Necessary

**Different Build Tools**: Vite and Next.js use fundamentally different build systems. Vite has its own plugin system with specific hooks (like `load`), while Next.js uses webpack (and increasingly Turbopack). We can't reuse the Vite plugin directly; we need a webpack-compatible loader.

**Different Module Resolution**: Next.js has its own conventions for module resolution, file-based routing, and project structure. We need a Next.js-specific plugin to integrate smoothly with these conventions.

**Developer Experience**: Developers expect to run `npx collie init --nextjs` and have everything work out of the box, similar to how `collie init` currently works for Vite projects.

### What Can Be Reused

**The entire compiler** ([`packages/compiler/src/index.ts`](packages/compiler/src/index.ts)) is framework-agnostic and can be reused without modification. It handles:
- Parsing `.collie` files to an Abstract Syntax Tree (AST)
- Code generation from AST to JSX
- All language features and syntax

The compiler's API is simple and universal:
```typescript
import { compile } from '@collie-lang/compiler';
const result = compile(source, { filename });
```

This same API will be used by both the Vite plugin and the new webpack loader.

### Estimated Complexity & Effort

**Low to Medium Complexity**

The implementation is straightforward because:
- The compiler is already complete and framework-agnostic
- Webpack loaders have a well-documented API
- We have a working Vite plugin ([`packages/vite/src/index.ts`](packages/vite/src/index.ts)) to use as a reference
- Next.js plugin configuration is relatively simple

Main work involves:
1. Creating the webpack loader (~100-150 lines of code)
2. Creating the Next.js plugin wrapper (~50-100 lines)
3. Updating CLI to support Next.js initialization (~100-200 lines)
4. Setting up an example project (configuration files)
5. Writing tests and documentation

**Estimated effort**: 1-2 weeks for a single developer with testing and documentation.

### Key Architectural Considerations

**1. Compilation Pipeline Consistency**

The webpack loader must maintain the same compilation pipeline as the Vite plugin:
```
.collie file → Compiler (AST → JSX) → JSX transformation → JavaScript output
```

**2. JSX Transformation**

The Vite plugin uses esbuild to transform JSX after compilation. In webpack, we have two options:
- Let webpack's built-in JSX transformation handle it (preferred - simpler)
- Use `esbuild-loader` or `swc-loader` explicitly

**3. Source Maps**

Both the compiler and the loader need to generate accurate source maps for debugging. The Vite plugin already does this; webpack loader must do the same.

**4. Hot Module Replacement (HMR)**

Next.js has its own Fast Refresh system. The webpack loader should work transparently with it - no special handling needed if we emit proper JavaScript modules.

**5. TypeScript Integration**

Unlike the Vite plugin which can add TypeScript declarations directly to the `load` hook, we need:
- A separate `collie.d.ts` declaration file in the project
- Next.js configuration to recognize `.collie` extensions

**6. Package Structure**

We'll follow the existing monorepo pattern:
```
packages/
├── compiler/      (existing - no changes needed)
├── vite/          (existing - no changes needed)
├── webpack/       (new - webpack loader)
├── next/          (new - Next.js plugin)
└── cli/           (existing - will be enhanced)
```

**7. Turbopack Compatibility**

Next.js is transitioning to Turbopack. We should:
- Build for webpack first (current default)
- Plan for Turbopack support in a future iteration
- Ensure our architecture doesn't lock us into webpack-only

---

## Section 2: Implementation Plan (AI-Optimized)

This section provides detailed, step-by-step implementation instructions suitable for an AI coding assistant.

### Phase 1: Create Webpack Loader Package (`@collie-lang/webpack`)

#### Step 1.1: Initialize Package Structure

**Action**: Create the package directory and configuration files.

**Location**: `packages/webpack/`

**Files to create**:

1. `packages/webpack/package.json`:
```json
{
  "name": "@collie-lang/webpack",
  "version": "0.1.0",
  "description": "Webpack loader for Collie template language",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch"
  },
  "keywords": [
    "collie",
    "webpack",
    "loader",
    "template"
  ],
  "license": "MIT",
  "dependencies": {
    "@collie-lang/compiler": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsup": "^8.0.0",
    "typescript": "^5.0.0",
    "webpack": "^5.0.0"
  },
  "peerDependencies": {
    "webpack": "^5.0.0"
  }
}
```

2. `packages/webpack/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

3. `packages/webpack/tsup.config.ts`:
```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
});
```

4. `packages/webpack/README.md`:
```markdown
# @collie-lang/webpack

Webpack loader for Collie template language.

## Installation

\`\`\`bash
npm install --save-dev @collie-lang/webpack
\`\`\`

## Usage

In your `webpack.config.js`:

\`\`\`javascript
module.exports = {
  module: {
    rules: [
      {
        test: /\.collie$/,
        use: '@collie-lang/webpack'
      }
    ]
  }
};
\`\`\`

## Next.js

For Next.js projects, use `@collie-lang/next` instead, which configures this loader automatically.
```

**Validation**: Confirm all files exist in `packages/webpack/`.

---

#### Step 1.2: Implement Webpack Loader

**Action**: Create the main loader implementation.

**Location**: `packages/webpack/src/index.ts`

**Implementation**:

```typescript
import { compile } from '@collie-lang/compiler';
import type { LoaderContext } from 'webpack';

/**
 * Webpack loader for Collie template language.
 * Compiles .collie files to JavaScript with JSX.
 */
export default function collieLoader(
  this: LoaderContext<Record<string, unknown>>,
  source: string
): void {
  // Mark loader as cacheable for performance
  this.cacheable?.(true);
  
  // Get the async callback
  const callback = this.async();
  
  // Get the absolute path of the file being processed
  const filename = this.resourcePath;
  
  try {
    // Compile the Collie source to JSX
    const result = compile(source, {
      filename,
      sourceMap: true,
    });
    
    // Check for compilation errors
    if (result.diagnostics && result.diagnostics.length > 0) {
      const errors = result.diagnostics
        .map(d => `${d.message} at ${d.location?.line}:${d.location?.column}`)
        .join('\n');
      
      callback(new Error(`Collie compilation failed:\n${errors}`));
      return;
    }
    
    // Return compiled code and source map
    callback(null, result.code, result.map);
  } catch (error) {
    callback(
      error instanceof Error 
        ? error 
        : new Error(`Collie compilation error: ${String(error)}`)
    );
  }
}
```

**Key Features**:
- ✅ Uses `this.async()` for async operation (webpack best practice)
- ✅ Marks loader as cacheable for better performance
- ✅ Passes source maps from compiler to webpack
- ✅ Proper error handling with diagnostic formatting
- ✅ Uses the existing `compile` function from [`@collie-lang/compiler`](packages/compiler/src/index.ts)

**Dependencies**: 
- Requires Phase 1.1 (package structure)
- Requires [`@collie-lang/compiler`](packages/compiler/src/index.ts) to be built

**Testing Requirements**:
1. Test with valid `.collie` file - should output JavaScript
2. Test with syntax errors - should report diagnostics
3. Test source map generation
4. Test caching behavior

**Expected Output**: JavaScript code with JSX syntax that webpack can then transform using its configured JSX transformer (babel, swc, or esbuild).

---

#### Step 1.3: Build and Test Webpack Loader

**Action**: Build the package and verify it works.

**Commands**:
```bash
cd packages/webpack
pnpm install
pnpm build
```

**Validation**:
- ✅ `packages/webpack/dist/index.js` exists
- ✅ `packages/webpack/dist/index.d.ts` exists
- ✅ No TypeScript compilation errors

**Manual Test** (optional):
Create a minimal webpack config to test the loader:

`packages/webpack/test-webpack.config.js`:
```javascript
const path = require('path');

module.exports = {
  mode: 'development',
  entry: './test-input.collie',
  output: {
    path: path.resolve(__dirname, 'test-dist'),
    filename: 'bundle.js',
  },
  module: {
    rules: [
      {
        test: /\.collie$/,
        use: path.resolve(__dirname, 'dist/index.js'),
      },
    ],
  },
};
```

---

### Phase 2: Create Next.js Plugin Package (`@collie-lang/next`)

#### Step 2.1: Initialize Next.js Plugin Package

**Action**: Create package structure for Next.js integration.

**Location**: `packages/next/`

**Files to create**:

1. `packages/next/package.json`:
```json
{
  "name": "@collie-lang/next",
  "version": "0.1.0",
  "description": "Next.js plugin for Collie template language",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch"
  },
  "keywords": [
    "collie",
    "nextjs",
    "plugin"
  ],
  "license": "MIT",
  "dependencies": {
    "@collie-lang/webpack": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "next": "^14.0.0",
    "tsup": "^8.0.0",
    "typescript": "^5.0.0"
  },
  "peerDependencies": {
    "next": "^13.0.0 || ^14.0.0"
  }
}
```

2. `packages/next/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

3. `packages/next/tsup.config.ts`:
```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
});
```

4. `packages/next/README.md`:
```markdown
# @collie-lang/next

Next.js plugin for Collie template language.

## Installation

\`\`\`bash
npm install --save-dev @collie-lang/next
\`\`\`

## Usage

In your `next.config.js`:

\`\`\`javascript
const { withCollie } = require('@collie-lang/next');

module.exports = withCollie({
  // Your Next.js config here
});
\`\`\`

Or with ES modules (`next.config.mjs`):

\`\`\`javascript
import { withCollie } from '@collie-lang/next';

export default withCollie({
  // Your Next.js config here
});
\`\`\`

## TypeScript Support

Create a `collie.d.ts` file in your project root or `src` directory:

\`\`\`typescript
declare module '*.collie' {
  const Component: React.ComponentType<any>;
  export default Component;
}
\`\`\`
```

**Dependencies**: Requires Phase 1 (webpack loader) to be complete.

**Validation**: Confirm all files exist in `packages/next/`.

---

#### Step 2.2: Implement Next.js Plugin

**Action**: Create the plugin that configures Next.js to use the webpack loader.

**Location**: `packages/next/src/index.ts`

**Implementation**:

```typescript
import type { NextConfig } from 'next';
import path from 'path';

/**
 * Options for the Collie Next.js plugin
 */
export interface ColliePluginOptions {
  /**
   * Additional webpack configuration to merge
   */
  webpack?: NextConfig['webpack'];
}

/**
 * Next.js plugin for Collie template language.
 * Configures webpack to process .collie files.
 * 
 * @param nextConfig - Existing Next.js configuration
 * @param options - Plugin options
 * @returns Modified Next.js configuration
 * 
 * @example
 * ```javascript
 * const { withCollie } = require('@collie-lang/next');
 * 
 * module.exports = withCollie({
 *   reactStrictMode: true,
 * });
 * ```
 */
export function withCollie(
  nextConfig: NextConfig = {},
  options: ColliePluginOptions = {}
): NextConfig {
  return {
    ...nextConfig,
    
    webpack(config, webpackOptions) {
      // Add .collie extension to resolve extensions
      if (!config.resolve) {
        config.resolve = {};
      }
      if (!config.resolve.extensions) {
        config.resolve.extensions = [];
      }
      
      // Add .collie to the list of resolvable extensions
      if (!config.resolve.extensions.includes('.collie')) {
        config.resolve.extensions.push('.collie');
      }
      
      // Add the Collie webpack loader
      config.module = config.module || {};
      config.module.rules = config.module.rules || [];
      
      config.module.rules.push({
        test: /\.collie$/,
        use: [
          // Use the webpack loader we created
          {
            loader: require.resolve('@collie-lang/webpack'),
          },
        ],
      });
      
      // Call the original webpack function if it exists
      if (typeof nextConfig.webpack === 'function') {
        return nextConfig.webpack(config, webpackOptions);
      }
      
      // Call the additional webpack function from options if provided
      if (typeof options.webpack === 'function') {
        return options.webpack(config, webpackOptions);
      }
      
      return config;
    },
  };
}

/**
 * Default export for convenience
 */
export default withCollie;
```

**Key Features**:
- ✅ Follows Next.js plugin convention (`withX` pattern)
- ✅ Adds `.collie` to resolvable extensions
- ✅ Configures webpack to use `@collie-lang/webpack` loader
- ✅ Preserves existing webpack configuration
- ✅ Supports both CJS and ESM Next.js configs
- ✅ Type-safe with TypeScript

**Dependencies**: 
- Requires Phase 2.1 (package structure)
- Requires Phase 1 (webpack loader) to be built

**Testing Requirements**:
1. Test with minimal Next.js config
2. Test with existing webpack config (should merge properly)
3. Test that `.collie` files can be imported
4. Test in both Pages Router and App Router

**Expected Output**: A Next.js config object with webpack configured to process `.collie` files.

---

#### Step 2.3: Build Next.js Plugin

**Action**: Build the package.

**Commands**:
```bash
cd packages/next
pnpm install
pnpm build
```

**Validation**:
- ✅ `packages/next/dist/index.js` exists
- ✅ `packages/next/dist/index.d.ts` exists
- ✅ No TypeScript compilation errors
- ✅ Both CJS and ESM formats are generated

---

### Phase 3: Update CLI to Support Next.js Initialization

#### Step 3.1: Analyze Existing CLI Structure

**Action**: Review the current CLI implementation to understand how Vite initialization works.

**File to review**: [`packages/cli/src/index.ts`](packages/cli/src/index.ts)

**What to look for**:
- How `collie init` currently works
- Template/scaffolding mechanism
- Configuration file generation
- Dependency installation logic
- User prompts and options

**Dependencies**: None (analysis only)

**Expected Outcome**: Understanding of CLI architecture to inform Next.js implementation.

---

#### Step 3.2: Add Next.js Framework Option

**Action**: Modify CLI to support `--nextjs` flag or interactive framework selection.

**Location**: [`packages/cli/src/index.ts`](packages/cli/src/index.ts)

**Changes needed**:

1. Add framework selection prompt or flag:
```typescript
// Add to CLI argument parsing
interface InitOptions {
  framework?: 'vite' | 'nextjs';
  typescript?: boolean;
  projectName?: string;
}

// Add interactive prompt if no flag provided
async function promptFramework(): Promise<'vite' | 'nextjs'> {
  // Use prompts library or similar
  const response = await prompts({
    type: 'select',
    name: 'framework',
    message: 'Which framework would you like to use?',
    choices: [
      { title: 'Vite', value: 'vite' },
      { title: 'Next.js', value: 'nextjs' },
    ],
  });
  
  return response.framework;
}
```

2. Add framework-specific initialization functions:
```typescript
async function initVite(options: InitOptions): Promise<void> {
  // Existing Vite initialization logic
}

async function initNextJS(options: InitOptions): Promise<void> {
  // New Next.js initialization logic
}

async function init(options: InitOptions): Promise<void> {
  const framework = options.framework || await promptFramework();
  
  if (framework === 'vite') {
    await initVite(options);
  } else if (framework === 'nextjs') {
    await initNextJS(options);
  }
}
```

**Dependencies**: Requires Phase 3.1 (analysis)

**Validation**: Running `collie init` should prompt for framework selection.

---

#### Step 3.3: Implement Next.js Project Scaffolding

**Action**: Create the logic to scaffold a Next.js project with Collie support.

**Location**: [`packages/cli/src/index.ts`](packages/cli/src/index.ts) or new file [`packages/cli/src/templates/nextjs.ts`](packages/cli/src/templates/nextjs.ts)

**Implementation**:

```typescript
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

async function initNextJS(options: InitOptions): Promise<void> {
  const projectName = options.projectName || 'my-collie-app';
  const useTypescript = options.typescript !== false; // default to true
  
  console.log(`Creating Next.js project with Collie support: ${projectName}`);
  
  // Step 1: Create Next.js app using create-next-app
  const createCommand = useTypescript
    ? `npx create-next-app@latest ${projectName} --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"`
    : `npx create-next-app@latest ${projectName} --javascript --tailwind --eslint --app --src-dir --import-alias "@/*"`;
  
  console.log('Creating Next.js application...');
  execSync(createCommand, { stdio: 'inherit' });
  
  const projectPath = path.join(process.cwd(), projectName);
  
  // Step 2: Install Collie dependencies
  console.log('Installing Collie packages...');
  execSync(
    'npm install --save-dev @collie-lang/next @collie-lang/webpack',
    { cwd: projectPath, stdio: 'inherit' }
  );
  
  // Step 3: Update next.config.js
  console.log('Configuring Next.js for Collie...');
  const nextConfigPath = path.join(projectPath, 'next.config.js');
  const nextConfigContent = useTypescript
    ? `import { withCollie } from '@collie-lang/next';\n\nconst nextConfig = withCollie({\n  // Your Next.js config here\n});\n\nexport default nextConfig;\n`
    : `const { withCollie } = require('@collie-lang/next');\n\nmodule.exports = withCollie({\n  // Your Next.js config here\n});\n`;
  
  fs.writeFileSync(nextConfigPath, nextConfigContent);
  
  // Step 4: Create TypeScript declarations for .collie files
  if (useTypescript) {
    const collieTypeDefsPath = path.join(projectPath, 'src', 'collie.d.ts');
    const collieTypeDefs = `declare module '*.collie' {\n  const Component: React.ComponentType<any>;\n  export default Component;\n}\n`;
    fs.writeFileSync(collieTypeDefsPath, collieTypeDefs);
  }
  
  // Step 5: Create a sample Collie component
  const sampleComponentDir = path.join(projectPath, 'src', 'components');
  if (!fs.existsSync(sampleComponentDir)) {
    fs.mkdirSync(sampleComponentDir, { recursive: true });
  }
  
  const sampleComponentPath = path.join(sampleComponentDir, 'Welcome.collie');
  const sampleComponentContent = `export default function Welcome(props)
  div
    h1.text-4xl.font-bold Hello from Collie!
    p.text-gray-600.mt-2 This component was written in Collie template language.
    p.mt-4.text-sm Framework: {props.framework || 'Next.js'}
`;
  
  fs.writeFileSync(sampleComponentPath, sampleComponentContent);
  
  // Step 6: Update the main page to use the Collie component
  const pagePath = path.join(projectPath, 'src', 'app', 'page.tsx');
  const pageContent = `import Welcome from '@/components/Welcome.collie';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <Welcome framework="Next.js" />
    </main>
  );
}
`;
  
  fs.writeFileSync(pagePath, pageContent);
  
  console.log('\n✅ Next.js project with Collie support created successfully!');
  console.log(`\nTo get started:`);
  console.log(`  cd ${projectName}`);
  console.log(`  npm run dev`);
  console.log(`\nThen open http://localhost:3000 in your browser.`);
}
```

**Key Features**:
- ✅ Uses `create-next-app` for proper Next.js scaffolding
- ✅ Installs Collie packages as dev dependencies
- ✅ Configures `next.config.js` with `withCollie`
- ✅ Creates TypeScript declarations for `.collie` files
- ✅ Includes a sample Collie component
- ✅ Updates the main page to demonstrate usage

**Dependencies**: 
- Requires Phase 2 (Next.js plugin) to be published or linked
- Requires Phase 3.2 (framework option)

**Testing Requirements**:
1. Test with `--typescript` flag
2. Test with `--javascript` flag
3. Verify all files are created correctly
4. Verify `npm run dev` works in created project

**Expected Output**: A fully functional Next.js project with Collie integration.

---

#### Step 3.4: Update CLI Package Dependencies

**Action**: Add required dependencies to CLI package.

**Location**: [`packages/cli/package.json`](packages/cli/package.json)

**Changes**:
```json
{
  "dependencies": {
    "prompts": "^2.4.2",
    "commander": "^11.0.0"
  },
  "devDependencies": {
    "@types/prompts": "^2.4.4"
  }
}
```

**Commands**:
```bash
cd packages/cli
pnpm install
```

**Dependencies**: None

**Validation**: `pnpm install` completes without errors.

---

#### Step 3.5: Build and Test CLI

**Action**: Build the CLI and test the new Next.js initialization.

**Commands**:
```bash
cd packages/cli
pnpm build
```

**Manual Test**:
```bash
# Link CLI locally for testing
cd packages/cli
npm link

# Test Next.js initialization
cd /tmp
collie init --nextjs test-nextjs-app

# Verify the project works
cd test-nextjs-app
npm run dev
```

**Dependencies**: Requires all of Phase 3

**Validation**:
- ✅ CLI builds without errors
- ✅ `collie init --nextjs` creates a project
- ✅ Created project structure is correct
- ✅ `npm run dev` starts the Next.js server
- ✅ Sample Collie component renders correctly

---

### Phase 4: Create Example Next.js Project

#### Step 4.1: Create Example Project Directory

**Action**: Create a complete example Next.js project in the repository.

**Location**: `examples/nextjs-app-router/`

**Purpose**: Serve as both documentation and integration testing.

**Structure**:
```
examples/nextjs-app-router/
├── src/
│   ├── app/
│   │   ├── page.tsx
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── Welcome.collie
│   │   ├── Card.collie
│   │   └── Navigation.collie
│   └── collie.d.ts
├── public/
├── next.config.js
├── package.json
├── tsconfig.json
└── README.md
```

**Dependencies**: Requires Phase 2 (Next.js plugin) to be built.

---

#### Step 4.2: Configure Example Project

**Action**: Create all necessary configuration files.

**Files to create**:

1. `examples/nextjs-app-router/package.json`:
```json
{
  "name": "nextjs-app-router-collie-example",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "@collie-lang/next": "workspace:*",
    "@collie-lang/webpack": "workspace:*",
    "@types/node": "^20.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "typescript": "^5.0.0"
  }
}
```

2. `examples/nextjs-app-router/next.config.js`:
```javascript
const { withCollie } = require('@collie-lang/next');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next.js configuration options
};

module.exports = withCollie(nextConfig);
```

3. `examples/nextjs-app-router/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

4. `examples/nextjs-app-router/src/collie.d.ts`:
```typescript
declare module '*.collie' {
  const Component: React.ComponentType<any>;
  export default Component;
}
```

**Dependencies**: Requires Phase 4.1

**Validation**: All configuration files are created with valid syntax.

---

#### Step 4.3: Create Example Collie Components

**Action**: Create demonstration components in Collie syntax.

**Files to create**:

1. `examples/nextjs-app-router/src/components/Welcome.collie`:
```
export default function Welcome(props)
  div.max-w-2xl.mx-auto.text-center
    h1.text-5xl.font-bold.mb-4 Welcome to Collie + Next.js
    p.text-xl.text-gray-600.mb-8 
      | Build modern web applications with the power of Collie's 
      | indentation-based templates and Next.js's performance.
    
    if props.showButton
      button.bg-blue-500.hover:bg-blue-600.text-white.px-6.py-3.rounded-lg(
        onClick={props.onButtonClick}
      ) Get Started
```

2. `examples/nextjs-app-router/src/components/Card.collie`:
```
export default function Card(props)
  div.border.rounded-lg.p-6.shadow-md.hover:shadow-lg.transition-shadow
    if props.title
      h3.text-2xl.font-semibold.mb-2 {props.title}
    
    div.text-gray-700
      {props.children}
    
    if props.footer
      div.mt-4.pt-4.border-t.text-sm.text-gray-500
        {props.footer}
```

3. `examples/nextjs-app-router/src/components/Navigation.collie`:
```
export default function Navigation(props)
  nav.bg-gray-800.text-white.p-4
    div.container.mx-auto.flex.justify-between.items-center
      a.text-xl.font-bold(href="/") Collie + Next.js
      
      ul.flex.space-x-6
        for item in props.links
          li
            a.hover:text-blue-400.transition-colors(href={item.href})
              {item.label}
```

**Key Features Demonstrated**:
- ✅ Props usage
- ✅ Conditional rendering (`if`)
- ✅ Iteration (`for`)
- ✅ Event handlers
- ✅ CSS classes (Tailwind)
- ✅ Children props
- ✅ Nested components

**Dependencies**: Requires Phase 4.2

**Validation**: Files are created with valid Collie syntax.

---

#### Step 4.4: Create Example Pages

**Action**: Create Next.js pages that use the Collie components.

**Files to create**:

1. `examples/nextjs-app-router/src/app/layout.tsx`:
```typescript
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Collie + Next.js Example',
  description: 'Example Next.js application using Collie templates',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

2. `examples/nextjs-app-router/src/app/page.tsx`:
```typescript
'use client';

import { useState } from 'react';
import Welcome from '@/components/Welcome.collie';
import Card from '@/components/Card.collie';
import Navigation from '@/components/Navigation.collie';

export default function Home() {
  const [count, setCount] = useState(0);
  
  const navLinks = [
    { href: '/', label: 'Home' },
    { href: '/about', label: 'About' },
    { href: 'https://github.com/yourusername/collie', label: 'GitHub' },
  ];
  
  return (
    <>
      <Navigation links={navLinks} />
      
      <main className="min-h-screen p-8">
        <Welcome 
          showButton={true} 
          onButtonClick={() => setCount(count + 1)} 
        />
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12 max-w-6xl mx-auto">
          <Card 
            title="Fast Compilation" 
            footer="Powered by @collie-lang/compiler"
          >
            Collie compiles to optimized JSX at build time for maximum performance.
          </Card>
          
          <Card 
            title="Type Safe" 
            footer="Full TypeScript support"
          >
            Get autocomplete and type checking for your Collie components.
          </Card>
          
          <Card 
            title="Framework Agnostic" 
            footer="Works with Vite and Next.js"
          >
            Use the same Collie templates across different frameworks.
          </Card>
        </div>
        
        <div className="text-center mt-12">
          <p className="text-lg">Button clicked: {count} times</p>
        </div>
      </main>
    </>
  );
}
```

3. `examples/nextjs-app-router/src/app/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

**Dependencies**: Requires Phase 4.3 (components)

**Validation**: Page renders correctly with all Collie components.

---

#### Step 4.5: Add Example Project README

**Action**: Create comprehensive README for the example project.

**Location**: `examples/nextjs-app-router/README.md`

**Content**:
```markdown
# Next.js + Collie Example (App Router)

This example demonstrates how to use Collie template language in a Next.js application using the App Router.

## Features

- ✅ Next.js 14 with App Router
- ✅ TypeScript support
- ✅ Collie template components
- ✅ Tailwind CSS for styling
- ✅ Hot Module Replacement (HMR)

## Getting Started

### Installation

\`\`\`bash
pnpm install
\`\`\`

### Development

\`\`\`bash
pnpm dev
\`\`\`

Open [http://localhost:3000](http://localhost:3000) to see the result.

## Project Structure

\`\`\`
src/
├── app/              # Next.js App Router pages
│   ├── layout.tsx    # Root layout
│   └── page.tsx      # Home page
├── components/       # Reusable components
│   ├── Welcome.collie
│   ├── Card.collie
│   └── Navigation.collie
└── collie.d.ts      # TypeScript declarations for .collie files
\`\`\`

## Collie Components

This example includes three Collie components demonstrating key features:

### Welcome.collie
- Conditional rendering
- Event handlers
- Props usage

### Card.collie
- Children props
- Multiple conditional sections
- Structured layouts

### Navigation.collie
- Iteration with \`for\` loops
- Dynamic link generation

## Configuration

The project uses \`@collie-lang/next\` plugin to configure Next.js:

\`\`\`javascript
// next.config.js
const { withCollie } = require('@collie-lang/next');

module.exports = withCollie({
  // Your Next.js config
});
\`\`\`

## TypeScript

TypeScript declarations for \`.collie\` files are defined in \`src/collie.d.ts\`:

\`\`\`typescript
declare module '*.collie' {
  const Component: React.ComponentType<any>;
  export default Component;
}
\`\`\`

## Learn More

- [Collie Documentation](../../README.md)
- [Next.js Documentation](https://nextjs.org/docs)
```

**Dependencies**: Requires Phase 4.4

**Validation**: README is clear, accurate, and helpful.

---

#### Step 4.6: Test Example Project

**Action**: Verify the example project works end-to-end.

**Commands**:
```bash
cd examples/nextjs-app-router
pnpm install
pnpm dev
```

**Manual Testing**:
1. Open http://localhost:3000
2. Verify all Collie components render
3. Test button click interaction (counter)
4. Check browser console for errors
5. Verify hot reload works when editing `.collie` files
6. Test production build: `pnpm build && pnpm start`

**Dependencies**: Requires all of Phase 4

**Validation**:
- ✅ Development server starts without errors
- ✅ All components render correctly
- ✅ Interactivity works (button clicks)
- ✅ HMR works for `.collie` files
- ✅ Production build succeeds
- ✅ No console errors or warnings

---

### Phase 5: Documentation and Testing

#### Step 5.1: Update Root README

**Action**: Update the main project README to document Next.js support.

**Location**: [`README.md`](README.md)

**Sections to add/update**:

1. Add Next.js to "Supported Frameworks" section:
```markdown
## Supported Frameworks

Collie currently supports:

- ✅ **Vite** - via `@collie-lang/vite`
- ✅ **Next.js** - via `@collie-lang/next`
```

2. Add Quick Start for Next.js:
```markdown
### Quick Start with Next.js

\`\`\`bash
# Create a new Next.js project with Collie
npx @collie-lang/cli init --nextjs my-app

# Or add Collie to an existing Next.js project
npm install --save-dev @collie-lang/next @collie-lang/webpack

# Configure next.config.js
const { withCollie } = require('@collie-lang/next');
module.exports = withCollie({});
\`\`\`
```

3. Add link to Next.js example:
```markdown
## Examples

- [Vite + React + TypeScript](./examples/vite-react-ts)
- [Next.js + App Router](./examples/nextjs-app-router)
```

**Dependencies**: Requires Phases 1-4 to be complete

**Validation**: README accurately reflects new capabilities.

---

#### Step 5.2: Create Migration Guide

**Action**: Create a guide for migrating from Vite to Next.js or vice versa.

**Location**: `docs/migration.md` (create `docs/` directory if needed)

**Content**:
```markdown
# Migration Guide

## Migrating Collie Projects Between Frameworks

Collie templates (`.collie` files) are framework-agnostic and can be used in both Vite and Next.js projects without modification. Only the build configuration needs to change.

## From Vite to Next.js

### 1. Update Dependencies

Remove Vite dependencies:
\`\`\`bash
npm uninstall vite @vitejs/plugin-react @collie-lang/vite
\`\`\`

Install Next.js dependencies:
\`\`\`bash
npm install next react react-dom
npm install --save-dev @collie-lang/next @collie-lang/webpack
\`\`\`

### 2. Update Configuration

Replace `vite.config.ts` with `next.config.js`:

\`\`\`javascript
const { withCollie } = require('@collie-lang/next');

module.exports = withCollie({
  // Your Next.js config
});
\`\`\`

### 3. Restructure Project

Move files to Next.js structure:
- `src/main.tsx` → `src/app/layout.tsx` (App Router)
- `src/App.tsx` → `src/app/page.tsx`
- Keep `.collie` components in `src/components/`

### 4. Update Imports

No changes needed! Your Collie imports work the same:
\`\`\`typescript
import MyComponent from '@/components/MyComponent.collie';
\`\`\`

## From Next.js to Vite

### 1. Update Dependencies

Remove Next.js dependencies:
\`\`\`bash
npm uninstall next @collie-lang/next @collie-lang/webpack
\`\`\`

Install Vite dependencies:
\`\`\`bash
npm install vite @vitejs/plugin-react
npm install --save-dev @collie-lang/vite
\`\`\`

### 2. Update Configuration

Replace `next.config.js` with `vite.config.ts`:

\`\`\`typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import collie from '@collie-lang/vite';

export default defineConfig({
  plugins: [collie(), react()],
});
\`\`\`

### 3. Restructure Project

Move files to Vite structure:
- `src/app/page.tsx` → `src/App.tsx`
- Create `src/main.tsx` as entry point
- Create `index.html` in project root

### 4. Update Imports

No changes needed! Your Collie imports work the same.

## Framework-Specific Features

### Next.js Features (Not Available in Vite)
- Server Components
- Server Actions
- File-based routing
- Incremental Static Regeneration (ISR)

If your Collie components use any Next.js-specific features, they'll need refactoring when migrating to Vite.

### Vite Features (Not Available in Next.js)
- Lightning-fast HMR
- Simpler configuration
- ESBuild-based builds

## Best Practices

1. **Keep Components Pure**: Write Collie components that don't depend on framework-specific APIs
2. **Use Props**: Pass data via props rather than using framework-specific context or data fetching
3. **Test on Both**: If building a library, test your Collie components on both frameworks
```

**Dependencies**: None (documentation only)

**Validation**: Guide is clear and accurate.

---

#### Step 5.3: Add Package READMEs

**Action**: Ensure both new packages have comprehensive READMEs.

**Locations**:
- `packages/webpack/README.md` (already created in Step 1.1)
- `packages/next/README.md` (already created in Step 2.1)

**Enhancements to add**:

For `packages/webpack/README.md`, add:
```markdown
## Advanced Usage

### With TypeScript

\`\`\`typescript
// webpack.config.ts
import type { Configuration } from 'webpack';

const config: Configuration = {
  module: {
    rules: [
      {
        test: /\.collie$/,
        use: '@collie-lang/webpack',
      },
    ],
  },
};

export default config;
\`\`\`

### Loader Options

Currently, the loader doesn't accept options. The compiler uses default settings optimized for production builds.

## How It Works

1. Webpack encounters a `.collie` file import
2. The loader receives the source content
3. `@collie-lang/compiler` parses and generates JSX
4. The loader returns the JSX to webpack
5. Webpack's configured JSX transformer (babel/swc/esbuild) processes the JSX
6. Final JavaScript is bundled

## Source Maps

Source maps are automatically generated for debugging. They map the compiled JavaScript back to the original `.collie` source.
```

For `packages/next/README.md`, add:
```markdown
## Advanced Configuration

### With Custom Webpack Config

\`\`\`javascript
const { withCollie } = require('@collie-lang/next');

module.exports = withCollie({
  webpack(config, { isServer }) {
    // Your custom webpack config
    if (!isServer) {
      // Client-side only config
    }
    return config;
  },
});
\`\`\`

### With Other Plugins

Chain multiple Next.js plugins:

\`\`\`javascript
const { withCollie } = require('@collie-lang/next');
const withBundleAnalyzer = require('@next/bundle-analyzer')();

module.exports = withBundleAnalyzer(
  withCollie({
    // Your config
  })
);
\`\`\`

## App Router vs Pages Router

Collie works with both Next.js routing paradigms:

**App Router** (Recommended):
\`\`\`tsx
// app/page.tsx
import MyComponent from '@/components/MyComponent.collie';

export default function Page() {
  return <MyComponent />;
}
\`\`\`

**Pages Router**:
\`\`\`tsx
// pages/index.tsx
import MyComponent from '@/components/MyComponent.collie';

export default function Page() {
  return <MyComponent />;
}
\`\`\`

## Server Components

Collie components can be used as React Server Components (in App Router):

\`\`\`collie
// components/ServerComponent.collie
export default function ServerComponent(props)
  div
    h1 Server-rendered: {props.data}
\`\`\`

\`\`\`tsx
// app/page.tsx (Server Component)
import ServerComponent from '@/components/ServerComponent.collie';

async function getData() {
  // Server-side data fetching
  return { message: 'Hello from server' };
}

export default async function Page() {
  const data = await getData();
  return <ServerComponent data={data.message} />;
}
\`\`\`

## Client Components

For interactive components, use the 'use client' directive:

\`\`\`tsx
// components/ClientWrapper.tsx
'use client';

import InteractiveComponent from './Interactive.collie';

export default function ClientWrapper() {
  const [state, setState] = useState(0);
  return <InteractiveComponent count={state} onClick={() => setState(state + 1)} />;
}
\`\`\`
```

**Dependencies**: Requires Phases 1 and 2

**Validation**: READMEs are comprehensive and accurate.

---

#### Step 5.4: Create Tests for Webpack Loader

**Action**: Add unit tests for the webpack loader.

**Location**: `packages/webpack/tests/loader.test.ts`

**Implementation**:
```typescript
import { describe, it, expect, vi } from 'vitest';
import loader from '../src/index';

describe('Collie Webpack Loader', () => {
  // Mock webpack loader context
  const createContext = (overrides = {}): any => ({
    cacheable: vi.fn(),
    async: vi.fn(() => vi.fn()),
    resourcePath: '/test/Component.collie',
    ...overrides,
  });
  
  it('should compile valid Collie source', async () => {
    const source = `export default function Test(props)\n  div Hello`;
    const context = createContext();
    const callback = vi.fn();
    context.async.mockReturnValue(callback);
    
    loader.call(context, source);
    
    expect(context.cacheable).toHaveBeenCalledWith(true);
    expect(callback).toHaveBeenCalled();
    expect(callback.mock.calls[0][0]).toBeNull(); // no error
    expect(callback.mock.calls[0][1]).toContain('function Test'); // compiled code
  });
  
  it('should return errors for invalid syntax', async () => {
    const source = `invalid collie syntax here`;
    const context = createContext();
    const callback = vi.fn();
    context.async.mockReturnValue(callback);
    
    loader.call(context, source);
    
    expect(callback.mock.calls[0][0]).toBeInstanceOf(Error);
  });
  
  it('should generate source maps', async () => {
    const source = `export default function Test(props)\n  div Hello`;
    const context = createContext();
    const callback = vi.fn();
    context.async.mockReturnValue(callback);
    
    loader.call(context, source);
    
    expect(callback.mock.calls[0][2]).toBeDefined(); // source map
  });
});
```

**Setup**: Add test dependencies to `packages/webpack/package.json`:
```json
{
  "devDependencies": {
    "vitest": "^1.0.0"
  },
  "scripts": {
    "test": "vitest"
  }
}
```

**Dependencies**: Requires Phase 1

**Validation**: `pnpm test` passes all tests.

---

#### Step 5.5: Create Tests for Next.js Plugin

**Action**: Add tests for the Next.js plugin.

**Location**: `packages/next/tests/plugin.test.ts`

**Implementation**:
```typescript
import { describe, it, expect } from 'vitest';
import { withCollie } from '../src/index';

describe('Collie Next.js Plugin', () => {
  it('should add .collie to resolve extensions', () => {
    const config = withCollie({});
    
    expect(config.webpack).toBeDefined();
    
    const mockWebpackConfig = {
      resolve: { extensions: ['.js', '.jsx'] },
      module: { rules: [] },
    };
    
    const result = config.webpack!(mockWebpackConfig, {} as any);
    
    expect(result.resolve.extensions).toContain('.collie');
  });
  
  it('should add webpack loader rule', () => {
    const config = withCollie({});
    
    const mockWebpackConfig = {
      resolve: { extensions: [] },
      module: { rules: [] },
    };
    
    const result = config.webpack!(mockWebpackConfig, {} as any);
    
    expect(result.module.rules).toHaveLength(1);
    expect(result.module.rules[0].test).toEqual(/\.collie$/);
  });
  
  it('should preserve existing webpack config', () => {
    const customWebpack = (config: any) => {
      config.custom = true;
      return config;
    };
    
    const config = withCollie({ webpack: customWebpack });
    
    const mockWebpackConfig = {
      resolve: { extensions: [] },
      module: { rules: [] },
    };
    
    const result = config.webpack!(mockWebpackConfig, {} as any);
    
    expect(result.custom).toBe(true);
  });
  
  it('should preserve other Next.js config options', () => {
    const config = withCollie({
      reactStrictMode: true,
      images: {
        domains: ['example.com'],
      },
    });
    
    expect(config.reactStrictMode).toBe(true);
    expect(config.images?.domains).toContain('example.com');
  });
});
```

**Setup**: Add test dependencies to `packages/next/package.json`:
```json
{
  "devDependencies": {
    "vitest": "^1.0.0"
  },
  "scripts": {
    "test": "vitest"
  }
}
```

**Dependencies**: Requires Phase 2

**Validation**: `pnpm test` passes all tests.

---

#### Step 5.6: Add Integration Tests

**Action**: Create end-to-end integration tests.

**Location**: `tests/integration/nextjs.test.ts` (create `tests/` in root if needed)

**Purpose**: Test the full pipeline from `.collie` source to compiled output.

**Implementation**:
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';

describe('Next.js Integration', () => {
  let testDir: string;
  
  beforeAll(async () => {
    // Create a temporary directory for testing
    testDir = path.join(tmpdir(), `collie-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
  });
  
  afterAll(async () => {
    // Clean up
    await fs.rm(testDir, { recursive: true, force: true });
  });
  
  it('should create Next.js project with CLI', () => {
    execSync('collie init --nextjs test-app', {
      cwd: testDir,
      stdio: 'inherit',
    });
    
    const projectPath = path.join(testDir, 'test-app');
    expect(fs.access(projectPath)).resolves.not.toThrow();
  });
  
  it('should build Next.js project successfully', () => {
    const projectPath = path.join(testDir, 'test-app');
    
    execSync('npm run build', {
      cwd: projectPath,
      stdio: 'inherit',
    });
    
    const buildPath = path.join(projectPath, '.next');
    expect(fs.access(buildPath)).resolves.not.toThrow();
  });
  
  it('should compile Collie components in build output', async () => {
    const projectPath = path.join(testDir, 'test-app');
    
    // Check that Collie components were compiled
    const buildPath = path.join(projectPath, '.next');
    const files = await fs.readdir(buildPath, { recursive: true });
    
    // Should have compiled JavaScript files (not .collie files)
    expect(files.some(f => f.endsWith('.js'))).toBe(true);
    expect(files.some(f => f.endsWith('.collie'))).toBe(false);
  });
}, { timeout: 120000 }); // 2 minute timeout for slow CI
```

**Dependencies**: Requires all previous phases

**Validation**: Integration tests pass in CI/CD environment.

---

#### Step 5.7: Update Monorepo Configuration

**Action**: Ensure new packages are properly configured in the monorepo.

**Location**: Root [`package.json`](package.json) and [`pnpm-workspace.yaml`](pnpm-workspace.yaml)

**Verify pnpm-workspace.yaml includes**:
```yaml
packages:
  - 'packages/*'
  - 'examples/*'
```

**Add build scripts to root package.json**:
```json
{
  "scripts": {
    "build": "pnpm -r --filter='@collie-lang/*' build",
    "test": "pnpm -r --filter='@collie-lang/*' test",
    "dev": "pnpm -r --parallel --filter='@collie-lang/*' dev"
  }
}
```

**Dependencies**: None

**Validation**: `pnpm build` and `pnpm test` work from root.

---

#### Step 5.8: Create Changelog Entry

**Action**: Document the new Next.js support feature.

**Location**: `.changeset/nextjs-support.md` (or use changeset CLI)

**Command**:
```bash
npx changeset add
```

**Content**:
```markdown
---
'@collie-lang/webpack': major
'@collie-lang/next': major
'@collie-lang/cli': minor
---

Add Next.js support to Collie

This release adds comprehensive Next.js support alongside the existing Vite integration:

**New Packages:**
- `@collie-lang/webpack` - Webpack loader for Collie templates
- `@collie-lang/next` - Next.js plugin with automatic configuration

**Features:**
- Full support for Next.js App Router and Pages Router
- TypeScript declarations for `.collie` modules
- CLI enhancement: `collie init --nextjs`
- Complete example project with best practices
- Seamless integration with Next.js Fast Refresh

**Migration:**
Existing Collie templates work without modification in Next.js. Only build configuration needs updating. See migration guide for details.
```

**Dependencies**: Requires all phases to be complete

**Validation**: Changelog is clear and follows conventional format.

---

### Summary of Implementation Phases

**Phase 1: Webpack Loader** (~2-3 hours)
- Package setup
- Loader implementation
- Testing

**Phase 2: Next.js Plugin** (~1-2 hours)
- Package setup
- Plugin implementation
- Testing

**Phase 3: CLI Enhancement** (~3-4 hours)
- Framework selection
- Next.js scaffolding
- Testing

**Phase 4: Example Project** (~2-3 hours)
- Project setup
- Component creation
- Documentation

**Phase 5: Documentation & Testing** (~3-4 hours)
- READMEs and guides
- Unit tests
- Integration tests
- Monorepo configuration

**Total Estimated Time**: 11-16 hours of focused development work.

### Validation Checklist

After completing all phases, verify:

- [ ] All packages build without errors
- [ ] All tests pass (`pnpm test` in each package)
- [ ] CLI can create new Next.js projects
- [ ] Created projects run in development mode
- [ ] Created projects build for production
- [ ] Example project demonstrates all features
- [ ] Documentation is complete and accurate
- [ ] Source maps work for debugging
- [ ] HMR works in development
- [ ] TypeScript types are correct
- [ ] No runtime errors in browser console
- [ ] Webpack loader handles errors gracefully
- [ ] Next.js plugin preserves existing config

### Future Enhancements (Out of Scope)

These items are not part of the initial implementation but should be considered for future releases:

1. **Turbopack Support**: Add native Turbopack loader when the API stabilizes
2. **Server Components Optimization**: Special handling for React Server Components
3. **Streaming SSR**: Optimize for Next.js streaming rendering
4. **Edge Runtime**: Test and optimize for Edge Runtime compatibility
5. **Image Optimization**: Special syntax for Next.js Image component
6. **MDX Integration**: Allow mixing Collie and MDX
7. **Performance Monitoring**: Bundle size analysis and optimization
8. **Developer Tools**: Browser extension for Collie debugging

---

## Conclusion

This implementation plan provides a complete roadmap for adding Next.js support to Collie. The approach leverages the existing compiler infrastructure while adding framework-specific integration layers. The result will be a seamless developer experience that matches the quality of the existing Vite integration.

**Key Success Factors**:
- Reuse the compiler without modification
- Follow Next.js and webpack best practices
- Maintain feature parity with Vite integration
- Provide comprehensive documentation and examples
- Ensure robust error handling and debugging support

When complete, developers will be able to use Collie templates in Next.js projects with the same ease and performance they currently enjoy in Vite projects.
