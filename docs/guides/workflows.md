# Common Workflows

Real scenarios where Grove earns its keep.

## Fixing a production bug without losing feature work

You're deep in `feat/login-redesign`. Your dev server is running. You have files open. A production bug comes in.

**Without Grove:** stash, checkout, fix, stash pop, untangle conflicts, restart server.

**With Grove:**

```bash
# In a new terminal — your feature branch is untouched
grove start hotfix/payment-crash --new

grove open hotfix/payment-crash   # opens in a new editor window
```

Fix the bug. Commit. Push. Done.

```bash
grove delete hotfix/payment-crash --delete-branch --yes
```

Your feature branch was never touched. Your dev server never stopped.

---

## Working on two PRs simultaneously

You need to finish `feat/auth` and also start `feat/dashboard`. Both need to be ready by end of day.

```bash
grove start feat/auth
grove start feat/dashboard --new
```

Two directories. Two editor windows. Two dev servers on different ports (if using `grove setup`). You work on whichever you need, switch by changing your active terminal and editor window.

```bash
grove status
# feat/auth      :8081  ● running
# feat/dashboard :8082  ● running
# main                  ○ idle
```

No stashing, no context loss, no port conflicts.

---

## Reviewing someone else's PR

A teammate's PR needs review. You want to actually run it, not just read the diff.

```bash
# Requires: gh CLI installed and authenticated
grove start 847
```

Grove resolves the PR number to a branch, creates a worktree, and starts the environment:

```
Resolving PR #847…
  → branch: feat/auth-refresh
Creating worktree at ~/repos/my-app-worktrees/feat-auth-refresh…
  WEB_PORT=8082
Starting environment…
  web: http://localhost:8082
✓ Ready: feat/auth-refresh
```

Open it in your editor, run the app, test the feature. Your own work is untouched.

```bash
grove open feat/auth-refresh    # open in editor
# visit http://localhost:8082   # test the running app
```

When done:

```bash
grove delete feat/auth-refresh
```

---

## Reviewing multiple PRs at once

During a sprint review, you need to check three PRs.

```bash
grove start 847   # feat/auth-refresh → :8081
grove start 891   # fix/validation    → :8082
grove start 923   # feat/dashboard    → :8083
```

Each runs independently. Navigate between them with `grove open <branch>` or use the TUI.

---

## Using an AI agent safely

You want to run Claude Code, Cursor, or Copilot Workspace on a big refactor — but don't want the agent touching your active feature branch.

```bash
grove start ai/refactor-auth --new
grove open ai/refactor-auth   # open this worktree in your AI-enabled editor
```

Point your AI agent at this worktree. Whatever it does — rewrites, file deletions, test runs — it's contained to this one directory. Your `main` and `feat/*` branches are untouched.

When you're happy with the result:

```bash
cd ~/repos/my-app-worktrees/ai-refactor-auth
git diff main   # review what the agent did
git push origin ai/refactor-auth
# open a PR, review normally
```

If the agent made a mess:

```bash
grove delete ai/refactor-auth --delete-branch --yes
# try again from a clean slate
```

See [AI Workflows](/guides/ai-workflows) for the full setup with agent manifests and status visibility.

---

## Running parallel AI agents

You want multiple AI agents working simultaneously — one on auth, one on the dashboard — with full isolation.

```bash
grove start ai/auth-work --new
grove start ai/dashboard-work --new
```

Open each in a separate AI-enabled editor window. The agents can't interfere with each other:

- Separate working directories
- Separate ports and Docker stacks (if using `grove setup`)
- Separate database schemas (if configured)

Monitor both from Grove's TUI:

```bash
grove
```

Press `s` to sync agent manifests. The right panel shows what each agent is doing:

```
┌─ worktrees ──────────────┐┌─ agent / docker ─────────────────────────┐
│ ▶ ai/auth-work           ││ ● running · refactoring AuthService.ts   │
│   ai/dashboard-work      ││   started 8m ago                         │
│   main                   ││                                           │
└──────────────────────────┘│ :8081  :4567   PR #847                   │
                            └──────────────────────────────────────────┘
```

---

## Experimenting without risk

You want to try a library, a refactor approach, or an architectural change — but you're not sure if it'll work.

```bash
grove start experiment/try-drizzle --new
```

Experiment freely. If it works, open a PR. If it doesn't:

```bash
grove delete experiment/try-drizzle --delete-branch --yes
```

Your main branch was never touched.

---

## Keeping up with a fast-moving main branch

Your feature branch is getting stale. Rebase without leaving your feature context:

```bash
# From inside your feature worktree
cd ~/repos/my-app-worktrees/feat-my-feature
git fetch origin
git rebase origin/main
```

The rebase happens inside the worktree. Your main worktree keeps running on main. No switching, no interruption.
