#!/usr/bin/env node
/**
 * Stage 2: Copy compiled runtime files into versioned directories.
 */
const fs = require("fs");
const path = require("path");

const packageRoot = path.resolve(__dirname, "..");
const distDir = path.join(packageRoot, "dist");
const tempDir = path.join(distDir, "temp");

function readPackageVersion() {
  const pkgPath = path.join(packageRoot, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  if (!pkg.version) {
    throw new Error("Missing version in package.json");
  }
  return pkg.version;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyRuntimeFiles(targetDirs) {
  const files = ["collie-html-runtime.js", "collie-convert.js"];
  for (const file of files) {
    const sourcePath = path.join(tempDir, file);
    if (!fs.existsSync(sourcePath)) {
      console.warn(`[build-versioned] Missing "${file}" in dist/temp; skipping.`);
      continue;
    }
    for (const targetDir of targetDirs) {
      const targetPath = path.join(targetDir, file);
      fs.copyFileSync(sourcePath, targetPath);
      console.log(`[build-versioned] Copied ${file} -> ${targetPath}`);
    }
  }
}

function removeTempDir() {
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function main() {
  if (!fs.existsSync(tempDir)) {
    console.error('[build-versioned] Missing "dist/temp" directory. Did you run "pnpm build" first?');
    process.exit(1);
  }

  const version = readPackageVersion();
  const major = version.split(".")[0] || "1";
  const majorTag = `v${major}`;
  const versionTag = `v${version}`;

  const targetDirs = [
    path.join(distDir, majorTag),
    path.join(distDir, versionTag),
  ];

  targetDirs.forEach(ensureDir);
  copyRuntimeFiles(targetDirs);
  removeTempDir();
}

main();
