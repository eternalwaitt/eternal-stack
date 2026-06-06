# Compact Recovery

ETRNL compact recovery lets Claude keep owning auto-compaction while the control plane records enough state to continue safely after compact.

## Five-Minute Check

Run these from the source checkout:

```bash
node scripts/etrnl-state.mjs validate --fixtures tests/fixtures/etrnl-state
node scripts/etrnl-state.mjs append --fixture tests/fixtures/etrnl-state/compact-pre.json --dry-run --json
node scripts/etrnl-state.mjs compact-handoff --session fixture-compact --json
node scripts/settings-audit.mjs templates/settings.strict.json --strict-conflicts --json
tests/test-hooks.sh
```

Expected shape:

- `validate` returns `ok: true`.
- `append --dry-run` returns a sanitized event and writes nothing.
- `compact-handoff` returns `found: true` for fixture state and includes `verificationStale: true` when the post-compact event is newer than verification.
- `settings-audit` reports no missing required compact hooks and no async compact restore in source templates.
- Hook tests pass without raw prompt or transcript leakage.

## Command Spec

| Command | Purpose | Expected Use |
| --- | --- | --- |
| `node scripts/etrnl-state.mjs append --fixture <file> --dry-run --json` | Validate one event without writing. | Test fixtures and privacy checks. |
| `node scripts/etrnl-state.mjs append --json '<event>'` | Append one typed event. | Hook and compatibility helpers. |
| `node scripts/etrnl-state.mjs compact-handoff --latest --json` | Show the packet `SessionStart(source=compact)` would inject. | Debug restore behavior. |
| `node scripts/etrnl-state.mjs doctor --compact --explain` | Explain compact state, stale verification, and next command. | Local diagnosis. |
| `node scripts/etrnl-state.mjs stop-status --session <id> --json` | Return whether compact made completion evidence stale. | Stop verifier. |
| `node scripts/etrnl-state.mjs bead-link --dry-run --json` | Classify backlog-only Beads links without touching Beads. | Beads boundary checks. |

## Staged Install Rehearsal

Use temporary homes before changing live Claude or Codex settings:

```bash
CLAUDE_HOME="$(mktemp -d)" CODEX_HOME="$(mktemp -d)" ./scripts/install.sh
node scripts/settings-audit.mjs "$CLAUDE_HOME/settings.json" --strict-conflicts --json
CLAUDE_CONTROL_PLANE_HOME="$CLAUDE_HOME" node "$CLAUDE_HOME/scripts/update-check.mjs" --json
"$CLAUDE_HOME/scripts/post-upgrade-canary.sh"
"$CLAUDE_HOME/scripts/rollback-local.sh" --dry-run
```

The staged `settings.json` should include synchronous `cc-sessionstart-restore.sh`, `PreCompact` `cc-precompact-save.sh`, `PostCompact` `cc-postcompact-record.sh`, and `Stop` `cc-stop-verifier.sh`. It should not include additional compact-related hooks, such as reminder injectors or context dump hooks, unless they have been approved through a separate ADR or install plan.

## Manual Compact Smoke

Repo tests cannot force Claude's internal auto-compact threshold. After staged gates pass and live install is approved:

1. Start a Claude session with the installed settings.
2. Do real work long enough to have changed files and verification state.
3. Trigger a manual `/compact` smoke.
4. Confirm the next `SessionStart(source=compact)` context is short and contains the current task, next action, and stale-verification warning when applicable.
5. Rerun the relevant verification command before claiming done.

## Debugging

Use this order:

```bash
node scripts/settings-audit.mjs "$CLAUDE_HOME/settings.json" --json
node scripts/etrnl-state.mjs doctor --compact --explain
node scripts/etrnl-state.mjs compact-handoff --latest --json
node scripts/workflow-health.mjs doctor --json --all
node scripts/update-check.mjs --explain
```

Common findings:

- `compact-restore-sync`: installed `cc-sessionstart-restore.sh` is async or missing.
- `compact-companion-noise`: companion `PreCompact` hooks are installed and competing with the native handoff path.
- `verificationStale: true`: compact happened after the last check; rerun the relevant gate.
- `found: false`: no useful compact pre/post events exist yet; use workflow-health and current repo status instead of inventing state.
- Privacy rejection: the event tried to store raw prompt, transcript, secret-looking token, private project name, private path, or raw changed-file list.

## State Location

Default state is local and untracked:

```text
~/.claude/control-plane/state/events.jsonl
~/.claude/control-plane/state/views/compact-handoff.json
```

Override it for tests or staged runs:

```bash
ETRNL_STATE_DIR="$(mktemp -d)" node scripts/etrnl-state.mjs doctor --json
```

JSONL is canonical. Views are rebuildable.
