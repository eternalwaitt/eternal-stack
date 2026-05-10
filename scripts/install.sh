#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
SKILL_LISTS="$ROOT/scripts/lib/skill-lists.sh"
if [[ ! -f "$SKILL_LISTS" ]]; then
  printf 'fatal: missing %s\n' "$SKILL_LISTS" >&2
  exit 1
fi
source "$SKILL_LISTS"
TARGET="${CLAUDE_HOME:-$HOME/.claude}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$TARGET/backups/control-plane-install-$STAMP"
SETTINGS_TEMPLATE="$ROOT/templates/settings.json"
legacy_rules_present=0

if [[ "${CLAUDE_CONTROL_PLANE_ENABLE_STRICT:-0}" == "1" ]]; then
  SETTINGS_TEMPLATE="$ROOT/templates/settings.strict.json"
fi

mkdir -p "$TARGET" "$BACKUP"
for file in settings.json settings.local.json CLAUDE.md AGENTS.md; do
  if [[ -f "$TARGET/$file" ]]; then
    cp "$TARGET/$file" "$BACKUP/$file"
  fi
done
if [[ -d "$TARGET/rules/etrnl" ]]; then
  mkdir -p "$BACKUP/rules"
  cp -R "$TARGET/rules/etrnl" "$BACKUP/rules/etrnl"
fi
if [[ -d "$TARGET/rules/eternal-control" ]]; then
  mkdir -p "$BACKUP/rules"
  cp -R "$TARGET/rules/eternal-control" "$BACKUP/rules/eternal-control"
  legacy_rules_present=1
fi
mkdir -p "$BACKUP/agents"
for agent in "${OWNED_AGENTS[@]}"; do
  if [[ -f "$TARGET/agents/$agent.md" ]]; then
    cp "$TARGET/agents/$agent.md" "$BACKUP/agents/$agent.md"
  fi
done
"$ROOT/tests/test-hooks.sh"

mkdir -p "$BACKUP/skills"
legacy_moved=0
for skill in "${LEGACY_SKILLS[@]}"; do
  if [[ -d "$TARGET/skills/$skill" ]]; then
    mv "$TARGET/skills/$skill" "$BACKUP/skills/$skill"
    legacy_moved=1
  fi
done

mkdir -p "$TARGET/hooks" "$TARGET/scripts" "$TARGET/docs/templates" "$TARGET/skills" "$TARGET/agents" "$TARGET/rules"
cp -R "$ROOT/hooks/"* "$TARGET/hooks/"
cp -R "$ROOT/skills/"* "$TARGET/skills/"
for agent in "${OWNED_AGENTS[@]}"; do
  cp "$ROOT/agents/$agent.md" "$TARGET/agents/$agent.md"
done
cp -R "$ROOT/docs/"* "$TARGET/docs/"
rules_tmp="$TARGET/rules/etrnl.tmp"
rm -rf "$rules_tmp"
cp -R "$ROOT/rules/etrnl" "$rules_tmp"
rm -rf "$TARGET/rules/etrnl"
mv "$rules_tmp" "$TARGET/rules/etrnl"
cp "$ROOT/templates/AGENTS.md" "$TARGET/docs/templates/AGENTS.md"
cp "$ROOT/templates/CLAUDE.md" "$TARGET/docs/templates/CLAUDE.md"
if [[ "${CLAUDE_CONTROL_PLANE_INSTALL_STARTUP:-0}" == "1" || ! -f "$TARGET/AGENTS.md" ]]; then
  cp "$ROOT/templates/AGENTS.md" "$TARGET/AGENTS.md"
fi
if [[ "${CLAUDE_CONTROL_PLANE_INSTALL_STARTUP:-0}" == "1" || ! -f "$TARGET/CLAUDE.md" ]]; then
  cp "$ROOT/templates/CLAUDE.md" "$TARGET/CLAUDE.md"
fi
cp "$ROOT/tests/test-hooks.sh" "$TARGET/hooks/test-hooks.sh"
cp "$ROOT/scripts/doctor.sh" "$TARGET/scripts/doctor-control-plane.sh"
ln -sf "doctor-control-plane.sh" "$TARGET/scripts/doctor.sh"
cp "$ROOT/scripts/code-health-inventory.mjs" "$TARGET/scripts/code-health-inventory.mjs"
cp "$ROOT/scripts/plan-readiness-check.mjs" "$TARGET/scripts/plan-readiness-check.mjs"
cp "$ROOT/scripts/agent-task-packet-check.mjs" "$TARGET/scripts/agent-task-packet-check.mjs"
cp "$ROOT/scripts/execution-ledger.mjs" "$TARGET/scripts/execution-ledger.mjs"
cp "$ROOT/scripts/execution-wave-check.mjs" "$TARGET/scripts/execution-wave-check.mjs"
cp "$ROOT/scripts/review-log.mjs" "$TARGET/scripts/review-log.mjs"
cp "$ROOT/scripts/browser-qa-report.mjs" "$TARGET/scripts/browser-qa-report.mjs"
cp "$ROOT/scripts/context-state.mjs" "$TARGET/scripts/context-state.mjs"
cp "$ROOT/scripts/workflow-health.mjs" "$TARGET/scripts/workflow-health.mjs"
cp "$ROOT/scripts/prompt-budget-check.mjs" "$TARGET/scripts/prompt-budget-check.mjs"
cp "$ROOT/scripts/canary-websearch.sh" "$TARGET/scripts/canary-websearch.sh"
cp "$ROOT/scripts/canary-hindsight.sh" "$TARGET/scripts/canary-hindsight.sh"
cp "$ROOT/scripts/rollback-local.sh" "$TARGET/scripts/rollback-local.sh"
mkdir -p "$TARGET/scripts/lib"
cp "$ROOT/scripts/lib/skill-lists.sh" "$TARGET/scripts/lib/skill-lists.sh"
chmod +x "$TARGET/hooks/test-hooks.sh" "$TARGET/scripts/"*.sh "$TARGET/scripts/"*.mjs

node "$ROOT/scripts/merge-settings.mjs" "$TARGET/settings.json" "$SETTINGS_TEMPLATE"
if [[ "$legacy_rules_present" == "1" ]]; then
  rm -rf "$TARGET/rules/eternal-control"
fi

printf 'Installed Claude control plane files. Backup: %s\n' "$BACKUP"
printf 'Installed ETRNL agents: %s\n' "${OWNED_AGENTS[*]}"
if [[ "$legacy_moved" == "1" ]]; then
  printf 'Moved legacy repo-owned skills into backup: %s/skills\n' "$BACKUP"
fi
printf 'Registered hooks from: %s\n' "$SETTINGS_TEMPLATE"
printf 'Run: %s/scripts/doctor-control-plane.sh\n' "$TARGET"
