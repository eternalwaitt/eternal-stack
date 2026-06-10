#!/usr/bin/env bash
# Refresh skills/bundled/* from canonical host skill trees. Maintainer-only.
set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
DEST="$ROOT/skills/bundled"
HOME_DIR="${HOME:?}"

SKILL_LISTS="$ROOT/scripts/lib/skill-lists.sh"
# shellcheck source=scripts/lib/skill-lists.sh
source "$SKILL_LISTS"

bundled_skill_source() {
  local skill="$1"
  case "$skill" in
    eternal-best-practices) printf '%s' "$HOME_DIR/.agents/skills/eternal-best-practices" ;;
    code-simplifier) printf '%s' "$HOME_DIR/.agents/skills/code-simplifier" ;;
    finding-duplicate-functions) printf '%s' "$HOME_DIR/.agents/skills/universal/finding-duplicate-functions" ;;
    better-auth) printf '%s' "$HOME_DIR/.agents/skills/backend/better-auth" ;;
    tenant-isolation-patterns) printf '%s' "$HOME_DIR/.agents/skills/tenant-isolation-patterns" ;;
    money-vo-discipline) printf '%s' "$HOME_DIR/.agents/skills/money-vo-discipline" ;;
    i18n-localization) printf '%s' "$HOME_DIR/.agents/skills/i18n-localization" ;;
    stripe-best-practices) printf '%s' "$HOME_DIR/.agents/skills/plugins/stripe/stripe-best-practices" ;;
    abacatepay-integration) printf '%s' "$HOME_DIR/.agents/skills/payments/abacatepay-integration" ;;
    ci-cd) printf '%s' "$HOME_DIR/.agents/skills/ci-cd" ;;
    prisma-expert) printf '%s' "$HOME_DIR/.agents/skills/universal/prisma-expert" ;;
    sql-optimization-patterns) printf '%s' "$HOME_DIR/.agents/skills/sql-optimization-patterns" ;;
    orpc-patterns) printf '%s' "$HOME_DIR/.agents/skills/orpc-patterns" ;;
    brooks-audit) printf '%s' "$HOME_DIR/.codex/skills/brooks-audit" ;;
    domain-cli) printf '%s' "$HOME_DIR/.claude/skills/domain-cli" ;;
    domain-cloud-native) printf '%s' "$HOME_DIR/.claude/skills/domain-cloud-native" ;;
    domain-embedded) printf '%s' "$HOME_DIR/.claude/skills/domain-embedded" ;;
    domain-fintech) printf '%s' "$HOME_DIR/.claude/skills/domain-fintech" ;;
    domain-iot) printf '%s' "$HOME_DIR/.claude/skills/domain-iot" ;;
    domain-ml) printf '%s' "$HOME_DIR/.claude/skills/domain-ml" ;;
    domain-web) printf '%s' "$HOME_DIR/.claude/skills/domain-web" ;;
    *) return 1 ;;
  esac
}

mkdir -p "$DEST"
failed=0
for skill in "${BUNDLED_SKILLS[@]}"; do
  src=""
  if ! src="$(bundled_skill_source "$skill")"; then
    printf 'vendor-bundled-skills: unknown bundled skill %s\n' "$skill" >&2
    failed=1
    continue
  fi
  if [[ ! -f "$src/SKILL.md" ]]; then
    printf 'vendor-bundled-skills: missing source for %s at %s\n' "$skill" "$src" >&2
    failed=1
    continue
  fi
  rm -rf -- "$DEST/${skill:?}"
  cp -R -- "$src" "$DEST/$skill"
  printf 'vendored %s <- %s\n' "$skill" "$src"
done

if (( failed != 0 )); then
  exit 1
fi

printf 'Bundled skills refreshed under %s\n' "$DEST"
