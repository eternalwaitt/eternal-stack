<!-- Modified from pbakaus/impeccable@4d849eb7 for eternal-stack: scripts and self-update removed; see NOTICE (Apache-2.0 §4(b)) -->
# $impeccable live

> **Not available in this vendored copy.** Upstream Impeccable ships a live browser variant mode (element selection in the page, AI-generated HTML+CSS variants hot-swapped over HMR), but it depends on upstream's executable helper stack — a local helper server, browser injection scripts, and a polling loop — none of which is included here.

## Manual alternative

Iterate on the UI without the live helper:

1. Edit the source files directly and preview the result in the browser through the dev server's own hot reload.
2. Apply the relevant Impeccable commands for the change you want: `polish` for a final quality pass, `layout` for spacing and hierarchy, `animate` for motion.
3. Use the harness's own browser tooling (navigation, screenshots, console inspection) to capture before/after evidence and iterate on what you see.
4. When comparing design directions, build each variant as a scoped CSS branch or a temporary duplicate of the component, screenshot both, and let the user pick; then remove the losing branch.

If the user specifically wants upstream's interactive live mode, they can install upstream Impeccable (pbakaus/impeccable) separately alongside this stack.
