# AI Workflows

Grove is built for workflows where multiple AI coding agents run concurrently — each on its own branch, with its own isolated environment.

## The problem

Running parallel AI agents on the same repo without isolation leads to:

- Port conflicts between dev servers or Docker stacks
- Agents overwriting each other's database state
- No visibility into what's running where or what's blocked

Grove solves this with isolated worktrees that each get their own environment.

## Setup

### 1. Initialize the repo

```bash
grove setup
```

Grove writes `.grove/config.json` with naming templates for ports, Compose project names, and DB schemas. Each worktree expands these templates independently.

### 2. Add AGENTS.md

Create an `AGENTS.md` at your repo root. AI agents read this file when they start a session.

```markdown
# Agent Instructions

## Environment

You are running inside a git worktree managed by Grove. Each worktree is an
isolated environment with its own Docker stack, port assignments, and database
schema. Do not assume ports or assume shared state with other worktrees.

## Getting your environment

Before starting work, discover your environment:

    grove status <your-branch-name> --json

This returns a JSON object:

    {
      "ok": true,
      "web": "http://localhost:8081",
      "api": "http://localhost:4567",
      "source": "grove",
      "mode": "docker-compose"
    }

Use the `web` URL for browser-facing requests. Use the `api` URL for backend
calls. Never hardcode ports — always query Grove first.

## Reporting your status

Write `.worktree-manifest.json` at the worktree root to report status back to Grove:

    {
      "agentName": "claude",
      "agentStatus": "running",
      "agentActivity": "Brief description of what you're doing right now",
      "startedAt": "<ISO timestamp>",
      "testResults": {
        "passed": 0,
        "failed": 0,
        "skipped": 0,
        "lastRun": "<ISO timestamp>"
      }
    }

Set agentStatus to: running | waiting | done | errored

## Parallel agent rules

1. Never modify files outside your worktree directory.
2. Never write to shared infrastructure. Use the schema/port assigned to your
   worktree via .env.worktree.
3. Do not push directly to main or any branch another agent is working on.
4. If you need upstream changes, run `git rebase origin/main` inside your
   worktree — not a merge.
```

Adapt the specific rules and commands for your project.

### 3. Start environments for each agent

```bash
grove start feat/auth-refresh --new
grove start fix/helm-chart --new
```

Each worktree gets its own `.env.worktree` with unique ports:

```
feat/auth-refresh → WEB_PORT=8081, DB_PORT=5433, COMPOSE_PROJECT_NAME=my-app-feat-auth-refresh
fix/helm-chart    → WEB_PORT=8082, DB_PORT=5434, COMPOSE_PROJECT_NAME=my-app-fix-helm-chart
```

## Monitoring from the TUI

```bash
grove
```

Press `s` to sync. As agents write `.worktree-manifest.json`, the TUI reflects their state in the right panel:

```
┌─ worktrees ──────────┐┌─ agent / docker ───────────────────────┐
│ ▶ feat/auth-refresh  ││ ● running · editing AuthService.ts     │
│   fix/helm-chart     ││   started 14m ago                      │
│   main               ││                                        │
└──────────────────────┘│ :8081  :4567   PR #847                 │
                        └────────────────────────────────────────┘
```

## Environment discovery for agents

Agents query Grove for their environment URLs:

```bash
grove status feat/auth-refresh --json
```

```json
{
  "ok": true,
  "web": "http://localhost:8081",
  "api": null,
  "source": "grove",
  "mode": "docker-compose"
}
```

The `--json` flag returns machine-readable output that agents can parse. The `web` and `api` URLs are the canonical addresses for this worktree's environment.

## Agent status values

| Status    | Meaning                                         |
| --------- | ----------------------------------------------- |
| `idle`    | Started but not actively working                |
| `running` | Actively making changes                         |
| `waiting` | Blocked — needs tests to finish, or human input |
| `done`    | Completed successfully                          |
| `errored` | Hit an unrecoverable problem                    |

## Tear down when done

```bash
grove stop feat/auth-refresh
grove docker teardown feat/auth-refresh   # destroy volumes if needed
grove delete feat/auth-refresh --yes
```

Or clean up the branch too:

```bash
grove delete feat/auth-refresh --delete-branch --yes
```
