#!/usr/bin/env bash
# init-project-rules.sh — install eternal-saas rule pack into a target project.
# Usage: init-project-rules.sh [--profile <profile>] [--dry-run] [--check] [--force] <repo-root>

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACK_ROOT="$ROOT/rules/eternal-saas"
MANIFEST_SOURCE="$ROOT/rules-manifest.json"

# ── argument parsing ────────────────────────────────────────────────────────

PROFILE=""
DRY_RUN=0
CHECK_MODE=0
FORCE=0
TARGET=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile) PROFILE="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --check)   CHECK_MODE=1; shift ;;
    --force)   FORCE=1; shift ;;
    -*) echo "error: unknown flag: $1" >&2; exit 1 ;;
    *) TARGET="$1"; shift ;;
  esac
done

if [[ -z "$PROFILE" ]]; then
  echo "error: --profile is required (eternal-saas | eternal-saas-tcg)" >&2
  exit 1
fi

if [[ -z "$TARGET" ]]; then
  echo "error: <repo-root> argument is required" >&2
  exit 1
fi

TARGET="$(realpath "$TARGET")"

if [[ "$PROFILE" != "eternal-saas" && "$PROFILE" != "eternal-saas-tcg" ]]; then
  echo "error: unknown profile '$PROFILE'. Valid: eternal-saas, eternal-saas-tcg" >&2
  exit 1
fi

# ── destination paths ───────────────────────────────────────────────────────

CLAUDE_RULES_DEST="$TARGET/.claude/rules/eternal-saas"
CURSOR_RULES_DEST="$TARGET/.cursor/rules/eternal-saas"
MANIFEST_RECEIPT="$CLAUDE_RULES_DEST/.manifest.json"

# ── helper: compute sha256 of a file ───────────────────────────────────────

file_sha256() {
  shasum -a 256 "$1" 2>/dev/null | awk '{print $1}' || sha256sum "$1" | awk '{print $1}'
}

# ── collect source modules for profile ─────────────────────────────────────

collect_modules() {
  local profile="$1"
  local files=()
  # Always include global/ and project/ for eternal-saas
  while IFS= read -r -d '' f; do
    files+=("$f")
  done < <(find "$PACK_ROOT/global" "$PACK_ROOT/project" -name '*.md' -print0 2>/dev/null | sort -z)
  # eternal-saas-tcg: also include project/tcg-contract.md if present (created later)
  printf '%s\n' "${files[@]}"
}

# ── dry-run: list planned operations ───────────────────────────────────────

if [[ "$DRY_RUN" -eq 1 && "$CHECK_MODE" -eq 0 ]]; then
  echo "dry-run: profile=$PROFILE target=$TARGET"
  echo "planned copies to $TARGET:"
  while IFS= read -r src; do
    rel="${src#$PACK_ROOT/}"
    dest_claude="$CLAUDE_RULES_DEST/$rel"
    dest_cursor="$CURSOR_RULES_DEST/$rel"
    echo "  copy → .claude/rules/eternal-saas/$rel"
    echo "  copy → .cursor/rules/eternal-saas/$rel"
  done < <(collect_modules "$PROFILE")
  echo "planned receipt: $MANIFEST_RECEIPT"
  exit 0
fi

# ── check mode ─────────────────────────────────────────────────────────────

if [[ "$CHECK_MODE" -eq 1 ]]; then
  if [[ ! -f "$MANIFEST_RECEIPT" ]]; then
    echo "not installed: $MANIFEST_RECEIPT not found" >&2
    exit 1
  fi
  install_ts="$(python3 -c "import json,sys; d=json.load(open('$MANIFEST_RECEIPT')); print(d.get('installedAt',''))" 2>/dev/null || echo "")"
  receipt_sums="$(python3 -c "import json,sys; d=json.load(open('$MANIFEST_RECEIPT')); [print(k,v) for k,v in d.get('checksums',{}).items()]" 2>/dev/null || echo "")"

  any_stale=0
  any_modified=0

  while IFS= read -r src; do
    rel="${src#$PACK_ROOT/}"
    dest="$CLAUDE_RULES_DEST/$rel"
    if [[ ! -f "$dest" ]]; then
      echo "missing: $rel"
      any_stale=1
      continue
    fi
    # Check if locally modified
    receipt_sum="$(echo "$receipt_sums" | grep "^$rel " | awk '{print $2}')"
    current_sum="$(file_sha256 "$dest")"
    if [[ -n "$receipt_sum" && "$current_sum" != "$receipt_sum" ]]; then
      echo "locally-modified: $rel"
      any_modified=1
      continue
    fi
    # Check if stale (source newer than install time)
    if [[ -n "$install_ts" ]]; then
      src_mtime="$(python3 -c "import os; print(int(os.path.getmtime('$src')))" 2>/dev/null || echo "0")"
      install_epoch="$(python3 -c "from datetime import datetime; print(int(datetime.fromisoformat('$install_ts').timestamp()))" 2>/dev/null || echo "0")"
      if [[ "$src_mtime" -gt "$install_epoch" ]]; then
        echo "stale: $rel"
        any_stale=1
        continue
      fi
    fi
    echo "current: $rel"
  done < <(collect_modules "$PROFILE")

  if [[ "$any_modified" -gt 0 || "$any_stale" -gt 0 ]]; then
    exit 1
  fi
  exit 0
fi

# ── install mode ────────────────────────────────────────────────────────────

# Check for locally-modified files when not forcing
if [[ -f "$MANIFEST_RECEIPT" && "$FORCE" -eq 0 ]]; then
  receipt_sums="$(python3 -c "import json,sys; d=json.load(open('$MANIFEST_RECEIPT')); [print(k,v) for k,v in d.get('checksums',{}).items()]" 2>/dev/null || echo "")"
  modified_files=()
  while IFS= read -r src; do
    rel="${src#$PACK_ROOT/}"
    dest="$CLAUDE_RULES_DEST/$rel"
    if [[ ! -f "$dest" ]]; then continue; fi
    receipt_sum="$(echo "$receipt_sums" | grep "^$rel " | awk '{print $2}')"
    current_sum="$(file_sha256 "$dest")"
    if [[ -n "$receipt_sum" && "$current_sum" != "$receipt_sum" ]]; then
      modified_files+=("$rel")
    fi
  done < <(collect_modules "$PROFILE")
  if [[ "${#modified_files[@]}" -gt 0 ]]; then
    echo "error: locally-modified files would be overwritten. Use --force to proceed:" >&2
    for f in "${modified_files[@]}"; do echo "  $f" >&2; done
    exit 1
  fi
fi

# Install files — accumulate checksums in a temp file (bash 3 compatible)
install_ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
checksums_tmp="$(mktemp)"
trap 'rm -f "$checksums_tmp"' EXIT

while IFS= read -r src; do
  rel="${src#$PACK_ROOT/}"
  dest_claude="$CLAUDE_RULES_DEST/$rel"
  dest_cursor="$CURSOR_RULES_DEST/$rel"

  mkdir -p "$(dirname "$dest_claude")" "$(dirname "$dest_cursor")"
  cp "$src" "$dest_claude"
  cp "$src" "$dest_cursor"

  sum="$(file_sha256 "$dest_claude")"
  printf '%s\t%s\n' "$rel" "$sum" >> "$checksums_tmp"
  echo "installed: $rel"
done < <(collect_modules "$PROFILE")

# Write manifest receipt via Python (handles JSON escaping correctly)
mkdir -p "$(dirname "$MANIFEST_RECEIPT")"
python3 - "$MANIFEST_RECEIPT" "$PROFILE" "$install_ts" "$checksums_tmp" <<'PYEOF'
import sys, json
receipt_path, profile, installed_at, checksums_file = sys.argv[1:]
checksums = {}
with open(checksums_file) as f:
    for line in f:
        line = line.rstrip('\n')
        if '\t' in line:
            key, val = line.split('\t', 1)
            checksums[key] = val
receipt = {"profile": profile, "installedAt": installed_at, "checksums": checksums}
with open(receipt_path, 'w') as out:
    json.dump(receipt, out, indent=2)
    out.write('\n')
PYEOF

echo "done: installed profile=$PROFILE to $TARGET"
