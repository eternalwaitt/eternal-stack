# Eternal Stack

## A coding companion for Claude Code and Codex

Eternal Stack is a coding companion for Claude Code and Codex. Describe what you want in everyday language; it helps you understand a project, make choices, plan and build changes, and check results—whether you are creating something new or improving software you already use.

## Why Eternal exists

Writing code is only one part of making something that works. You also have to decide what to build, ask useful questions, understand what is already there, and check whether the result does what you meant. These challenges can feel big when making a first personal tool and grow as an idea becomes a product or a team changes a large codebase. Eternal brings repeatable engineering guidance into the conversation to help you work through decisions and understand the choices.

Small tasks can stay simple. As work grows, Eternal can help keep the agreed goal in view, organize the task, and bring in more review where the app supports it. It reports what it checked and what needs attention; you stay in charge.

You might ask:

- “I want a simple tool to organize my recipes. I’ve never built an app; help me choose a first version and explain the choices.”
- “I’m new to this project. Show me how sign-in works and where I should look first.”
- “The checkout button fails after I add an item. Find the cause, fix it, and check the change.”
- “Review this change for problems that could affect existing users. Don’t edit anything.”
- “Make invoice retries safe across our billing, queue and persistence packages. Preserve existing changes, trace failures, and verify the whole flow.”

## Get started

Open your project in Claude Code or Codex and ask for help in your own words. To set up Eternal Stack, ask your coding assistant to follow the [setup guide](docs/install.md). It checks your checkout and existing setup before explaining what the default installation changes.

Security audits include a dedicated authentication and session-abuse check, backed by version-aware Better Auth guidance when that provider is present.

The current release is [v0.13.0](https://github.com/eternalwaitt/eternal-stack/releases/tag/v0.13.0), adding standalone Upgrade Deps with whole-toolchain impact planning and catalog optimization. The redesigned companion debuted in v0.12.0; see the setup guide for installation and migration limits.

For a first conversation, try:

> I’m working in an unfamiliar project. Help me understand how its main feature works, point me to the relevant parts of the code, and suggest a useful next step. Please explain as you go.

See this repository's [current project state](PROJECT_STATE.md). For ongoing projects, the assistant maintains a concise [project-state overview](docs/project-state.md) with feature status, pending work and useful lessons as part of the task. The guide explains which updates are enforced by helpers and which depend on native assistant guidance.

See [how the companion works today](docs/product-direction.md), [what differs between Claude Code and Codex](docs/host-capabilities.md), or [the kinds of help available](docs/skills.md).

## Acknowledgments

To my mentor and friend [@PierreAndreis](https://github.com/PierreAndreis): thank you. You have been a steady source of inspiration in how you build, how you teach, and how you treat people along the way. Eternal Stack carries more of your influence than any changelog line could capture, and I'm grateful for it.
