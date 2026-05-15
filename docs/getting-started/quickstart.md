# Quick Start

This guide gets you from zero to a working Grove setup in under 5 minutes.

## 1. Install Grove

```bash
git clone https://github.com/christinabranson/git-grove.git
cd git-grove && npm install && npm run build && npm link
```

## 2. Open any repo in Grove

Grove works in any git repository — no setup required for basic worktree visibility:

```bash
cd your-project
grove
```

The TUI opens and shows your worktrees. Use `↑`/`↓` to navigate, `q` to quit.

## 3. Initialize environment management (optional)

If you want Grove to manage Docker Compose stacks or Node dev servers, run setup:

```bash
grove setup
```

Grove inspects your project and proposes a `.grove/config.json`. It detects Docker Compose files, Vite configs, and `package.json` scripts automatically. Review and confirm.

## 4. Create your first worktree

```bash
# Check out an existing remote branch
grove start feat/my-feature

# Create a new branch off main
grove start feat/my-feature --new

# Check out a PR by number (requires gh)
grove start 1234
```

Grove creates the worktree, generates `.env.worktree` with unique ports (if configured), starts the shared stack, and boots the environment.

Expected output for a Docker project:

```
Creating worktree at ~/repos/my-app-worktrees/feat-my-feature…
Generating .env.worktree from grove config…
  aliases: none
  COMPOSE_PROJECT_NAME=my-app-feat-my-feature
  WEB_PORT=8081
  DB_PORT=5433
Starting shared stack (my-app-shared)…
✓ Shared stack running
Resolving environment provider…
  → provider: docker-compose
Starting environment…
  web: http://localhost:8081
  source: grove
✓ Ready: feat/my-feature
```

## 5. Use the TUI

```bash
grove
```

From the TUI you can:

- `o` — open the selected worktree in your editor
- `u` / `d` — Docker up / down
- `s` — sync (refresh git status, manifests, Docker state)
- `n` — new worktree
- `/` — filter by branch name or agent state
- `?` — show all keyboard shortcuts

## 6. CLI for scripting and agents

All operations are also available as commands:

```bash
grove status                          # table of all worktrees
grove status feat/my-feature --json   # machine-readable JSON
grove open feat/my-feature            # open in editor
grove stop feat/my-feature            # stop the environment
grove delete feat/my-feature          # remove the worktree
```

## What's next?

- [Core Concepts](/getting-started/concepts) — understand the mental model
- [AI Workflows](/guides/ai-workflows) — running parallel AI agents
- [Docker Guide](/guides/docker) — shared infrastructure and env contracts
