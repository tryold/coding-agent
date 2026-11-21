# Coding Agent

An AI agent for your team's GitHub repositories: ask it about the code, or hand it a task and it works in a cloud sandbox until it can open a pull request.

Inspired by https://app.devin.ai

Built with [oss.new](https://oss.new) for [EveryApp](https://github.com/every-app/every-app).

## Features

- Admins add the GitHub repositories the agent may work on, each with an optional setup command.
- Start a session with a task, a repository and an agent tier, and watch its messages, commands and file changes as they happen.
- Ask questions or request a plan about a repository, get answers that cite files, and turn a plan into an agent session.
- Get a pull request on a new branch when the work is done, with follow-ups pushing to the same one.
- Share a session with the organization, and let members join in with messages.
- Keep knowledge entries the agent gets in every session on a matching repository.

Left out: accounts and sign-in, which your Gateway handles; the desktop editor, CLI and mobile apps; an embedded IDE and browser; chat and tracker integrations; scheduled and automated sessions; billing and usage reports.

## Setup

Install and check:

```sh
pnpm install
pnpm test
pnpm types:check
```

Run it locally with `pnpm dev`, and deploy with `pnpm run deploy` (or install a release from your Gateway). The app needs no secrets or settings of its own. Sessions start once these are set on the Gateway (`pnpm everyapp configure coding-agent` walks them):

- `openrouter`: the model behind the Lite, Normal and Ultra tiers (`everyapp provider add openrouter`).
- `daytona`: the sandbox each session runs in (`everyapp provider add daytona`).
- `github`: a fine-grained token with Contents and Pull requests read and write on the repositories (`everyapp provider add github`).

The checks in `checks/` run against a packaged release with a local stand-in for those three services; real model, sandbox and GitHub calls weren't part of them.

## Limitations

- Daytona is served only by a self-hosted Gateway.
- One GitHub token serves the whole organization: pull requests are opened as that token's account.
- Session pages refresh every couple of seconds while the agent works, rather than streaming.
- The agent stops after 60 turns in one run; a follow-up message resumes it.
