# Reading list app: agreed v1

This is a small local app for one reader. The complete first version must let the reader:

1. Add a book with title and author.
2. View the full list.
3. Edit a book's title or author.
4. Remove a book.
5. Set status to exactly `Want to read`, `Reading`, or `Finished`.
6. Keep the list after the app is restarted.

Use a simple local command-line interaction runnable with the installed Node.js runtime. The app must work through fresh `node app.js` processes, so persistence is exercised across restarts. Support `node app.js --data <path> add --title <title> --author <author>`, `list`, `update <id> [--title <title>] [--author <author>] [--status <status>]`, and `remove <id>`; `node app.js --help` should explain these commands. No account, remote service, import, or sharing feature is in scope. Choose routine formatting and storage details yourself and explain only a meaningful tradeoff.
