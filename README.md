# Claude Control Plane

A small, deterministic hook layer for Claude Code.

It enforces the work habits that prose cannot reliably enforce:

- read before edit
- search before creating code
- verify before claiming done
- avoid command loops
- block silent fallbacks and suppressions
- keep side-effect workflows user-invoked
- preserve rollback and diagnostics before stricter rollout

## Install

```bash
git clone <repo>
cd claude-control-plane
./scripts/install.sh
./scripts/doctor.sh
```

The installer backs up the existing `~/.claude`, copies hooks and skills, and registers only the safe observer layer by default.

Hard blockers are shipped but not enabled automatically. Enable them after tests, doctor, rollback, and a fresh Claude smoke pass.

## Commands

```bash
./scripts/doctor.sh
./scripts/update.sh
./scripts/uninstall.sh
./scripts/canary-websearch.sh
./scripts/canary-hindsight.sh
tests/test-hooks.sh
```

## Safety

Emergency bypass:

```bash
export CLAUDE_GUARD_DISABLED=1
```

Private identity, accounts, credentials, transcripts, memories, and local permissions do not belong in this repo.
