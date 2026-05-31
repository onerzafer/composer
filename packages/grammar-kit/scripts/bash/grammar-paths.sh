#!/usr/bin/env bash
# grammar-kit: resolve the Composer workspace paths the grammar.* skills need.
#
# Mirrors the .specify/scripts pattern: a path-resolving helper with JSON output
# so an authoring-time skill (running in the developer's agent) can locate where
# to write a vocabulary brief and where drafts are staged — WITHOUT hard-coding
# the layout. Reads `composer.json` (workspace defaults to ./design).
#
# Usage: grammar-paths.sh [--json] [project_root]
#   project_root defaults to the nearest ancestor containing composer.json.

set -e

ARG_JSON=false
PROJECT_ROOT=""
for arg in "$@"; do
  case "$arg" in
    --json) ARG_JSON=true ;;
    *) PROJECT_ROOT="$arg" ;;
  esac
done

_find_project_root() {
  local dir="${1:-$(pwd)}"
  while [ "$dir" != "/" ]; do
    if [ -f "$dir/composer.json" ]; then echo "$dir"; return 0; fi
    dir="$(dirname "$dir")"
  done
  return 1
}

if [ -z "$PROJECT_ROOT" ]; then
  PROJECT_ROOT="$(_find_project_root "$(pwd)")" || {
    echo "grammar-paths: no composer.json found in any ancestor of $(pwd)" >&2
    exit 6
  }
fi
PROJECT_ROOT="$(cd "$PROJECT_ROOT" && pwd)"

COMPOSER_JSON="$PROJECT_ROOT/composer.json"
if [ ! -f "$COMPOSER_JSON" ]; then
  echo "grammar-paths: no composer.json at $COMPOSER_JSON" >&2
  exit 6
fi

# Extract the workspace folder (default ./design) without a JSON parser dependency.
WORKSPACE_REL="$(grep -o '"workspace"[[:space:]]*:[[:space:]]*"[^"]*"' "$COMPOSER_JSON" | head -1 | sed 's/.*"workspace"[[:space:]]*:[[:space:]]*"//; s/"$//')"
[ -z "$WORKSPACE_REL" ] && WORKSPACE_REL="./design"
WORKSPACE_REL="${WORKSPACE_REL#./}"

WORKSPACE="$PROJECT_ROOT/$WORKSPACE_REL"
CATALOG_DIR="$WORKSPACE/catalog"
PRIMITIVES_DIR="$CATALOG_DIR/primitives"
STAGING_DIR="$CATALOG_DIR/ingested"
TEMPLATES_DIR="$WORKSPACE/templates"
BRIEFS_DIR="$WORKSPACE/grammar"

if [ "$ARG_JSON" = true ]; then
  printf '{"PROJECT_ROOT":"%s","WORKSPACE":"%s","CATALOG_DIR":"%s","PRIMITIVES_DIR":"%s","STAGING_DIR":"%s","TEMPLATES_DIR":"%s","BRIEFS_DIR":"%s"}\n' \
    "$PROJECT_ROOT" "$WORKSPACE" "$CATALOG_DIR" "$PRIMITIVES_DIR" "$STAGING_DIR" "$TEMPLATES_DIR" "$BRIEFS_DIR"
else
  echo "PROJECT_ROOT=$PROJECT_ROOT"
  echo "WORKSPACE=$WORKSPACE"
  echo "CATALOG_DIR=$CATALOG_DIR"
  echo "PRIMITIVES_DIR=$PRIMITIVES_DIR"
  echo "STAGING_DIR=$STAGING_DIR"
  echo "TEMPLATES_DIR=$TEMPLATES_DIR"
  echo "BRIEFS_DIR=$BRIEFS_DIR"
fi
