# Grove

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

Grove is a terminal-based mission control for parallel agentic workflows. It wraps git worktrees, dev environment lifecycle, and AI agent sessions into a single keyboard-driven interface — without replacing any of your existing tooling.

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

---

## Installation

Grove is a global npm package. It requires Node 18+ — check with `node --version` if you're managing Node via `nvm` or similar.

```bash
git clone https://github.com/your-org/grove-wt.git
cd grove-wt
npm install
npm run build
npm link          # makes `grove` available globally
```

Once linked, confirm it worked:

```bash
grove --version
```

**Dependencies** — Grove requires these tools already in your PATH before first use:

| Tool     | Required for                                     |
| -------- | ------------------------------------------------ |
| `git`    | All worktree operations                          |
| `gh`     | PR resolution (`grove start <PR#>`), GitHub sync |
| `docker` | Docker Compose environment management            |

If any of these are missing, the related features won't activate — no crash, but check your PATH if something seems off.

### Editor detection

Grove resolves your editor automatically for `grove open` / `o` key — no configuration required. It checks, in order: the `editor` field in `.grove/config.json`, the `$VISUAL` environment variable, `$EDITOR`, then scans for `code`, `cursor`, `windsurf`, `vim`, and `nano`. On macOS it also checks standard app bundle locations, so VS Code works even if `code` isn't in your PATH.

---

## Preparing a repo for Grove

Grove is a **progressive enhancement layer**. Your project works exactly the same with or without it. There are three levels of integration, each building on the last.

The fastest way to adopt Grove in an existing repo is `grove setup`.

---

## `grove setup` — one-time repo adoption

Run `grove setup` from inside any repo and Grove will inspect the project, propose a configuration, and write `.grove/config.json`. Nothing else is modified.

```bash
grove setup
```

```
Detecting project type…

  ✔ Found docker-compose.yml
  ✔ App services: web, api
  ✔ Shared infrastructure: db, redis
  ✔ Found package.json — framework: vite

  Using preset: docker (auto-detected)

Proposed .grove/config.json:

{
  "enabled": true,
  "project": "my-app",
  "providers": {
    "web": { "type": "docker-compose", "service": "web" },
    "api": { "type": "docker-compose", "service": "api" }
  },
  "shared": { "db": true, "redis": true },
  "naming": {
    "composeProject": "grove-${branch_safe}",
    "dbSchema": "my_app_${branch_safe}",
    "webPort": "auto",
    "apiPort": "auto"
  },
  "worktrees": { "prefix": "grove" }
}

  Add these to .gitignore (per-worktree, should not be committed):
    .env.worktree
    .worktree-manifest.json

Write .grove/config.json? (y/N)
```

Grove only writes `.grove/config.json`. It never touches `docker-compose.yml`, `package.json`, `.env`, or any other project file.

### Flags

| Flag              | Effect                                                        |
| ----------------- | ------------------------------------------------------------- |
| `--preset <name>` | Skip detection, use a known preset (`docker`, `vite`, `node`) |
| `--dry-run`       | Print the proposed config without writing anything            |
| `--yes`           | Skip the confirmation prompt                                  |
| `--reset`         | Overwrite an existing `.grove/config.json`                    |

```bash
grove setup --preset docker --yes     # non-interactive, docker preset
grove setup --dry-run                 # preview only
grove setup --reset                   # regenerate from scratch
```

### Available presets

| Preset   | When to use                                                                                                    |
| -------- | -------------------------------------------------------------------------------------------------------------- |
| `docker` | Project uses Docker Compose. Grove maps services and marks shared infra (postgres, redis, etc.) automatically. |
| `vite`   | Vite-based frontend (Vue, React, Svelte). Runs `npm run dev` per worktree.                                     |
| `node`   | Generic Node.js project. Runs `npm run dev` or `npm start` per worktree.                                       |

### Naming templates

The `naming` section in `.grove/config.json` stores **rules, not values**. Templates are expanded at `grove start` time so each worktree gets unique, collision-free names.

| Variable         | Expands to                                                            |
| ---------------- | --------------------------------------------------------------------- |
| `${branch}`      | Branch name as-is (e.g. `feat/auth-refresh`)                          |
| `${branch_safe}` | Branch lowercased, `/` → `-`, max 40 chars (e.g. `feat-auth-refresh`) |
| `${project}`     | Project name from config                                              |

Example:

- `"composeProject": "grove-${branch_safe}"` → `grove-feat-auth-refresh`
- `"dbSchema": "${project}_${branch_safe}"` → `myapp_feat_auth_refresh`
- `"webPort": "auto"` → Grove finds a free port at spin time

This means you never manually assign ports or project names. `grove start` generates the `.env.worktree` file for each new worktree automatically.

---

### Level 0 — No setup required

Run `grove` in any git repository with worktrees. Grove reads `git worktree list` and displays them. No files to add, nothing to configure.

---

### Level 1 — Docker Compose environments

If your project uses Docker Compose and you want Grove to manage per-worktree stacks, add a `.env.worktree` file at the worktree root. This file is **gitignored** — it's created per worktree, not committed.

```bash
# .env.worktree
COMPOSE_PROJECT_NAME=my-app-feat-auth   # used as `docker compose -p` value
WEB_PORT=8081                           # primary app URL (shown in TUI, used by agents)
LOCALSTACK_PORT=4567                    # optional secondary service
REDIS_DB=1                              # informational — shown in TUI card
DB_SCHEMA=my_app_feat_auth             # informational — shown in TUI card
```

Grove reads this file to discover port bindings and the Compose project name. It never writes to it. Each worktree gets its own `.env.worktree` with unique ports and a unique `COMPOSE_PROJECT_NAME` to keep stacks isolated.

Add `.env.worktree` to your `.gitignore`:

```
.env.worktree
```

Grove also checks for a `docker-compose.yml` or `compose.yaml` at the repo root to confirm Docker support exists before showing any Docker UI.

---

### Level 2 — Explicit Grove config

For full control over how Grove manages environments, add `.grove/config.json` to your repo:

```json
{
  "enabled": true,
  "project": "my-app",
  "providers": {
    "web": { "type": "docker-compose", "service": "web" },
    "api": { "type": "docker-compose", "service": "api" }
  },
  "shared": { "db": true, "redis": true },
  "sharedComposeFile": "compose.shared.yaml",
  "naming": {
    "composeProject": "my-app-${branch_safe}",
    "sharedProject": "my-app-shared",
    "dbSchema": "my_app_${branch_safe}",
    "webPort": "auto",
    "apiPort": "auto"
  },
  "worktrees": {
    "root": "/Users/you/worktrees"
  }
}
```

When this file is present, Grove uses it instead of inferring the environment. You can commit this file — it describes how the project works, not per-worktree state.

**Provider types:**

| `type`           | When to use                                     |
| ---------------- | ----------------------------------------------- |
| `docker-compose` | Project uses Docker Compose                     |
| `node-scripts`   | Plain Node project, `npm run dev` / `npm start` |
| `custom-shell`   | Custom start command                            |

**Top-level config fields:**

| Field               | Default                          | Description                                    |
| ------------------- | -------------------------------- | ---------------------------------------------- |
| `sharedComposeFile` | `compose.shared.yaml`            | Path to the shared infrastructure compose file |
| `editor`            | auto-detected                    | Editor to open with `grove open` / `o` key     |
| `worktrees.root`    | `<repo-parent>/<repo>-worktrees` | Where new worktrees are placed                 |

---

## Shared infrastructure

When a project uses Docker Compose, some services (database, Redis, LocalStack) are shared across all worktrees while others (web server, API) run isolated per branch. Grove manages these two layers separately.

### Compose file layout

```
compose.yaml           # per-worktree: web, api, worker
compose.shared.yaml    # shared: db, redis, localstack
```

**`compose.shared.yaml`** runs once under a fixed project name, regardless of which branch is active:

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: dev
    volumes:
      - db_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine

volumes:
  db_data:
```

**`compose.yaml`** runs once per worktree and connects to the shared network to reach `db` and `redis` by hostname:

```yaml
services:
  web:
    build: .
    ports:
      - "${WEB_PORT}:3000"
    environment:
      DATABASE_URL: postgres://postgres:dev@db:5432/${DB_SCHEMA}
      REDIS_URL: redis://redis:6379
    networks:
      - default
      - shared_net

networks:
  shared_net:
    external: true
    name: ${SHARED_PROJECT_NAME}_default # Grove writes this into .env.worktree
```

Docker Compose automatically creates a network named `<project>_default` for every project. Per-worktree services join the shared project's network as an external network — that's how they reach `db` and `redis` by service name without any DNS configuration.

### Grove config for shared infrastructure

```json
{
  "shared": { "db": true, "redis": true },
  "sharedComposeFile": "compose.shared.yaml",
  "naming": {
    "sharedProject": "my-app-shared",
    "composeProject": "my-app-${branch_safe}"
  }
}
```

`naming.sharedProject` is required to enable shared stack management. When set, Grove writes `SHARED_PROJECT_NAME=my-app-shared` into every `.env.worktree`, so `compose.yaml` can resolve the external network name automatically.

The compose file path defaults to `compose.shared.yaml` at the repo root. Override it with `sharedComposeFile`:

```json
{ "sharedComposeFile": "docker/compose.shared.yaml" }
```

### Managing the shared stack

```bash
# Start shared infrastructure (idempotent — safe to run if already up)
grove shared up

# Check shared stack state
grove shared status

# Stop shared infrastructure
grove shared down
```

`grove start` automatically starts the shared stack if it is not already running. You only need to run `grove shared up` manually if you want to start it before any worktree is active, or if `grove start` warns that it could not find the compose file.

`grove delete` stops the per-worktree stack but never touches the shared stack, since other worktrees may depend on it.

### `.env.worktree` with shared stack

When `naming.sharedProject` is configured, the generated `.env.worktree` looks like:

```env
COMPOSE_PROJECT_NAME=my-app-feat-auth
WEB_PORT=8081
API_PORT=8082
DB_SCHEMA=my_app_feat_auth
SHARED_PROJECT_NAME=my-app-shared
```

---

### Level 3 — Agent manifest

Any process (an AI agent, a shell script, Grove itself) can write a `.worktree-manifest.json` file at the worktree root to communicate state back to Grove. Grove reads this file on sync and displays it in the TUI.

```json
{
  "port": 3001,
  "agentName": "claude",
  "agentStatus": "running",
  "agentActivity": "editing AuthService.ts",
  "startedAt": "2025-04-10T14:23:00Z",
  "testResults": {
    "passed": 42,
    "failed": 0,
    "skipped": 3,
    "lastRun": "2025-04-10T14:30:00Z"
  },
  "notes": "Blocked on the auth question — revisit before merging"
}
```

`agentStatus` values: `idle` · `running` · `waiting` · `done` · `errored`

This file is **gitignored**:

```
.worktree-manifest.json
```

---

## AGENTS.md — Instructing AI agents about Grove

If you want AI agents (Claude Code, Codex, or others) running in your worktrees to participate in Grove's environment model, add an `AGENTS.md` file to your repo root. Agents read this file when they start a session.

Here is a template to adapt:

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
      "mode": "docker-compose",
      "agent": "idle"
    }

Use the `web` URL for any browser-facing requests. Use the `api` URL for
backend or LocalStack calls. Never hardcode ports — always query Grove first.

## Reporting your status

Write `.worktree-manifest.json` at the root of this worktree to report your
status back to Grove. Update it as your work progresses.

    {
      "agentName": "claude",
      "agentStatus": "running",
      "agentActivity": "Brief description of what you're doing right now",
      "startedAt": "<ISO timestamp when you began>",
      "testResults": {
        "passed": 0,
        "failed": 0,
        "skipped": 0,
        "lastRun": "<ISO timestamp>"
      }
    }

Set `agentStatus` to:

- `running` — actively working
- `waiting` — blocked, waiting for tests, or need human input
- `done` — finished successfully
- `errored` — encountered an unrecoverable problem

The `agentActivity` string is displayed live in the Grove TUI — keep it short
and meaningful (e.g. "writing tests for AuthService", "running migration").

## Parallel agent rules

Multiple agents may be running concurrently on different worktrees. To avoid
conflicts:

1. Never modify files outside your worktree directory.
2. Never write to shared infrastructure (the main database, shared Redis).
   Use the schema or Redis DB assigned to your worktree via `.env.worktree`.
3. Do not push directly to `main` or any branch another agent is working on.
4. If you need to pull in upstream changes, run `git rebase origin/main`
   inside your worktree — not a merge.
5. Before opening a PR, check `grove status --json` to confirm no other
   agent is working on an overlapping area.

## Starting your stack

If your environment is not already running:

    grove start <your-branch-name>

This will start the Docker Compose stack for your worktree and return the
environment URLs.

## Files that are yours (gitignored, per-worktree)

- `.env.worktree` — your port assignments and Compose project name
- `.worktree-manifest.json` — your status, written by you

Do not commit either of these files.
```

You can adjust the specific commands, tone, and rules for your project. The important parts are: how to discover the environment, how to report status, and the parallel agent rules for avoiding conflicts.

---

## Basic usage

### TUI mode

Run `grove` with no arguments to open the interactive interface:

```bash
grove
```

**Navigation:**

| Key       | Action                                                 |
| --------- | ------------------------------------------------------ |
| `↑` / `k` | Move up in worktree list                               |
| `↓` / `j` | Move down                                              |
| `s`       | Sync — refresh all manifests, git status, docker state |
| `o`       | Open selected worktree in editor                       |
| `u`       | Docker up (selected worktree)                          |
| `d`       | Docker down (selected worktree)                        |
| `x`       | Expand / collapse change footprint                     |
| `/`       | Filter worktrees by branch name or agent state         |
| `Esc`     | Clear filter                                           |
| `?`       | Toggle keyboard shortcut help                          |
| `q`       | Quit                                                   |

### Command mode

All commands work without opening the TUI, suitable for scripting and agent use.

```bash
# Show all worktrees with agent and docker state
grove status

# Machine-readable status for a specific environment (for agents/scripts)
grove status feat/auth-refresh --json

# Check out an existing remote branch as a worktree, start its environment
grove start feat/my-feature

# Create a worktree from a PR number (resolves branch via gh)
grove start 1234

# Create a new branch off main
grove start feat/my-feature --new

# Create a new branch off a specific base branch
grove start feat/my-feature --new --base hotfix-from-main-setup

# Attach to an existing worktree and (re)start its environment
grove start feat/my-feature

# Open a worktree in your editor
grove open feat/my-feature

# Refresh all manifests and git status
grove sync

# Stop the environment for a worktree
grove stop feat/my-feature

# Remove a worktree (brings down docker stack first, prompts for confirmation)
grove delete feat/my-feature
grove delete feat/my-feature --delete-branch   # also deletes the git branch
grove delete feat/my-feature --yes             # skip confirmation

# Clean up stale worktree metadata
grove prune

# Shared infrastructure stack
grove shared up
grove shared down
grove shared status

# Docker lifecycle for a specific worktree (also available as u/d in TUI)
grove docker up feat/my-feature
grove docker down feat/my-feature
grove docker teardown feat/my-feature   # destroys volumes — prompts for confirmation

# Show resolved configuration (worktree root, editor, grove config)
grove info
```

---

## Environment provider detection

When you run `grove start` or `grove status --json`, Grove resolves the environment provider automatically. Detection order:

1. **`.grove/config.json`** — explicit configuration wins
2. **`docker-compose.yml` + `.env.worktree`** — inferred as docker-compose
3. **`package.json`** with a `dev` or `start` script — inferred as node-scripts (auto-detects port for Vite, Next.js, etc.)
4. **Fallback** — reports environment as unknown, takes no destructive action

---

## Example: parallel agent workflow

Suppose you have a feature in progress and want to start a second agent to work on a separate fix concurrently.

**1. Set up the first environment**

```bash
grove start feat/auth-refresh
```

```
Creating worktree at ~/repos/my-app-worktrees/feat-auth-refresh…
Resolving environment provider…
  → provider: docker-compose
Starting environment…
  web: http://localhost:8081
  source: grove
✓ Ready: feat/auth-refresh
```

**2. Start a second environment in parallel**

```bash
grove start fix/helm-chart
```

```
Creating worktree at ~/repos/my-app-worktrees/fix-helm-chart…
Resolving environment provider…
  → provider: docker-compose
Starting environment…
  web: http://localhost:8082
  source: grove
✓ Ready: fix/helm-chart
```

Each worktree has its own `.env.worktree` with different ports and a unique Compose project name — the stacks run in parallel without interfering.

**3. Monitor both in the TUI**

```bash
grove
```

As each agent writes to `.worktree-manifest.json`, the TUI reflects their state in real time on `s` (sync).

**4. Check environment from inside an agent session**

An agent running in a worktree can query its own environment:

```bash
grove status feat/auth-refresh --json
```

```json
{
  "ok": true,
  "web": "http://localhost:8081",
  "api": null,
  "source": "grove",
  "mode": "docker-compose",
  "agent": "running"
}
```

**5. Tear down when done**

```bash
grove stop feat/auth-refresh
grove docker teardown feat/auth-refresh   # if you want to destroy volumes
```

---

## Development

### Running tests

Grove uses [Vitest](https://vitest.dev/) with React support for the Ink TUI components.

```bash
# Run tests in watch mode
npm test

# Run tests once (CI mode)
npm run test:run

# Run with coverage report
npm run coverage
```

Coverage output lands in `coverage/` as HTML and text. The thresholds are 80% lines/functions and 70% branches.

**Test layout:** each source file has a co-located test file (e.g. `src/tui/App.tsx` → `src/tui/App.test.tsx`). TUI component tests use a custom `render-for-test` helper (in `src/tui/`) instead of ink-testing-library directly — this is needed for ink v4 compatibility (see the file header for details).

---

## Project layout

```
grove-wt/
├── src/
│   ├── index.ts              # CLI entry point — all commands
│   ├── types.ts              # Worktree, AgentManifest, GroveEnvironment, etc.
│   ├── commands/
│   │   └── status.ts         # Table output for `grove status`
│   ├── data/
│   │   ├── worktrees.ts      # git worktree parsing, manifest/docker reading
│   │   └── groveConfig.ts    # .grove/config.json loader
│   ├── providers/
│   │   ├── index.ts          # Re-exports
│   │   ├── types.ts          # GroveProvider interface
│   │   ├── docker-compose.ts # DockerComposeProvider
│   │   ├── node-scripts.ts   # NodeScriptsProvider
│   │   ├── shared.ts         # Shared infrastructure stack management
│   │   └── discover.ts       # Provider detection/inference engine
│   └── tui/
│       ├── App.tsx           # Root TUI component, keybinds, layout
│       ├── WorktreeList.tsx  # Left panel — navigable worktree list
│       ├── DetailPanel.tsx   # Right panel — agent, docker, change footprint
│       ├── ChangeFootprint.tsx
│       ├── KeybindBar.tsx
│       ├── FilterBar.tsx
│       ├── editor.ts         # Editor detection and launch
│       └── useTerminalSize.ts
```

---

## Settings

Grove global settings are stored in `~/.grove/config.json`. Configure with:

```bash
grove config set <key> <value>
```

| Key             | Default                                | Description                                     |
| --------------- | -------------------------------------- | ----------------------------------------------- |
| `worktreeRoot`  | `<repo-parent>/<repo-name>-worktrees/` | Where new worktrees are placed                  |
| `aiProvider`    | `codex`                                | `codex` or `claude`                             |
| `theme`         | `dark`                                 | `dark` or `light`                               |
| `notifications` | `false`                                | OS-level notifications when agent state changes |
