#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo
echo "🔨 Building Collie..."
pnpm build

echo
echo "🧹 Cleaning existing global @collie-lang/* npm installs..."

GLOBAL_PACKAGES="$(
  npm ls -g --depth=0 --json 2>/dev/null | node - <<'NODE'
    const fs = require('fs');
    const input = fs.readFileSync(0, 'utf8').trim() || '{}';
    const data = JSON.parse(input);
    const deps = data.dependencies || {};
    Object.keys(deps)
      .filter((name) => name.startsWith('@collie-lang/'))
      .sort()
      .forEach((name) => console.log(name));
NODE
)"

if [[ -n "$GLOBAL_PACKAGES" ]]; then
  while IFS= read -r pkg; do
    [[ -z "$pkg" ]] && continue
    echo "  • npm uninstall -g $pkg"
    npm uninstall -g "$pkg" || true
  done <<< "$GLOBAL_PACKAGES"
else
  echo "  • No global @collie-lang packages found"
fi

echo
echo "🔗 Linking all Collie packages globally via npm link..."

PACKAGES_DIR="$ROOT_DIR/packages"
if [[ ! -d "$PACKAGES_DIR" ]]; then
  echo "❌ packages/ directory not found at: $PACKAGES_DIR"
  echo "   Repo root detected as: $ROOT_DIR"
  exit 1
fi

LINK_NAMES=()

for pkg_dir in "$PACKAGES_DIR"/*; do
  [[ -d "$pkg_dir" ]] || continue
  [[ -f "$pkg_dir/package.json" ]] || continue

  echo
  echo "➡️  Linking package: $(basename "$pkg_dir")"

  PKG_NAME="$(node -p "require('$pkg_dir/package.json').name")"

  (
    cd "$pkg_dir"
    npm link
  )

  LINK_NAMES+=("$PKG_NAME")
done

echo
echo "✅ Collie global links reset and re-linked successfully."
echo
echo "Next steps in your template repo (npm project):"
echo
echo "  npm link ${LINK_NAMES[*]}"
echo
echo "  npx collie init"
