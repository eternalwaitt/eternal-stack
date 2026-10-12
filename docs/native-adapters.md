# Optional native continuity adapters

Core registers no hooks. `orchestrated` and `full` can additionally register `scripts/host-lifecycle.mjs` through their installed companion. Both adapters read the same project identity, authored state, scoped lessons, checkpoints and execution ledger. They neither create a second queue nor reset an existing task or its budget. See [project state](project-state.md) and [project lessons](project-lessons.md).

Registration is explicit and requires declared versions: Codex **0.159.2+** and Claude Code **2.1.296+**, adapter schema **1**. Codex uses `<codex-home>/hooks.json`, alongside `config.toml`; Claude uses `<claude-home>/settings.json`. Versions are declarations, not proof that a desktop app executed the entry. Native configuration, disabled hooks, trust, host distribution and process failures still affect execution. The installer refuses a known explicit Codex hook-disable override rather than enabling it.

```bash
CLAUDE_HOME=/path/to/fixture/claude CODEX_HOME=/path/to/fixture/codex \
  ./scripts/install.sh --profile orchestrated --native-continuity \
  --claude-version 2.1.296 --codex-version 0.159.2 --dry-run
```

Remove `--dry-run` to apply to the selected homes. Optional installation still installs both host layouts and its existing Claude hooks. Native registration appends owned groups and preserves unrelated settings and hook groups. Reinstallation checks the owned entries before modifying them. Malformed JSON, symlinks, an incompatible profile, an unsupported version and changed owned entries are errors. Registration preflights both hosts and rolls back its config/ownership transaction if writing fails; a failure elsewhere in the larger legacy install uses the reported install backup.

For an already installed optional profile, register one host with `node scripts/native-adapters.mjs --host codex --profile orchestrated --codex-home /path/to/home --codex-version 0.159.2`. Use the corresponding Claude flags for Claude. These commands operate on configuration; restart/inspect the host and verify actual callbacks separately.

| Boundary | Adapter behavior | Enforcement limit |
| --- | --- | --- |
| SessionStart | Bounded existing task/state context, historical checkpoint decisions/blockers/next work/budgets and scoped project observations | Context injection guides reconciliation; it does not select a task or prove maintenance. |
| UserPromptSubmit | Read-only request matching; ambiguous matches surfaced | The agent explicitly chooses an owned task and canonical scope/risk contract. |
| PreToolUse | Bounded relevant lessons before shell, file mutation and remote-function boundaries | Advisory context, never a permission decision. Read-only local tools bypass continuity I/O. |
| PostToolUse | Existing owned ledger checkpoint after covered tools | Preserves reported/captured evidence; a tool result is not invented check evidence. |
| Stop | Canonical completion inspection; incomplete task requests repair only after durable retry reservation | Supported block decision requests another turn. Exhausted budget surfaces a blocker. Missing ledger and adapter availability errors remain advisory. A bound live controller resume checkpoints and yields to its outer finalizer without consuming another retry. |
| Compaction | Existing checkpoint; compact SessionStart supplies continuation context | Codex Pre/PostCompact output is ignored; JSON checkpoint effects do not guarantee a complete handoff. |
| Interruption/end | Codex Interrupt, both SessionEnd, Claude StopFailure checkpoint an owned run | Advisory, bounded callback. Claude has no equivalent generic Interrupt here; no crash callback promise. |

Codex 0.159.2 pre-tool coverage excludes hosted WebSearch and `write_stdin` interactions with existing processes, and tool implementations can omit the callback. Hook timeout, invalid output and ordinary command errors can fail open. Codex Stop can repeat with `stop_hook_active`; Claude's native continuation cap resets after tools. The adapter uses the canonical ledger's retry admission across sessions rather than either host loop count. SessionEnd/Interrupt have short host deadlines, so an interrupted checkpoint can remain absent; manual companion context/checkpoint remains the portable floor. A completion check validates recorded requirements and captured evidence, not the correctness of the entire feature.

Input is bounded to 64 KiB, validates event/cwd/session, redacts common secret forms from context and retrieval queries, and never stores raw prompts or tool responses. Retrieved observations remain untrusted data. Retrieval receipts retain only project/lesson IDs and a query digest, labeled `retrieval_only`. Their retrieval does not establish applicability, a causal fix or prevention. Host private memory is separate from portable repository knowledge and is not enabled by these adapters.

Inspect registration without running a model:

```bash
node scripts/native-adapters.mjs --status --host codex --codex-home /path/to/home
./scripts/uninstall.sh --native-continuity --host codex --codex-home /path/to/home
```

Status distinguishes available files, matching registered entries, declared version and `runtimeVerified: false`. Removal deletes only exact owned groups, preserving later user additions. With no other changes it restores original config bytes or absence. Modified owned entries require manual reconciliation. Installer snapshots support `node scripts/native-adapters.mjs --rollback /path/to/install-backup --claude-home /path/to/claude --codex-home /path/to/codex`; native rollback restores the previous registration while preserving unrelated current entries. Native-aware `rollback-local.sh` also restores the prior companion install identity and source-owned dependency snapshot. It retains later unrelated settings/groups and custom helper files, and refuses deletion of newly installed owned helpers whose bytes were changed after installation. Legacy backups without native ownership retain the existing broader settings restore behavior.

Source schema evidence: [Codex 0.159.2 hook tests](https://github.com/openai/codex/blob/ff6aec96948b70d94983af2641a6b67c94faeff5/codex-rs/core/tests/suite/hooks.rs), [Codex released discovery](https://github.com/openai/codex/blob/ff6aec96948b70d94983af2641a6b67c94faeff5/codex-rs/hooks/src/engine/discovery.rs), [Codex hooks](https://learn.chatgpt.com/docs/hooks), [Claude hooks](https://code.claude.com/docs/en/hooks). Accessed 2026-10-12; live docs omit publication dates. Repository fixtures prove configuration and adapter behavior, not equal live host enforcement.

# Captured review provider

The companion's explicit outer-host `review-and-resume --host claude` uses a separate Claude print-mode session and validates its successful JSON `structured_output`, distinct UUID, request, source fingerprint, captured transcript and checkpoint bindings. It uses the same controller, durable budgets and final completion gate as Codex. The controller checks the CLI version before invoking the provider. Reviewer tools are restricted to Read/Glob/Grep; shell commands, file edits, MCP tools and model delegation are unavailable through the provider's documented tool configuration. The reviewer can inspect source and captured author checks but cannot independently execute tests or obtain git diff through Bash. Managed host policy still applies; these flags are not an OS sandbox.

Implementation resume targets the exact original UUID, preserves project/host policy, and denies unattended permission prompts rather than bypassing them. Missing permissions remain a blocker. Malformed, missing, same-session, stale or failed output stays failed evidence; no reviewer result is inferred from exit code alone. Fake CLI subprocess fixtures verify the adapter/controller contract. No paid live Claude evaluation or desktop parity claim accompanies this source implementation.

Provider schema 1 targets Claude Code 2.1.296+: [CLI reference](https://code.claude.com/docs/en/cli-reference), [programmatic output and exact session resume](https://code.claude.com/docs/en/headless), [structured output failure handling](https://code.claude.com/docs/en/agent-sdk/structured-outputs). Accessed 2026-10-12; no publication date given.
