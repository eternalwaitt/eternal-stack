#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
TARGET="${CLAUDE_HOME:-$HOME/.claude}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$TARGET/backups/control-plane-install-$STAMP"
SETTINGS_TEMPLATE="$ROOT/templates/settings.json"

if [[ "${CLAUDE_CONTROL_PLANE_ENABLE_STRICT:-0}" == "1" ]]; then
  SETTINGS_TEMPLATE="$ROOT/templates/settings.strict.json"
fi

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

node "$ROOT/scripts/merge-settings.mjs" "$TARGET/settings.json" "$SETTINGS_TEMPLATE"

printf 'Installed Claude control plane files. Backup: %s\n' "$BACKUP"
printf 'Registered hooks from: %s\n' "$SETTINGS_TEMPLATE"
printf 'Run: %s/scripts/doctor-control-plane.sh\n' "$TARGET"
