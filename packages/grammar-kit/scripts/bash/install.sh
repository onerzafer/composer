#!/usr/bin/env bash
# grammar-kit installer (T022).
#
# Copies the grammar.* AI skills + templates/taxonomy/scripts into a target
# Composer project so the developer's coding agent picks them up — the same
# model the .specify integrations use. It installs NO MCP tool (constitution IV);
# the deterministic gate runs via the `composer` CLI (`composer grammar check`,
# `composer promote`).
#
# Usage: install.sh [target_project_root]
#   target_project_root defaults to the current directory (must contain composer.json).

set -e

PKG_ROOT="$(CDPATH="" cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TARGET="${1:-$(pwd)}"
TARGET="$(cd "$TARGET" && pwd)"

if [ ! -f "$TARGET/composer.json" ]; then
  echo "grammar-kit install: $TARGET has no composer.json (not a Composer project)" >&2
  exit 6
fi

MANIFEST="$PKG_ROOT/manifest.json"
if [ ! -f "$MANIFEST" ]; then
  echo "grammar-kit install: manifest.json not found at $MANIFEST" >&2
  exit 1
fi

_install() {
  local src="$PKG_ROOT/$1"
  local dst="$TARGET/$2"
  mkdir -p "$(dirname "$dst")"
  cp "$src" "$dst"
  [ -n "${3:-}" ] && chmod "$3" "$dst"
  echo "  + $2"
}

echo "grammar-kit: installing into $TARGET"

# Skills → .claude/skills/grammar-<phase>/SKILL.md
for phase in specify clarify plan tasks author checklist; do
  src="skills/grammar.${phase}.md"
  if [ -f "$PKG_ROOT/$src" ]; then
    _install "$src" ".claude/skills/grammar-${phase}/SKILL.md"
  fi
done

# Authoring assets → .specify/grammar/
_install "templates/vocabulary-brief.md" ".specify/grammar/templates/vocabulary-brief.md"
_install "templates/catalog-design.md"   ".specify/grammar/templates/catalog-design.md"
_install "taxonomy/clarify-taxonomy.md"  ".specify/grammar/taxonomy/clarify-taxonomy.md"
_install "scripts/bash/grammar-paths.sh" ".specify/grammar/scripts/grammar-paths.sh" "0755"

echo "grammar-kit: done. Run the grammar.specify skill in your agent to begin;"
echo "             the deterministic gate is \`composer grammar check\` + \`composer promote\`."
