# Hindsight Templates

These JSON files are copied into the installed Hindsight config without comments.

- `hindsightApiUrl`: empty for local daemon mode, or the HTTPS endpoint for an external Hindsight service.
- `hindsightApiTokenEnv`: environment variable that stores the external API token. The token value is never written to tracked files.
- `apiPort`: local daemon port. The default is `9077`; change it before starting the daemon when that port is already in use.
- `dynamicBankId` and `dynamicBankGranularity`: keep recall scoped by agent and project.
- `recallContextTurns`, `recallTypes`, and `recallPromptPreamble`: bound semantic recall so fresh repo/runtime evidence remains authoritative.
- `retainToolCalls` and `retainTranscripts`: keep both false for the public etrnl profile.
