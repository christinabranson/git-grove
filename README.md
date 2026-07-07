# GitGrove

```
           ░██   ░██
                 ░██
 ░████████ ░██░████████  ░████████ ░██░████  ░███████  ░██    ░██  ░███████
░██    ░██ ░██   ░██    ░██    ░██ ░███     ░██    ░██ ░██    ░██ ░██    ░██
░██    ░██ ░██   ░██    ░██    ░██ ░██      ░██    ░██  ░██  ░██  ░█████████
░██   ░███ ░██   ░██    ░██   ░███ ░██      ░██    ░██   ░██░██   ░██
 ░█████░██ ░██    ░████  ░█████░██ ░██       ░███████     ░███     ░███████
       ░██                     ░██
 ░███████                ░███████
```

> _See the forest. Manage the trees._

[![CI](https://github.com/christinabranson/git-grove/actions/workflows/ci.yml/badge.svg)](https://github.com/christinabranson/git-grove/actions/workflows/ci.yml) [![npm](https://img.shields.io/npm/v/@gitgrove/cli/alpha?label=npm%20%40alpha)](https://www.npmjs.com/package/@gitgrove/cli) [![docs](https://img.shields.io/badge/docs-gitgrove.dev-blue)](https://gitgrove.dev)

**Mission control for parallel git worktrees.**

Grove wraps git worktrees in a keyboard-driven terminal interface — giving each branch its own isolated environment, Docker stack, and port assignments. Run multiple AI agents, review PRs, and juggle features in parallel without switching branches or fighting port conflicts.

```bash
npm install -g @gitgrove/cli@alpha

grove        # open TUI in any repo with worktrees
```

<!-- TODO: add terminal demo gif -->

---

## The core idea

Grove's job is simple: for each branch, it writes a `.env.worktree` file with unique values — a different port, a different Docker project name, a different database schema. Your `docker-compose.yml` reads these variables. Each branch gets a completely isolated stack. No manual port tracking, no coordination between terminals.

Grove owns `.env.worktree` (generated, disposable). You own `.env` (persistent, never overwritten by Grove).

```bash
# .env.worktree generated for feat/login
COMPOSE_PROJECT_NAME=my-app-feat-login
WEB_PORT=8081
DB_PORT=5433
DB_SCHEMA=my_app_feat_login

# .env.worktree generated for feat/payments (running in parallel)
COMPOSE_PROJECT_NAME=my-app-feat-payments
WEB_PORT=8083
DB_PORT=5435
DB_SCHEMA=my_app_feat_payments
```

Normally Grove hands these files straight to `docker compose --env-file`. If your startup needs more — waiting for a DB healthcheck, running migrations, seeding fixture data on first boot — a [custom startup script](https://gitgrove.dev/guides/docker#custom-startup-scripts) lets you take over while still receiving all the generated env vars.

---

## Why Grove?

Git worktrees are powerful — you can have multiple branches checked out simultaneously, each in its own directory. But the experience is rough. You manage paths manually, ports collide between stacks, and there's no way to see what's running where.

Modern development workflows make this worse:

- **AI coding agents** need isolated environments so they don't interfere with each other
- **Parallel feature work** means wanting to context-switch without tearing down a running stack
- **Docker Compose projects** need unique project names and port bindings per environment
- **PR review** is faster when you can spin up the exact branch without disrupting your current work

Grove solves this with a layer on top of standard git and Docker primitives:

- Automatic environment setup (Docker Compose or Node dev servers)
- Unique port and project name allocation per branch — no coordination required
- A TUI that shows all worktrees, their environments, and agent status at a glance
- A CLI that AI agents and scripts can query for environment discovery

---

## Features

- **Interactive TUI** — keyboard-driven dashboard showing worktree list, agent status, Docker state, and change footprint
- **Automatic port allocation** — each worktree gets unique ports; no manual coordination
- **Docker Compose integration** — per-worktree stacks with shared infrastructure support (db, redis, etc.)
- **Node dev server support** — auto-detects Vite, Next.js, and generic `npm run dev` projects
- **PR checkout** — `grove start 1234` resolves the branch from a PR number via `gh`
- **Agent manifest** — AI agents write `.worktree-manifest.json`; Grove displays their status live in the TUI
- **Editor integration** — `grove open` launches your editor; auto-detects VS Code, Cursor, Windsurf, vim, and more
- **Environment templating** — naming templates for Compose project names, DB schemas, and port variables
- **Env contract resolution** — passthrough, derived, and required vars for safe `.env.worktree` generation
- **Doctor command** — diagnose port mismatches and env contract issues before they break your stack
- **Zero-config start** — `grove` works in any repo with worktrees; no setup required to get started

---

## Quick Start

**1. Install**

Node 18+ required.

```bash
npm install -g @gitgrove/cli@alpha
grove --version
```

**2. Open the TUI in any repo**

```bash
cd your-project
grove
```

Grove reads `git worktree list` and displays them. Nothing to configure.

**3. Initialize a repo for environment management**

```bash
grove setup
```

Grove detects your project type (Docker Compose, Vite, Node) and writes `.grove/config.json`. This is optional — skip it if you only need worktree visibility.

**4. Create a worktree**

```bash
# Check out an existing remote branch
grove start feat/my-feature

# Create a new branch off main
grove start feat/my-feature --new

# Check out a PR by number (requires gh)
grove start 1234
```

**5. Manage the environment**

```bash
grove open feat/my-feature    # open in your editor
grove status                  # show all worktrees with status
grove stop feat/my-feature    # stop the environment
grove delete feat/my-feature  # remove the worktree
```

---

## Example Workflows

### AI-assisted development

Run multiple AI agents in parallel — each on its own branch with its own stack:

```bash
# Start two isolated environments
grove start feat/auth-refresh --new
grove start fix/helm-chart --new

# Each worktree gets unique ports — stacks don't conflict
grove status

# Launch agents in each worktree (Claude Code, Codex, etc.)
# Agents read AGENTS.md for environment discovery instructions

# Watch status from the TUI — agents report back via .worktree-manifest.json
grove
```

Add an `AGENTS.md` to your repo telling AI agents how to discover their environment and report status back to Grove. Agents write `.worktree-manifest.json` with their current status; Grove displays it live in the TUI on sync (`s`).

### Reviewing a PR

```bash
# Resolve branch from PR number, create isolated worktree and environment
grove start 847

# Spin up its stack
grove docker up feat/review-branch

# Open in your editor
grove open feat/review-branch

# Tear down when done
grove delete feat/review-branch
```

### Dockerized development

```bash
# One-time repo setup — detects Docker Compose automatically
grove setup

# Start shared infrastructure (db, redis) — runs once across all worktrees
grove shared up

# Start a per-branch stack with unique ports
grove start feat/my-feature

# Inspect env contract vs generated vars if something seems off
grove doctor env feat/my-feature

# Tear down a branch stack and its volumes
grove docker teardown feat/my-feature
```

### Parallel feature development

```bash
# Two features, two isolated stacks, no coordination needed
grove start feat/payments --new
grove start feat/notifications --new

# Each gets unique ports — no collision
grove status

# Switch context by opening the other worktree in your editor
grove open feat/payments
grove open feat/notifications
```

### Monorepo workflows

For projects with multiple services, configure `.grove/config.json` with per-service providers and naming templates:

```json
{
  "project": "my-monorepo",
  "providers": {
    "web": { "type": "docker-compose", "service": "web" },
    "api": { "type": "docker-compose", "service": "api" }
  },
  "naming": {
    "composeProject": "${project}-${branch_safe}",
    "ports": { "WEB_PORT": "auto", "API_PORT": "auto" }
  }
}
```

`${branch_safe}` expands to the branch name lowercased with `/` replaced by `-`, keeping Compose project names valid and unique per worktree.

---

## TUI Reference

Run `grove` with no arguments to open the interactive interface:

```
┌─ worktrees ──────────┐┌─ agent / docker ───────────────────────┐
│ ▶ feat/auth-refresh  ││ ● running · editing AuthService.ts     │
│   feat/pipeline-cache││   started 14m ago                      │
│   fix/helm-chart     ││                                        │
│   main               ││ :8081  :4567   PR #847                 │
└──────────────────────┘│                                        │
┌─ change footprint ───┐│ src/auth/                              │
│ src/auth/      +2    ││   AuthService.ts        +42 -11        │
│ src/middleware/ +1   ││   TokenRefresh.ts       +28 -0         │
│ tests/         +1    ││ tests/                                 │
└──────────────────────┘│   auth.test.ts          +55 -4         │
                        └────────────────────────────────────────┘
[ l ] launch agent  [ o ] open  [ u ] docker up  [ d ] down  [ s ] sync  [ ? ] help
```

| Key       | Action                                       |
| --------- | -------------------------------------------- |
| `↑` / `k` | Move up                                      |
| `↓` / `j` | Move down                                    |
| `n`       | New worktree                                 |
| `s`       | Sync — refresh git status, manifests, docker |
| `o`       | Open in editor                               |
| `u`       | Docker up                                    |
| `d`       | Docker down                                  |
| `D`       | Delete worktree (with confirmation)          |
| `x`       | Expand / collapse change footprint           |
| `/`       | Filter by branch name or agent state         |
| `?`       | Toggle keyboard shortcut help                |
| `q`       | Quit                                         |

---

## CLI Reference

All commands work without the TUI — suitable for scripting and agent use:

```bash
grove status                               # table of all worktrees
grove status feat/my-feature --json        # machine-readable JSON for agents
grove start feat/my-feature                # create or attach worktree, start env
grove start feat/my-feature --new          # create new branch off default branch
grove start feat/my-feature --new --base develop
grove start 1234                           # resolve PR number to branch via gh
grove open feat/my-feature                 # open in editor
grove stop feat/my-feature                 # stop the environment
grove sync                                 # refresh all manifests and git status
grove delete feat/my-feature               # remove worktree (confirmation prompt)
grove delete feat/my-feature --yes         # skip confirmation
grove delete feat/my-feature --delete-branch
grove prune                                # clean up stale worktree metadata
grove setup                                # detect project type, write .grove/config.json
grove setup --preset docker --yes          # non-interactive
grove setup --dry-run                      # preview without writing
grove shared up                            # start shared infrastructure stack
grove shared down
grove shared status
grove docker up feat/my-feature            # start compose stack for a worktree
grove docker down feat/my-feature
grove docker teardown feat/my-feature      # destroy volumes (confirmation required)
grove doctor                               # run Grove health checks
grove doctor env feat/my-feature           # inspect compose env contract
grove info                                 # show resolved configuration
```

---

## Philosophy

**Isolation is freedom.** When every branch has its own environment, you can experiment without fear. You're not sharing a database or fighting port conflicts. Each worktree is its own world.

**Context switching should be instant.** Switching tasks shouldn't mean running `docker down`, checking out a branch, and waiting for a rebuild. Grove keeps environments running so you can switch focus in seconds.

**Agents need structure.** AI coding agents work best when they have predictable environments and a way to report status. Grove provides both without inventing a new abstraction layer on top of your tools.

**Zero lock-in.** Your project works exactly the same with or without Grove. There's nothing to undo. Grove adds a layer on top of standard git and Docker primitives — remove Grove and everything still works.

---

## Documentation

- [Why GitGrove?](https://gitgrove.dev/getting-started/why)
- [Installation](https://gitgrove.dev/getting-started/installation)
- [Quick Start](https://gitgrove.dev/getting-started/quickstart)
- [Core Concepts](https://gitgrove.dev/getting-started/concepts)
- [Common Workflows](https://gitgrove.dev/guides/workflows)
- [AI Workflow Guide](https://gitgrove.dev/guides/ai-workflows)
- [Docker Guide](https://gitgrove.dev/guides/docker)
- [Command Reference](https://gitgrove.dev/commands/init)

---

## Contributing

The codebase is TypeScript — Ink for the TUI, Commander for the CLI, Vitest for tests.

```bash
git clone https://github.com/christinabranson/git-grove.git
cd git-grove
npm install
npm test           # watch mode
npm run test:run   # CI mode
npm run build
```

Test layout: co-located test files (`src/tui/App.tsx` → `src/tui/App.test.tsx`). TUI components use a custom `render-for-test` helper for ink v4 compatibility.

Before opening a PR: `npm run test:run`, `npm run build`, and `npx prettier --check .` must all pass. CI enforces these.

---

## License

MIT
