/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const tempDir = path.join(rootDir, "dist", "temp");
const distDir = path.join(rootDir, "dist");

// Read package version
const pkg = require(path.join(rootDir, "package.json"));
const version = pkg.version; // e.g. "1.0.0"

// Derived version tags
const majorTag = "v" + version.split(".")[0]; // "v1"
const fullTag = "v" + version;                // "v1.0.0"

const targets = ["collie-html-runtime", "collie-convert"];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function findSourceFile(baseName) {
  const jsPath = path.join(tempDir, baseName + ".js");
  const mjsPath = path.join(tempDir, baseName + ".mjs");

  if (fs.existsSync(jsPath)) return jsPath;
  if (fs.existsSync(mjsPath)) return mjsPath;

  return null;
}

function copyRuntimeFile(baseName, versionTag) {
  const src = findSourceFile(baseName);
  if (!src) {
    console.warn(
      `[build-versioned] Missing "${baseName}.js/.mjs" in dist/temp; skipping for ${versionTag}.`
    );
    return;
  }

  const targetDir = path.join(distDir, versionTag);
  ensureDir(targetDir);

  const dest = path.join(targetDir, baseName + ".js"); // always emit .js
  fs.copyFileSync(src, dest);

  console.log(
    `[build-versioned] Copied ${path.basename(src)} -> ${path.relative(
      rootDir,
      dest
    )}`
  );
}

function main() {
  if (!fs.existsSync(tempDir)) {
    console.warn(
      `[build-versioned] No dist/temp directory found at ${tempDir}. Did you run "pnpm build" first?`
    );
    return;
  }

  for (const baseName of targets) {
    // Copy to v1/
    copyRuntimeFile(baseName, majorTag);
    // Copy to v1.0.0/
    copyRuntimeFile(baseName, fullTag);
  }

  // Clean up temp dir
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
    console.log(`[build-versioned] Cleaned up ${path.relative(rootDir, tempDir)}`);
  } catch (err) {
    console.warn(
      `[build-versioned] Failed to remove temp dir ${tempDir}:`,
      err.message
    );
  }
}

main();
