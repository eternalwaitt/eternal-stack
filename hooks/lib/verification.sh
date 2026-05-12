#!/usr/bin/env bash

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=hooks/lib/command-classifiers.sh
source "$SCRIPT_DIR/command-classifiers.sh"
