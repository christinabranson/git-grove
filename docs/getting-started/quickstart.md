# Quick Start

This guide gets you from zero to a working Grove setup in under 5 minutes.

## 1. Install Grove

```bash
npm install -g @gitgrove/cli@alpha
```

Verify it worked:

```bash
grove --version
```

> Having trouble? See the [Troubleshooting](/getting-started/installation#troubleshooting) section.

## 2. Try it in any repo — no setup required

Grove works in any git repository immediately, with no configuration:

```bash
cd your-project
grove
```

The TUI opens and shows all your worktrees. Use `↑`/`↓` to navigate, `q` to quit.

That's it for basic use. If you just want to manage worktrees without environment isolation, you're done.

## 3. Create your first worktree

```bash
# Create a new branch and check it out in a worktree
grove start feat/my-feature --new

# Or check out an existing remote branch
grove start feat/my-feature

# Or check out a PR by number (requires gh)
grove start 1234
```

Grove creates a new directory alongside your repo:

```
~/repos/my-app/                        ← your main repo (untouched)
~/repos/my-app-worktrees/
  feat-my-feature/                     ← new worktree, checked out to feat/my-feature
```

Your main repo keeps running. Nothing is interrupted. You can now open the new folder in a second editor window and work on both branches simultaneously.

## 4. Open in your editor

```bash
grove open feat/my-feature
```

Grove opens the worktree directory in VS Code, Cursor, or whatever editor is configured. You now have two independent editor windows — one per branch.

## 5. See all your worktrees

```bash
grove status
```

Or open the TUI (`grove`) and navigate with:

- `o` — open the selected worktree in your editor
- `s` — sync (refresh git status, agent manifests, Docker state)
- `n` — new worktree
- `/` — filter by branch name
- `?` — show all keyboard shortcuts

## 6. Clean up when done

```bash
grove delete feat/my-feature
```

Grove confirms before deleting. To skip the prompt and also delete the local branch:

```bash
grove delete feat/my-feature --delete-branch --yes
```

---

## Optional: environment isolation with Docker

If your project uses Docker Compose or a Node dev server, Grove can automatically assign each worktree unique ports so environments never conflict.

```bash
grove setup
```

Grove inspects your project and proposes a `.grove/config.json`. It detects Docker Compose files, Vite configs, and `package.json` scripts automatically. Review and confirm.

Then `grove start` does more:

```
Creating worktree at ~/repos/my-app-worktrees/feat-my-feature…
Generating .env.worktree from grove config…
  COMPOSE_PROJECT_NAME=my-app-feat-my-feature
  WEB_PORT=8081
  DB_PORT=5433
Starting shared stack (my-app-shared)…
✓ Shared stack running
→ provider: docker-compose
Starting environment…
  web: http://localhost:8081
✓ Ready: feat/my-feature
```

Each worktree gets its own ports — no manual tracking, no conflicts.

---

## What's next?

- [Why GitGrove?](/getting-started/why) — understand the problem it solves
- [Core Concepts](/getting-started/concepts) — worktrees, providers, manifests, and the glossary
- [Common Workflows](/guides/workflows) — hotfixes, parallel PRs, AI agents
- [AI Workflows](/guides/ai-workflows) — running parallel AI agents in isolation
- [Docker Guide](/guides/docker) — shared infrastructure and env contracts
