#!/usr/bin/env bash
set -euo pipefail

# ----------------------------------------
# Resolve paths
# ----------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT_DIR"

if [ ! -f "package.json" ]; then
  echo "[release-cdn] Error: package.json not found in $ROOT_DIR"
  exit 1
fi

# ----------------------------------------
# Read version from package.json
# ----------------------------------------

VERSION="$(node -p "require('./package.json').version" 2>/dev/null || true)"

if [ -z "$VERSION" ]; then
  echo "[release-cdn] Error: could not read version from package.json"
  exit 1
fi

echo "[release-cdn] Preparing CDN build for @collie-lang/html-runtime version: $VERSION"
read -r -p "Proceed with building and packaging version $VERSION? [y/N] " REPLY

case "$REPLY" in
  y|Y)
    echo "[release-cdn] Continuing with build..."
    ;;
  *)
    echo "[release-cdn] Aborted by user."
    exit 1
    ;;
esac

# ----------------------------------------
# Warn on dirty working tree
# ----------------------------------------

if command -v git >/dev/null 2>&1; then
  if git status --porcelain | grep -q .; then
    echo "[release-cdn] Warning: Working tree has uncommitted changes."
    read -r -p "Proceed anyway? [y/N] " DIRTY_REPLY
    case "$DIRTY_REPLY" in
      y|Y) ;;
      *) echo "[release-cdn] Aborted due to dirty working tree."; exit 1 ;;
    esac
  fi
fi

# ----------------------------------------
# Run the existing prepare-cdn pipeline
# ----------------------------------------

echo "[release-cdn] Running pnpm prepare-cdn..."
pnpm prepare-cdn

# Re-read version in case you bumped it just before running
VERSION="$(node -p "require('./package.json').version")"
FULL_TAG="v${VERSION}"
CLOUDFLARE_URL="https://dash.cloudflare.com/fc35422b99c410a03b96aa036215b7fc/pages/view/collie-cdn"

echo "[release-cdn] Build complete."
echo "[release-cdn] CDN artifacts are located at:"
echo "  dist/${FULL_TAG}/collie-html-runtime.js"
echo "  dist/${FULL_TAG}/collie-convert.js"
echo
echo "[release-cdn] Upload the dist/${FULL_TAG}/ folder to Cloudflare at ${CLOUDFLARE_URL}"
