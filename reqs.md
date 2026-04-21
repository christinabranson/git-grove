# Grove — Product Requirements

> *"See the forest. Manage the trees."*

## North Star

**Grove is a terminal-based mission control for parallel agentic workflows.**

Inspired by `lazygit` and `lazydocker` — keyboard-driven, terminal-native, calls underlying tools rather than reimplementing them. You keep it open in a split terminal while agents are running across multiple worktrees.

The core problem it solves: git worktrees are powerful but invisible. When you have 3 agents running on 3 branches, there's no good answer to "what is each one doing right now?" Grove is that answer — without leaving the terminal, without installing an Electron app, without fighting IT policies on a work machine.

**Primary use case:** Agentic workflow management — spinning up worktrees, launching agents, monitoring their progress, intervening when needed, and keeping track of the full picture across all of them.

**Secondary use case:** GitHub enrichment — surfacing PR status and CI results as contextual info, so you know which branches need attention without leaving Grove.

PR review features (diff view, inline comments, AI review chat) are explicitly **deferred**.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Language | TypeScript |
| TUI framework | Ink (React for the terminal) |
| CLI parsing | Commander.js |
| Shell calls | execa |
| Pretty output | chalk, cli-table3 |
| Distribution | npm global package (`npm install -g grove-wt`) |

Installs as a global npm package. Works on any machine with Node. No Electron, no browser, no build step for the end user.

---

## Interface Model

Two modes, same binary:

**TUI mode** — run `grove` with no arguments. Opens the interactive terminal UI. Keyboard-driven navigation between panes. Think lazygit/lazydocker.

**Command mode** — run `grove <command>` for scripting, quick actions, or use from another tool. Outputs clean, readable results. Think `gh` CLI.

---

## TUI Layout

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
[ l ] launch agent  [ o ] VS Code  [ u ] docker up  [ d ] down  [ s ] sync  [ ? ] help
```

**Left column (top):** Worktree list. Arrow keys to navigate. Selected worktree drives both panels on the right.

**Left column (bottom):** Change footprint for the selected worktree — directories and file counts at a glance.

**Right panel:** Agent status, docker status, port links, and expanded change footprint for the selected worktree.

**Keybind bar:** Context-sensitive — only shows actions valid for the currently selected worktree.

---

## Core Principles

- **Terminal-native.** Runs anywhere Node runs. No GUI dependencies.
- **Keyboard-driven.** Every action has a keybind. Mouse optional.
- **Calls the tools, doesn't replace them.** git, gh, docker, codex — Grove orchestrates them, never reimplements them.
- **Manual sync, always.** No background polling. `s` to sync, or run `grove sync`.
- **Explicit actions only.** Nothing posts to GitHub, touches Docker volumes, or mutates state without a deliberate keypress and confirmation where destructive.
- **Portable.** Works on a personal machine and a locked-down work machine equally. Just needs Node + the underlying CLI tools already installed.

---

## Worktree List

The left panel in TUI mode. A navigable list of all worktrees in the current repo. Arrow keys to move, Enter or right arrow to focus the detail panel.

Each row shows:
```
▶ feat/auth-refresh     ● running   PR #847   +3
  feat/pipeline-cache   ◐ waiting   PR #831   clean
  fix/helm-chart                              +1
  main                                        clean
```

**Columns:** branch name · agent state · PR association · change count

### Agent state indicators

| Symbol | State |
|---|---|
| `●` green | running |
| `◐` amber | waiting |
| `■` gray | done |
| `✕` red | errored |
| _(none)_ | no agent |

### GitHub indicators

Shown when **Sync GitHub** has been run. Not shown if GitHub hasn't been synced yet — Grove degrades gracefully without it.

- `PR #847` — worktree has a linked open PR
- `yours` — you are the author of the linked PR
- `✓2` — your PR has 2 approvals
- `review requested` — GitHub has formally requested your review
- `you commented` — you've commented but aren't a formal reviewer (lighter weight)

### Filtering

`/` to open a filter prompt. Filter by: branch name, agent state, PR association. `Esc` to clear.

---

## Command Mode

Run `grove <command>` for quick actions without opening the TUI.

```bash
grove status                    # table of all worktrees + agent/docker state
grove start <branch|PR#>        # create a new worktree
grove open [branch]             # open worktree in VS Code (defaults to current)
grove sync                      # git fetch + refresh manifests
grove agent launch [branch]     # start a codex session
grove agent status              # what's each agent doing
grove agent kill [branch]       # stop a codex session
grove docker up [branch]        # docker compose up for a worktree
grove docker down [branch]      # docker compose down
grove docker teardown [branch]  # docker compose down -v (prompts for confirmation)
grove pr open <number>          # create worktree from PR number
```

All commands default to the current worktree (detected from `git worktree list`) if no branch is specified.

---


---

## Agent Activity Feed

The centerpiece of Grove. A unified, real-time view of all active Codex sessions across every worktree — mission control for your agents.

### Layout

A dedicated **Agents** view (accessible from the sidebar) shows all worktrees that have or recently had an active agent session. Worktrees with no agent history are hidden from this view but visible in All Worktrees.

Each entry in the feed shows:
- Worktree name and branch
- Agent status indicator: **running** (green pulse), **waiting** (amber pulse), **done** (gray), **errored** (red)
- Current activity string from the manifest (e.g. *"editing AuthService.ts"*, *"running test suite"*)
- Time elapsed since session start
- Quick actions: open terminal, open in VS Code, open local port

### Status indicators

| State | Meaning | Visual |
|---|---|---|
| `running` | Agent is actively executing | Green pulsing dot |
| `waiting` | Agent is paused — tests running, awaiting input, etc. | Amber pulsing dot |
| `done` | Session completed successfully | Gray static dot |
| `errored` | Session exited with non-zero code | Red static dot |
| `idle` | No session; worktree exists but agent not running | No dot |

### Session log

Each worktree card in the feed has an expandable session history — a chronological list of past Codex sessions showing: start time, initial prompt (if provided), exit code, and duration. Stored locally in `~/.grove/sessions/`. Useful for reconstructing what an agent did on a branch when you come back to it later.

### Notifications

When an agent transitions to `waiting` or `errored`, Grove surfaces a subtle in-app notification so you don't have to watch the feed constantly. No OS-level notifications by default (opt-in in Settings).

---

## Agent Manifest System

The `.worktree-manifest.json` file is the contract between agents and Grove. Agents write it; Grove reads it. This keeps the coupling lightweight — any agent (Codex, a shell script, a custom tool) can participate by writing a simple JSON file.

### Schema

```json
{
  "port": 3001,
  "agentName": "codex",
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

### Fields

| Field | Type | Description |
|---|---|---|
| `port` | number | Local port for the agent's dev server or environment |
| `agentName` | string | Which agent is running (`codex`, `claude`, custom) |
| `agentStatus` | string | `idle` \| `running` \| `waiting` \| `done` |
| `agentActivity` | string | Human-readable current activity, updated as the agent works |
| `startedAt` | ISO string | When the current session started |
| `testResults` | object | Optional — last known test run results |
| `notes` | string | Optional — freeform notes, editable from Grove UI |

### Who writes it

- **Grove's Codex launcher** (`electron/ipc/codex.ts`) writes and maintains this file automatically when launching and managing a Codex session via Grove
- **External agents / scripts** — any process can write this file directly. Grove just reads whatever is there on sync.
- **The user** — the `notes` field is editable directly from the worktree card in Grove without needing to open the file

### Test results display

If `testResults` is present, the worktree card shows a compact test status badge:
- `✓ 42 passed` in green if all passing
- `✗ 2 failed` in red if any failing
- Tapping the badge shows pass/fail/skip counts and the time of last run

---

## Worktree Creation

### TUI mode
Press `n` from the worktree list. Grove prompts for a branch name or PR number inline.

### Command mode
```bash
grove start feat/my-feature     # from existing remote branch
grove start 1234                 # from PR number — resolves branch via gh
grove start feat/new-thing --new # create new branch off main
```

### Input resolution

**Branch name** — Grove runs `git fetch origin <branch>` then `git worktree add`.

**PR number** — Grove resolves the branch via `gh pr view`, fetches it, creates the worktree with the PR already associated.

**New branch** — prompts for a base branch (defaults to `main`).

### After creation

Grove asks: *"Launch a Codex session? (y/N)"* and optionally accepts an initial prompt. Skippable — worktrees don't require an agent.

New worktrees are placed at `<repo-parent>/<repo-name>-worktrees/<branch-name>` by default. Configurable via `grove config set worktreeRoot`.

---

## Worktree Sync Controls

All manual. Available as keypresses in TUI mode or explicit commands.

| TUI key | Command | Action |
|---|---|---|
| `s` | `grove sync` | Refresh all manifests + git status |
| `f` | `grove sync --fetch` | `git fetch origin` for selected worktree |
| `r` | `grove sync --rebase` | `git rebase origin/main` — warns if agent is running |
| `S` | `grove sync --all` | Fetch all worktrees, surface conflicts |

Rebase is disabled while an agent session is active in that worktree.

---

## Change Footprint

A compact, at-a-glance view of what files a worktree has touched. Answers "where has work happened here?" without loading a full diff. Available on any worktree card that has uncommitted or unpushed changes.

### Collapsed state (default)

Shown directly on the worktree card as a file tree grouped by directory:

```
src/auth/        AuthService.ts  TokenRefresh.ts
src/middleware/  index.ts
tests/           auth.test.ts
```

No line counts, no diff content. Just the changed path structure. Makes it immediately obvious whether an agent has stayed in the right neighborhood or wandered somewhere unexpected.

### Expanded state (on demand)

Click the file tree to expand and show `+N -N` counts per file:

```
src/auth/
  AuthService.ts       +42 -11
  TokenRefresh.ts      +28 -0
src/middleware/
  index.ts             +3 -1
tests/
  auth.test.ts         +55 -4
```

Still no actual diff content — just the file list with addition/deletion counts. Enough to sense the weight of the changes without loading anything heavy.

### Data source

Populated from `git diff --stat` and `git status --short` in the worktree directory. Refreshed when the user clicks **Sync worktrees**. Shown for both staged and unstaged changes combined.

---



The following features are explicitly out of scope for the initial build. They may be revisited later.

### PR Diff View
A full GitHub-style inline diff viewer with syntax highlighting and line-by-line navigation. The Change Footprint feature (file tree + `+N -N` counts) covers the agent management use case. A full diff viewer may come later alongside PR review features.

### Inline PR Comments & GitHub Sync
Drafting review comments in Grove and syncing them to GitHub. Deferred with the diff view.

### Custom Review Instructions
Per-repo and global AI review prompt customization. Relevant when PR review mode is built; deferred until then.

---

## Docker Integration

Grove is aware of the Docker Compose stack associated with each worktree but does not manage Docker infrastructure. The shared infra layer (Postgres, Redis, ClickHouse, Datadog) is started manually by the developer once. Grove manages the per-worktree application stacks only.

### Mental model

Each worktree maps to exactly one Compose project:

```
worktree: ~/repos/platform-worktrees/feat-auth-refresh
  compose project: -p feat-auth-refresh
  env file:        ~/repos/platform-worktrees/feat-auth-refresh/.env.worktree
  web port:        8081  (read from .env.worktree)
  localstack port: 4567  (read from .env.worktree)
```

Grove reads the `.env.worktree` file at the worktree root to discover port bindings and the project name. It never writes to this file.

### `.env.worktree` convention

Each worktree contains a `.env.worktree` file (gitignored) that configures its isolated stack. Grove looks for these specific keys:

```bash
COMPOSE_PROJECT_NAME=feat-auth-refresh   # used as -p value
WEB_PORT=8081                            # primary app URL
LOCALSTACK_PORT=4567                     # localstack URL if present
REDIS_DB=1                               # informational, shown in card
DB_SCHEMA=platform_feat_auth_refresh     # informational, shown in card
```

Any key not present is simply not shown in the UI. Grove degrades gracefully — a worktree without a `.env.worktree` just has no Docker section on its card.

Grove also checks for a `docker-compose.yml` or `compose.yaml` at the repo root to confirm Docker support exists before showing any Docker UI on the card.

### Lifecycle controls

Available on any worktree card that has a valid `.env.worktree`. All actions are explicit — nothing runs automatically.

| Action | Command Grove runs | When available |
|---|---|---|
| **Start stack** | `docker compose -p <project> --env-file .env.worktree up -d --build` | Stack is not running |
| **Stop stack** | `docker compose -p <project> --env-file .env.worktree down` | Stack is running |
| **Teardown (with volumes)** | `docker compose -p <project> --env-file .env.worktree down -v` | Stack is running — requires confirmation dialog |
| **View logs** | Opens a log stream in the card's terminal panel | Stack is running |

"Teardown with volumes" (`down -v`) requires an explicit confirmation dialog before executing — it is destructive and should never be a one-click action.

### Stack status detection

Grove determines stack state by running `docker compose -p <project> ps --format json` and parsing the result. Status is refreshed only when the user clicks **Sync worktrees**.

Possible states shown on the card:

| State | Meaning |
|---|---|
| `running` | All expected containers are up |
| `partial` | Some containers are up, some are not — likely a startup failure |
| `stopped` | Stack exists but all containers are down |
| `not started` | No containers found for this project name |

### Port links

When a stack is running, port links appear as clickable badges on the worktree card:

- **`:8081`** → opens `http://localhost:8081` in the system browser (the app)
- **`:4567`** → opens `http://localhost:4567` in the system browser (localstack)

Port values come from `.env.worktree`. If a port key is absent, that badge is not shown.

### Docker section in TUI detail panel

When a worktree has Docker integration, the right panel shows a Docker section:

```
 docker  ● running
 :8081 (web)   :4567 (localstack)
 schema: platform_feat_auth   redis db: 1

 [ u ] up   [ d ] down   [ D ] teardown   [ L ] logs
```

### Shared infrastructure

Grove does not start, stop, or monitor the shared infra layer (Postgres, Redis, ClickHouse, Datadog). That remains a manual developer responsibility. Grove may optionally surface a warning if a stack fails to start and the likely cause is that shared infra isn't running — detectable by inspecting the `docker compose` error output — but takes no action.

---

## Settings

Stored in `~/.grove/config.json`. Editable via `grove config set <key> <value>` or directly in the file.

- **GitHub identity** — Grove reads your GitHub username from `gh api user`. No additional auth; piggybacks on existing `gh` auth.
- **AI provider** — `codex` (default) or `claude`. API key stored in `~/.grove/config.json`.
- **Default worktree root** — override the default sibling-directory convention. Default: `<repo-parent>/<repo-name>-worktrees/`.
- **Codex flags** — default flags passed on launch. Default: `--full-auto`.
- **Agent notifications** — opt-in OS-level notifications (`terminal-notifier` on Mac) when an agent transitions to `waiting` or `errored`.
- **Theme** — `dark` (default) or `light`. Controls chalk color choices in TUI and command output.