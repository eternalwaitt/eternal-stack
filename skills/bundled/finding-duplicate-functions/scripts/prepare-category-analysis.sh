#!/usr/bin/env bash
# ABOUTME: Prepares category-specific function lists for duplicate detection
# Takes categorized output and splits into per-category files for Opus analysis

set -euo pipefail

usage() {
    local code="${1:-0}"
    echo "Usage: $(basename "$0") <categorized.json> [output-dir]"
    echo ""
    echo "Split categorized function catalog into per-category files for duplicate analysis."
    echo "Only creates files for categories with 3+ functions (worth analyzing)."
    exit "$code"
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
    usage
fi

if [[ -z "${1:-}" ]]; then
    echo "Error: categorized.json required" >&2
    usage 1
fi

CATEGORIZED="$1"
OUTPUT_DIR="${2:-./categories}"

if [[ ! -f "$CATEGORIZED" ]]; then
    echo "Error: file not found: $CATEGORIZED" >&2
    exit 1
fi

mkdir -p "$OUTPUT_DIR"

echo "Analyzing categories..." >&2

jq -r '
    group_by(.category) |
    map({
        category: .[0].category,
        count: length,
        functions: .
    }) |
    sort_by(-.count) |
    .[] |
    "\(.category)\t\(.count)"
' "$CATEGORIZED" | while IFS=$'\t' read -r category count; do
    if [[ "$count" -ge 3 ]]; then
        safe_category="$(printf '%s' "$category" | tr -cs '[:alnum:]._-' '_')"
        outfile="$OUTPUT_DIR/${safe_category}.json"
        jq --arg cat "$category" '[.[] | select(.category == $cat)]' "$CATEGORIZED" > "$outfile"
        echo "  $category: $count functions -> $outfile" >&2
    else
        echo "  $category: $count functions (skipped, < 3)" >&2
    fi
done

echo "" >&2
echo "Category files created in $OUTPUT_DIR" >&2
