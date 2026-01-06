#!/usr/bin/env node
/**
 * local-pack.mjs
 * 
 * Builds all publishable packages and creates npm-compatible tarballs
 * for local testing in external npm projects without publishing to npm.
 * 
 * Usage:
 *   pnpm local:pack
 * 
 * Output:
 *   - Tarballs in ./.local-packs/*.tgz
 *   - Manifest in ./.local-packs/manifest.json
 *   - Install commands printed to console
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');
const packagesDir = join(rootDir, 'packages');
const packDestination = join(rootDir, '.local-packs');

console.log('🎯 Collie Local Pack\n');

// Step 1: Ensure .local-packs directory exists
if (!existsSync(packDestination)) {
  mkdirSync(packDestination, { recursive: true });
  console.log(`✓ Created ${packDestination}\n`);
} else {
  console.log(`✓ Using ${packDestination}\n`);
}

// Step 2: Discover all packages
const packageDirs = readdirSync(packagesDir)
  .filter(name => {
    const pkgPath = join(packagesDir, name);
    return existsSync(join(pkgPath, 'package.json'));
  });

const publishablePackages = [];

for (const dir of packageDirs) {
  const pkgJsonPath = join(packagesDir, dir, 'package.json');
  const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
  
  if (pkgJson.private !== true) {
    publishablePackages.push({
      name: pkgJson.name,
      version: pkgJson.version,
      path: join(packagesDir, dir),
      dirName: dir
    });
  }
}

console.log(`📦 Found ${publishablePackages.length} publishable package(s):\n`);
publishablePackages.forEach(pkg => {
  console.log(`   - ${pkg.name}@${pkg.version}`);
});
console.log('');

// Step 3: Build all publishable packages
console.log('🔨 Building packages...\n');
try {
  const packageFilters = publishablePackages
    .map(pkg => `--filter="${pkg.name}"`)
    .join(' ');
  
  execSync(`pnpm -r ${packageFilters} build`, {
    cwd: rootDir,
    stdio: 'inherit'
  });
  console.log('\n✓ Build completed\n');
} catch (error) {
  console.error('❌ Build failed');
  process.exit(1);
}

// Step 4: Pack each package into tarballs
console.log('📦 Creating tarballs...\n');
const manifest = {};
const tarballs = [];

for (const pkg of publishablePackages) {
  try {
    const output = execSync(
      `npm pack --silent --pack-destination "${packDestination}"`,
      {
        cwd: pkg.path,
        encoding: 'utf-8'
      }
    ).trim();
    
    const tarballName = output.split('\n').pop();
    const tarballPath = join(packDestination, tarballName);
    
    manifest[pkg.name] = {
      version: pkg.version,
      tarball: tarballName,
      path: tarballPath
    };
    
    tarballs.push({
      name: pkg.name,
      tarball: tarballName,
      path: tarballPath
    });
    
    console.log(`   ✓ ${pkg.name} → ${tarballName}`);
  } catch (error) {
    console.error(`   ❌ Failed to pack ${pkg.name}:`, error.message);
    process.exit(1);
  }
}

console.log('');

// Step 5: Write manifest.json
const manifestPath = join(packDestination, 'manifest.json');
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
console.log(`✓ Manifest written to ${manifestPath}\n`);

// Step 6: Generate install commands
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📋 Installation Commands for External npm Project');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Categorize packages by typical usage
const buildTimePackages = [
  '@collie-lang/vite',
  '@collie-lang/webpack',
  '@collie-lang/next',
  '@collie-lang/cli',
  '@collie-lang/storybook',
  '@collie-lang/expo'
];

const runtimePackages = [
  '@collie-lang/react'
];

const corePackages = [
  '@collie-lang/compiler',
  '@collie-lang/config'
];

const devDeps = tarballs
  .filter(t => buildTimePackages.includes(t.name))
  .map(t => t.path);

const deps = tarballs
  .filter(t => runtimePackages.includes(t.name))
  .map(t => t.path);

const coreDeps = tarballs
  .filter(t => corePackages.includes(t.name))
  .map(t => t.path);

// All packages as one command (simplest)
console.log('Install all packages (simplest):');
console.log('─────────────────────────────────\n');
const allPaths = tarballs.map(t => t.path).join(' ');
console.log(`npm install ${allPaths}\n\n`);

// Separated by dependency type (more precise)
console.log('Install by dependency type (recommended):');
console.log('──────────────────────────────────────────\n');

if (deps.length > 0) {
  console.log('# Runtime dependencies:');
  console.log(`npm install ${deps.join(' ')}\n`);
}

if (devDeps.length > 0) {
  console.log('# Build-time / dev dependencies:');
  console.log(`npm install -D ${devDeps.join(' ')}\n`);
}

if (coreDeps.length > 0) {
  console.log('# Core packages (usually auto-installed as deps):');
  console.log(`# npm install ${coreDeps.join(' ')}\n`);
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
console.log('✅ Done! Tarballs ready in .local-packs/\n');
