#!/usr/bin/env bash
# ABOUTME: Extracts function/method definitions from TypeScript/JavaScript codebase
# Outputs JSON catalog for duplicate detection analysis

set -euo pipefail

usage() {
    echo "Usage: $(basename "$0") [OPTIONS] <source-directory>"
    echo ""
    echo "OPTIONS:"
    echo "    -o, --output FILE    Output file (default: stdout)"
    echo "    -c, --context N      Lines of implementation to capture (default: 15)"
    echo "    -t, --types GLOB     File types to scan (default: \"*.ts,*.tsx,*.js,*.jsx\")"
    echo "    --include-tests      Include test files (excluded by default)"
    echo "    -h, --help           Show this help"
    exit 0
}

OUTPUT="/dev/stdout"
CONTEXT_LINES=15
FILE_TYPES="*.ts,*.tsx,*.js,*.jsx"
INCLUDE_TESTS=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -o|--output) OUTPUT="$2"; shift 2 ;;
        -c|--context) CONTEXT_LINES="$2"; shift 2 ;;
        -t|--types) FILE_TYPES="$2"; shift 2 ;;
        --include-tests) INCLUDE_TESTS=true; shift ;;
        -h|--help) usage ;;
        -*) echo "Unknown option: $1" >&2; exit 1 ;;
        *) SRC_DIR="$1"; shift ;;
    esac
done

if [[ -z "${SRC_DIR:-}" ]]; then
    echo "Error: source directory required" >&2
    usage
fi

if [[ ! -d "$SRC_DIR" ]]; then
    echo "Error: directory not found: $SRC_DIR" >&2
    exit 1
fi

GLOB_ARGS=()
IFS=',' read -ra TYPES <<< "$FILE_TYPES"
for type in "${TYPES[@]}"; do
    GLOB_ARGS+=(--glob "$type")
done

if [[ "$INCLUDE_TESTS" == "false" ]]; then
    GLOB_ARGS+=(--glob '!*.test.*' --glob '!*.spec.*')
    GLOB_ARGS+=(--glob '!**/__tests__/**' --glob '!**/test/**' --glob '!**/tests/**')
fi

extract_functions() {
    local dir="$1"
    local ctx="$2"

    rg --json \
        -e '^export (async )?function \w+' \
        -e '^export const \w+ = (async )?\(' \
        -e '^export const \w+ = (async )?function' \
        -e '^export default (async )?function' \
        -e '^  (public |private |protected )(async |static )*(get |set )?\w+\s*\(' \
        -e '^  (async |static )(async |static )*(get |set )?\w+\s*\(' \
        -e '^  (get |set )\w+\s*\(' \
        -e '^  constructor\s*\(' \
        -e '^(async )?function \w+\s*\(' \
        "${GLOB_ARGS[@]}" \
        -A "$ctx" \
        "$dir" 2>/dev/null || true
}

process_output() {
    jq -s '
        reduce .[] as $item (
            {current: null, results: []};
            if $item.type == "begin" then
                .current = {file: $item.data.path.text, lines: []}
            elif $item.type == "match" then
                .current.lines += [{
                    line_number: $item.data.line_number,
                    text: $item.data.lines.text,
                    is_match: true
                }]
            elif $item.type == "context" then
                .current.lines += [{
                    line_number: $item.data.line_number,
                    text: $item.data.lines.text,
                    is_match: false
                }]
            elif $item.type == "end" then
                if .current.lines | length > 0 then
                    .results += [.current]
                else . end
            else . end
        ) | .results

        | map(
            .file as $file |
            .lines |
            to_entries |
            reduce .[] as $entry (
                {matches: [], current_match: null, entries: []};
                if $entry.value.is_match then
                    (if .current_match then
                        .entries += [{
                            file: $file,
                            line: .current_match.line_number,
                            match_line: .current_match.text,
                            context_lines: .context
                        }]
                    else . end) |
                    .current_match = $entry.value |
                    .context = []
                else
                    if .current_match then
                        .context += [$entry.value.text]
                    else . end
                end
            ) |
            (if .current_match then
                .entries += [{
                    file: $file,
                    line: .current_match.line_number,
                    match_line: .current_match.text,
                    context_lines: .context
                }]
            else . end) |
            .entries |
            map(. + {context: ((.match_line // "") + ((.context_lines // []) | join("")))})
        ) | flatten

        | map(
            . + {
                name: (
                    .match_line |
                    capture("(?:export )?(?:async )?(?:function |const )(?<name>\\w+)") //
                    capture("(?:public |private |protected )?(?:async |static )*(?:get |set )?(?<name>\\w+)\\s*\\(") //
                    {name: "unknown"}
                ).name,
                exportType: (
                    if .match_line | test("^export default") then "default"
                    elif .match_line | test("^export ") then "named"
                    elif .match_line | test("^  ") then "method"
                    else "internal"
                    end
                )
            }
        )

        | map(select(
            .name != "unknown" and
            .name != "if" and .name != "else" and .name != "for" and
            .name != "while" and .name != "switch" and .name != "try" and
            .name != "catch" and .name != "return" and .name != "throw" and
            .name != "new" and .name != "typeof" and .name != "await" and
            .name != "const" and .name != "let" and .name != "var" and
            .name != "line" and .name != "item" and .name != "entry" and
            .name != "element" and .name != "key" and .name != "value" and
            .name != "i" and .name != "j" and .name != "k"
        ))

        | map({
            file: .file,
            name: .name,
            line: .line,
            exportType: .exportType,
            context: (.context | gsub("\\n+$"; ""))
        })
        | sort_by(.file, .line)
    '
}

extract_functions "$SRC_DIR" "$CONTEXT_LINES" | process_output > "$OUTPUT"

if [[ "$OUTPUT" != "/dev/stdout" ]]; then
    count=$(jq 'length' "$OUTPUT")
    echo "Extracted $count function definitions to $OUTPUT" >&2
fi
