# Claude Code adapter

This file documents Claude-specific mechanics only. Workflow mode, requirements, and budgets come from the stored `workflow-contract.json`; see the parent execute skill. No Claude setting adds work requirements beyond that contract.

- Claude Code may load the shared router skill from its native skills directory. A capability is available when it is in the library, loaded only after its instructions are read, and mandatory only when the workflow contract or user request requires it.
- Claude hooks are optional host integrations. Treat a hook as active only when Claude Code reports that it is registered and enabled. A hook's presence does not change user authorization or the canonical workflow contract.
- Use Claude's native Task/Agent tools when delegation is useful and the stored worker budget permits it. Follow native packet conventions only when the contract requires a packet; do not impose a fixed lane count or model tier.
- Resolve helper paths through `{{ETRNL_COMPANION}}`, which supplies `ETRNL_HOME`, the shared `ETRNL_LIBRARY_ROOT`, and host-local state directories. Do not assume `~/.claude` is the shared library root or rewrite helper paths manually.
- When diagnosing Claude-specific behavior, distinguish installed hooks/settings from source templates and from the model's loaded context.
