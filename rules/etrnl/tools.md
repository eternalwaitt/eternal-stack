# Tools

- Use modern file and text tools: `fd`, `rg`, `bat`, `eza`, `sd`, `dust`, `trash`, and `sg`.
- Use `sg` for structural code search and codemods; use `rg` for strings, docs, and config.
- Use Context7, the current-docs lookup service, or official docs for current package, framework, SDK, or API behavior.
- Use browser or CLI smoke checks for user-visible behavior when runtime behavior matters.
- Email and Google Workspace write policy:
  - Do not send email or perform Google Workspace writes without runtime validation hooks that verify account identity and explicit user approval before the write.
  - "Where required" means all automated sends/writes and any operation targeting shared calendars, shared drives, or other users' mailboxes.
  - Keep repeatable consent and identity steps in external or future `etrnl-send-email`/`etrnl-write-workspace` workflows.
  - Enforce the policy in `hooks/cc-pretooluse-guard.sh`: `command_is_email_send` blocks sends until approval evidence exists, and `command_is_gws_write` blocks Google Workspace writes until an account/help check is recorded.
