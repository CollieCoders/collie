#!/usr/bin/env bash
set -euo pipefail

# Hard fail if not actually running in bash (prevents sh/dash confusion)
if [[ -z "${BASH_VERSION:-}" ]]; then
  echo "✖ This script must be run with bash. Try: bash ./scripts/publish-all.sh" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGES_DIR="$ROOT_DIR/packages"
NPMRC_FILE="$ROOT_DIR/.npmrc"

log() { printf "\n▶ %s\n" "$*"; }
die() { printf "\n✖ %s\n" "$*" >&2; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

require_file() {
  [[ -f "$1" ]] || die "Required file not found: $1"
}

npmrc_set() {
  local key="$1"
  local value="$2"

  require_file "$NPMRC_FILE"

  if grep -qE "^${key}[[:space:]]*=" "$NPMRC_FILE"; then
    # macOS sed in-place
    sed -i '' -E "s/^(${key}[[:space:]]*=[[:space:]]*).*\$/\1${value}/" "$NPMRC_FILE"
  else
    printf "\n%s=%s\n" "$key" "$value" >> "$NPMRC_FILE"
  fi
}

npmrc_assert_false() {
  require_file "$NPMRC_FILE"

  local link prefer
  link="$(sed -nE 's/^link-workspace-packages[[:space:]]*=[[:space:]]*(.*)$/\1/p' "$NPMRC_FILE" | tail -n 1 || true)"
  prefer="$(sed -nE 's/^prefer-workspace-packages[[:space:]]*=[[:space:]]*(.*)$/\1/p' "$NPMRC_FILE" | tail -n 1 || true)"

  [[ -n "$link" ]] || die ".npmrc missing link-workspace-packages. Add it explicitly."
  [[ -n "$prefer" ]] || die ".npmrc missing prefer-workspace-packages. Add it explicitly."

  [[ "$link" == "false" ]] || die "link-workspace-packages must be false before publishing (currently: $link)"
  [[ "$prefer" == "false" ]] || die "prefer-workspace-packages must be false before publishing (currently: $prefer)"
}

# Read package.json fields using node (keeps bash simple; avoids jq dependency)
pkg_json_read() {
  local pkg_dir="$1"
  local expr="$2" # JS expression operating on parsed JSON as `p`
  node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('$pkg_dir/package.json','utf8')); const v=($expr); if (v === undefined) process.exit(2); console.log(typeof v==='string'?v:JSON.stringify(v));"
}

# Checks:
# - all versions identical
# - internal deps referencing these packages match version
# - published version != local version (when already published)
check_versions() {
  log "Version checks: verifying versions are consistent and not already published"

  local dirs=( "cli" "collie-react" "compiler" "config" "vite" )

  # Read names + versions into parallel arrays (no associative arrays)
  local names=()
  local versions=()

  local base_version=""

  for d in "${dirs[@]}"; do
    local dir_path="$PACKAGES_DIR/$d"
    require_file "$dir_path/package.json"

    local name version
    name="$(pkg_json_read "$dir_path" "p.name")" || die "Failed reading name for $d"
    version="$(pkg_json_read "$dir_path" "p.version")" || die "Failed reading version for $d"

    names+=( "$name" )
    versions+=( "$version" )

    if [[ -z "$base_version" ]]; then
      base_version="$version"
    else
      if [[ "$version" != "$base_version" ]]; then
        die "Version mismatch: expected all packages to be $base_version, but $name is $version"
      fi
    fi
  done

  log "All local package versions match: $base_version"

  # Check internal dependency references match base_version
  for d in "${dirs[@]}"; do
    local dir_path="$PACKAGES_DIR/$d"

    local deps devDeps peerDeps
    deps="$(pkg_json_read "$dir_path" "p.dependencies||{}" 2>/dev/null || echo "{}")"
    devDeps="$(pkg_json_read "$dir_path" "p.devDependencies||{}" 2>/dev/null || echo "{}")"
    peerDeps="$(pkg_json_read "$dir_path" "p.peerDependencies||{}" 2>/dev/null || echo "{}")"

    # For each known package name, ensure if referenced, version string equals base_version
    for oname in "${names[@]}"; do
      node -e "
        const deps = $deps;
        const devDeps = $devDeps;
        const peerDeps = $peerDeps;
        const name = '$oname';
        const want = '$base_version';
        const hits = [];
        for (const [block, obj] of [['dependencies', deps], ['devDependencies', devDeps], ['peerDependencies', peerDeps]]) {
          if (obj && Object.prototype.hasOwnProperty.call(obj, name)) hits.push([block, obj[name]]);
        }
        if (hits.length) {
          const semver = require('semver');
          for (const [block, got] of hits) {
            const ok =
              got === want ||
              (semver.validRange(got) && semver.satisfies(want, got));

            if (!ok) {
              console.error(
                'Mismatch in $d: ' + name +
                ' referenced in ' + block +
                ' as ' + got +
                ' (expected a range including ' + want + ')'
              );
              process.exit(1);
            }
          }
        }
      " || die "Internal dependency version mismatch found (see above)."
    done
  done

  log "Internal dependency versions look consistent."

  # Check published versions (fail if same as local)
  local i=0
  for name in "${names[@]}"; do
    local local_version="${versions[$i]}"
    i=$((i + 1))

    local published_version=""
    if published_version="$(npm view "$name" version 2>/dev/null)"; then
      if [[ "$published_version" == "$local_version" ]]; then
        die "Refusing to publish $name@$local_version because that exact version is already published."
      else
        log "OK: $name local=$local_version, published=$published_version"
      fi
    else
      log "OK: $name appears not published yet (or npm view unavailable)."
    fi
  done

  log "Version checks complete."
}

publish_pkg_dir() {
  local dir="$1"
  log "Publishing: packages/$dir"
  npmrc_assert_false
  pushd "$PACKAGES_DIR/$dir" >/dev/null
  npm publish
  popd >/dev/null
}

main() {
  require_cmd pnpm
  require_cmd npm
  require_cmd node
  require_file "$NPMRC_FILE"

  log "Starting full publish flow (one command)."
  log "Root: $ROOT_DIR"

  # Safety baseline: force false before any registry checks or publishes
  log "Ensuring .npmrc workspace flags are false before preflight checks"
  npmrc_set "link-workspace-packages" "false"
  npmrc_set "prefer-workspace-packages" "false"
  npmrc_assert_false

  # Preflight version checks FIRST (fast fail)
  check_versions

  # Build/setup steps require true
  log "Setting .npmrc workspace flags to true for clean/install/build/typecheck"
  npmrc_set "link-workspace-packages" "true"
  npmrc_set "prefer-workspace-packages" "true"

  log "Running: pnpm clean"
  (cd "$ROOT_DIR" && pnpm clean)

  log "Running: pnpm install"
  (cd "$ROOT_DIR" && pnpm install)

  log "Running: pnpm build"
  (cd "$ROOT_DIR" && pnpm build)

  log "Running: pnpm typecheck"
  (cd "$ROOT_DIR" && pnpm typecheck)

  # MUST be false before login/publish
  log "Setting .npmrc workspace flags back to false BEFORE login/publish"
  npmrc_set "link-workspace-packages" "false"
  npmrc_set "prefer-workspace-packages" "false"
  npmrc_assert_false

  log "Running: npm login (interactive)"
  (cd "$ROOT_DIR" && npm login)

  log "Publishing first package (expect 2FA prompt here): packages/cli"
  publish_pkg_dir "cli"

  log "Publishing remaining packages (should be uninterrupted if 2FA suppression is active)"
  publish_pkg_dir "collie-react"
  publish_pkg_dir "compiler"
  publish_pkg_dir "config"
  publish_pkg_dir "vite"

  log "All publishes complete."
}

main "$@"
