#!/usr/bin/env bash
# init-project-rules.sh — install eternal-saas rule pack into a target project.
# Usage: init-project-rules.sh [--profile <profile>] [--dry-run] [--check] [--force] <repo-root>

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACK_ROOT="$ROOT/rules/eternal-saas"
CURSOR_PACK_ROOT="$ROOT/templates/cursor/rules/eternal-saas"
MANIFEST_SOURCE="$ROOT/rules-manifest.json"

PROFILE=""
DRY_RUN=0
CHECK_MODE=0
FORCE=0
TARGET=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile)
      if [[ $# -lt 2 || "${2:-}" == -* ]]; then
        echo "error: --profile requires a value (eternal-saas | eternal-saas-tcg)" >&2
        exit 1
      fi
      PROFILE="$2"; shift 2
      ;;
    --dry-run) DRY_RUN=1; shift ;;
    --check) CHECK_MODE=1; shift ;;
    --force) FORCE=1; shift ;;
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

CLAUDE_RULES_DEST="$TARGET/.claude/rules/eternal-saas"
CURSOR_RULES_DEST="$TARGET/.cursor/rules/eternal-saas"
MANIFEST_RECEIPT="$CLAUDE_RULES_DEST/.manifest.json"

file_sha256() {
  shasum -a 256 "$1" 2>/dev/null | awk '{print $1}' || sha256sum "$1" | awk '{print $1}'
}

receipt_checksum_for() {
  local sums="$1"
  local rel="$2"
  awk -v key="$rel" '$1 == key {print $2; exit}' <<<"$sums"
}

receipt_installed_at() {
  python3 - "$MANIFEST_RECEIPT" <<'PYEOF'
import json
import sys
from pathlib import Path

try:
    receipt = json.loads(Path(sys.argv[1]).read_text())
except Exception as error:
    raise SystemExit(f"error: failed to parse manifest receipt {sys.argv[1]}: {error}")

print(receipt.get("installedAt", ""))
PYEOF
}

receipt_checksums() {
  local field="$1"
  python3 - "$MANIFEST_RECEIPT" "$field" <<'PYEOF'
import json
import sys
from pathlib import Path

try:
    receipt = json.loads(Path(sys.argv[1]).read_text())
except Exception as error:
    raise SystemExit(f"error: failed to parse manifest receipt {sys.argv[1]}: {error}")

items = receipt.get(sys.argv[2], {})
if not isinstance(items, dict):
    raise SystemExit(f"error: manifest receipt field {sys.argv[2]} must be an object")

for key, value in items.items():
    print(key, value)
PYEOF
}

collect_modules() {
  python3 - "$MANIFEST_SOURCE" "$PACK_ROOT" "$CURSOR_PACK_ROOT" "$PROFILE" <<'PYEOF'
import json
import re
import sys
from pathlib import Path

manifest_path, pack_root, cursor_root, profile = sys.argv[1:]
manifest = json.loads(Path(manifest_path).read_text())
profiles = manifest.get("profiles", {})

def expand(name, seen=None):
    seen = seen or set()
    if name in seen:
        raise SystemExit(f"profile cycle detected: {name}")
    if name not in profiles:
        raise SystemExit(f"unknown profile: {name}")
    seen.add(name)
    item = profiles[name]
    modules = []
    if item.get("extends"):
        modules.extend(expand(item["extends"], seen))
    modules.extend(item.get("modules", []))
    return modules

for key in expand(profile):
    source = Path(pack_root) / f"{key}.md"
    if not source.is_file():
        raise SystemExit(f"manifest profile {profile} references missing module: {key}")
    text = source.read_text()
    match = re.search(r"^id:\s*(\S+)\s*$", text, re.MULTILINE)
    if not match:
        raise SystemExit(f"module missing id frontmatter: {key}")
    cursor = Path(cursor_root) / Path(key).parent / f"{match.group(1)}.mdc"
    if not cursor.is_file():
        raise SystemExit(f"generated Cursor rule missing for module {key}: {cursor}")
    print(f"{key}\t{match.group(1)}")
PYEOF
}

cursor_rel_for() {
  local key="$1" id="$2" subdir
  subdir="$(dirname "$key")"
  if [[ "$subdir" == "." ]]; then
    printf '%s.mdc\n' "$id"
  else
    printf '%s/%s.mdc\n' "$subdir" "$id"
  fi
}

if [[ "$DRY_RUN" -eq 1 && "$CHECK_MODE" -eq 0 ]]; then
  echo "dry-run: profile=$PROFILE target=$TARGET"
  echo "planned copies to $TARGET:"
  modules_output="$(collect_modules)" || exit 1
  while IFS=$'\t' read -r key id; do
    [[ -n "$key" && -n "$id" ]] || continue
    rel="$key.md"
    cursor_rel="$(cursor_rel_for "$key" "$id")"
    echo "  copy -> .claude/rules/eternal-saas/$rel"
    echo "  copy -> .cursor/rules/eternal-saas/$cursor_rel"
  done <<<"$modules_output"
  echo "planned receipt: $MANIFEST_RECEIPT"
  exit 0
fi

if [[ "$CHECK_MODE" -eq 1 ]]; then
  if [[ ! -f "$MANIFEST_RECEIPT" ]]; then
    echo "not installed: $MANIFEST_RECEIPT not found" >&2
    exit 1
  fi
  install_ts="$(receipt_installed_at)"
  receipt_sums="$(receipt_checksums checksums)"
  cursor_receipt_sums="$(receipt_checksums cursorChecksums)"

  any_stale=0
  any_modified=0

  modules_output="$(collect_modules)" || exit 1
  while IFS=$'\t' read -r key id; do
    [[ -n "$key" && -n "$id" ]] || continue
    rel="$key.md"
    src="$PACK_ROOT/$rel"
    cursor_rel="$(cursor_rel_for "$key" "$id")"
    cursor_src="$CURSOR_PACK_ROOT/$cursor_rel"
    dest="$CLAUDE_RULES_DEST/$rel"
    cursor_dest="$CURSOR_RULES_DEST/$cursor_rel"
    if [[ ! -f "$dest" ]]; then
      echo "missing: $rel"
      any_stale=1
      continue
    fi
    receipt_sum="$(receipt_checksum_for "$receipt_sums" "$rel")"
    current_sum="$(file_sha256 "$dest")"
    if [[ -n "$receipt_sum" && "$current_sum" != "$receipt_sum" ]]; then
      echo "locally-modified: $rel"
      any_modified=1
      continue
    fi
    if [[ -n "$install_ts" ]]; then
      src_mtime="$(python3 -c "import os, sys; print(int(os.path.getmtime(sys.argv[1])))" "$src" 2>/dev/null || echo "0")"
      install_epoch="$(python3 -c "from datetime import datetime; import sys; value = sys.argv[1]; value = value[:-1] + '+00:00' if value.endswith('Z') else value; print(int(datetime.fromisoformat(value).timestamp()))" "$install_ts" 2>/dev/null || echo "0")"
      if [[ "$src_mtime" -gt "$install_epoch" ]]; then
        echo "stale: $rel"
        any_stale=1
        continue
      fi
    fi
    echo "current: $rel"
    if [[ ! -f "$cursor_dest" ]]; then
      echo "missing-cursor: $cursor_rel"
      any_stale=1
    else
      cursor_receipt_sum="$(receipt_checksum_for "$cursor_receipt_sums" "$cursor_rel")"
      cursor_current_sum="$(file_sha256 "$cursor_dest")"
      if [[ -n "$cursor_receipt_sum" && "$cursor_current_sum" != "$cursor_receipt_sum" ]]; then
        echo "cursor-modified: $cursor_rel"
        any_modified=1
      elif [[ -z "$cursor_receipt_sum" && "$cursor_current_sum" != "$(file_sha256 "$cursor_src")" ]]; then
        echo "cursor-modified: $cursor_rel"
        any_modified=1
      fi
    fi
  done <<<"$modules_output"

  if [[ "$any_modified" -gt 0 || "$any_stale" -gt 0 ]]; then
    exit 1
  fi
  exit 0
fi

if [[ -f "$MANIFEST_RECEIPT" && "$FORCE" -eq 0 ]]; then
  receipt_sums="$(receipt_checksums checksums)"
  cursor_receipt_sums="$(receipt_checksums cursorChecksums)"
  modified_files=()
  modules_output="$(collect_modules)" || exit 1
  while IFS=$'\t' read -r key id; do
    [[ -n "$key" && -n "$id" ]] || continue
    rel="$key.md"
    cursor_rel="$(cursor_rel_for "$key" "$id")"
    cursor_src="$CURSOR_PACK_ROOT/$cursor_rel"
    dest="$CLAUDE_RULES_DEST/$rel"
    cursor_dest="$CURSOR_RULES_DEST/$cursor_rel"
    if [[ -f "$dest" ]]; then
      receipt_sum="$(receipt_checksum_for "$receipt_sums" "$rel")"
      current_sum="$(file_sha256 "$dest")"
      if [[ -n "$receipt_sum" && "$current_sum" != "$receipt_sum" ]]; then
        modified_files+=("$rel")
      fi
    fi
    if [[ -f "$cursor_dest" ]]; then
      cursor_receipt_sum="$(receipt_checksum_for "$cursor_receipt_sums" "$cursor_rel")"
      cursor_current_sum="$(file_sha256 "$cursor_dest")"
      if [[ -n "$cursor_receipt_sum" && "$cursor_current_sum" != "$cursor_receipt_sum" ]]; then
        modified_files+=("$cursor_rel")
      elif [[ -z "$cursor_receipt_sum" && "$cursor_current_sum" != "$(file_sha256 "$cursor_src")" ]]; then
        modified_files+=("$cursor_rel")
      fi
    fi
  done <<<"$modules_output"
  if [[ "${#modified_files[@]}" -gt 0 ]]; then
    echo "error: locally-modified files would be overwritten. Use --force to proceed:" >&2
    for file in "${modified_files[@]}"; do echo "  $file" >&2; done
    exit 1
  fi
fi

install_ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
checksums_tmp="$(mktemp)"
cursor_checksums_tmp="$(mktemp)"
trap 'rm -f "$checksums_tmp" "$cursor_checksums_tmp"' EXIT

modules_output="$(collect_modules)" || exit 1
while IFS=$'\t' read -r key id; do
  [[ -n "$key" && -n "$id" ]] || continue
  rel="$key.md"
  cursor_rel="$(cursor_rel_for "$key" "$id")"
  src="$PACK_ROOT/$rel"
  cursor_src="$CURSOR_PACK_ROOT/$cursor_rel"
  dest_claude="$CLAUDE_RULES_DEST/$rel"
  dest_cursor="$CURSOR_RULES_DEST/$cursor_rel"

  mkdir -p "$(dirname "$dest_claude")" "$(dirname "$dest_cursor")"
  cp "$src" "$dest_claude"
  cp "$cursor_src" "$dest_cursor"

  sum="$(file_sha256 "$dest_claude")"
  cursor_sum="$(file_sha256 "$dest_cursor")"
  printf '%s\t%s\n' "$rel" "$sum" >> "$checksums_tmp"
  printf '%s\t%s\n' "$cursor_rel" "$cursor_sum" >> "$cursor_checksums_tmp"
  echo "installed: $rel"
done <<<"$modules_output"

mkdir -p "$(dirname "$MANIFEST_RECEIPT")"
python3 - "$MANIFEST_RECEIPT" "$PROFILE" "$install_ts" "$checksums_tmp" "$cursor_checksums_tmp" <<'PYEOF'
import sys, json
receipt_path, profile, installed_at, checksums_file, cursor_checksums_file = sys.argv[1:]
checksums = {}
cursor_checksums = {}
with open(checksums_file) as f:
    for line in f:
        line = line.rstrip('\n')
        if '\t' in line:
            key, val = line.split('\t', 1)
            checksums[key] = val
with open(cursor_checksums_file) as f:
    for line in f:
        line = line.rstrip('\n')
        if '\t' in line:
            key, val = line.split('\t', 1)
            cursor_checksums[key] = val
receipt = {
    "profile": profile,
    "installedAt": installed_at,
    "checksums": checksums,
    "cursorChecksums": cursor_checksums,
}
with open(receipt_path, 'w') as out:
    json.dump(receipt, out, indent=2)
    out.write('\n')
PYEOF

echo "done: installed profile=$PROFILE to $TARGET"
