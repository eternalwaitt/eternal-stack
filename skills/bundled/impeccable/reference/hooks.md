<!-- Modified from pbakaus/impeccable@4d849eb7 for eternal-stack: scripts and self-update removed; see NOTICE (Apache-2.0 §4(b)) -->
# $impeccable hooks

> **Not available in this vendored copy.** Upstream Impeccable ships deterministic edit-time design-detector hooks (post-tool-use reminders and pre-write blocking, wired through per-harness hook manifests and `.impeccable/config.json`). The vendored copy does not include the hook scripts or the detector they run.

Eternal-stack owns its own hook enforcement. Do not install, wire, or reference upstream Impeccable hook scripts from this skill; deterministic edit-time gating in this stack goes through eternal-stack's `hooks/` surface instead.

If the user asks for the hook workflow, explain the above and point them at the manual review commands (`critique`, `audit`, `polish`), or at installing upstream Impeccable (pbakaus/impeccable) separately if they want its hook plumbing.
