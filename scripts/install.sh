#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
TARGET="${CLAUDE_HOME:-$HOME/.claude}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$TARGET/backups/control-plane-install-$STAMP"

mkdir -p "$TARGET" "$BACKUP"
for file in settings.json settings.local.json CLAUDE.md; do
  if [[ -f "$TARGET/$file" ]]; then
    cp "$TARGET/$file" "$BACKUP/$file"
  fi
done

"$ROOT/tests/test-hooks.sh"

mkdir -p "$TARGET/hooks" "$TARGET/scripts" "$TARGET/docs" "$TARGET/skills"
cp -R "$ROOT/hooks/"* "$TARGET/hooks/"
cp -R "$ROOT/skills/"* "$TARGET/skills/"
cp -R "$ROOT/docs/"* "$TARGET/docs/"
cp "$ROOT/scripts/doctor.sh" "$TARGET/scripts/doctor-control-plane.sh"

if [[ ! -f "$TARGET/settings.json" ]]; then
  cp "$ROOT/templates/settings.json" "$TARGET/settings.json"
fi

printf 'Installed Claude control plane files. Backup: %s\n' "$BACKUP"
printf 'Run: %s/scripts/doctor-control-plane.sh\n' "$TARGET"

