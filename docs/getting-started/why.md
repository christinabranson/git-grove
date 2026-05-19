# Why GitGrove?

## The problem: branch switching is painful

Imagine you're deep in a feature branch. You've got a dev server running, a couple of files open, some half-finished changes. Then a bug comes in. Urgent.

```bash
# Your current situation
git checkout feature/login
# ... you've been working here for two hours

# The bug hits. You have to switch.
git stash           # hope you remember what this was for
git checkout main
git checkout -b hotfix/payment-crash
# ... fix the bug ...
git checkout feature/login
git stash pop       # hope nothing conflicts
```

Now imagine doing this five times a day. Stashes pile up. Running processes die. Your `node_modules` gets into weird states when packages differ between branches. Your environment variables are wrong for the new context. You lose 10 minutes every time you switch.

This is the problem GitGrove solves.

## What is a Git worktree?

Most developers don't know that Git has a built-in feature for this: **worktrees**.

A worktree is a separate directory on disk that's linked to the same Git repository — but checked out at a different branch. Your branches coexist simultaneously as separate folders:

```
Without worktrees                  With worktrees
─────────────────                  ──────────────────────────────────
~/repos/my-app/         →          ~/repos/my-app/
  (one branch at a time)             (main branch)

  need a hotfix?                   ~/repos/my-app-worktrees/
  → stash, checkout, stash pop       feature-login/   ← your feature
                                     hotfix-payment/  ← the urgent fix
                                     review-pr-847/   ← PR you're reviewing
```

Each directory is a real checkout of the branch. Each has its own working files, its own running servers, its own editor window. **You don't switch — you just open a different folder.**

Worktrees are built into Git itself (`git worktree add`). GitGrove makes them practical for day-to-day development.

## What GitGrove adds

Raw `git worktree` commands work, but they're rough around the edges:

- No port isolation — two dev servers will conflict on port 3000
- No visibility — you have to remember which folder is which branch
- No lifecycle management — start/stop/delete is manual
- No AI agent coordination — agents have no way to report their status

Grove handles all of this:

| Without Grove                                      | With Grove                                                   |
| -------------------------------------------------- | ------------------------------------------------------------ |
| `git worktree add ../my-app-feat-login feat/login` | `grove start feat/login`                                     |
| Manually assign different ports                    | Automatic port allocation per branch                         |
| `ls ../my-app-worktrees/` to see branches          | TUI shows all branches, environments, and agent status       |
| `git worktree remove ../my-app-feat-login`         | `grove delete feat/login` (also stops Docker)                |
| Hope agents don't step on each other               | Agents get isolated environments, report status via manifest |

## "Why not just use branches?"

Branches are for tracking history. Worktrees are for parallel work.

When you switch branches, Git replaces your working directory. You lose:

- Your running dev server (killed)
- Your editor's open tabs (pointing at wrong files)
- Your terminal's working directory context
- Any environment-specific state

With worktrees, **nothing is interrupted**. The hotfix folder and the feature folder are just two different directories. You `cd` between them the same way you'd switch terminal tabs.

## "Why not just clone the repo twice?"

You can, but worktrees share the same `.git` directory. That means:

- **No disk duplication of Git objects** — history, commits, and refs are shared
- **Changes are immediately visible across worktrees** — commit on one branch, the ref is visible from the other worktree without fetching
- **Branch operations work across all worktrees** — `git branch`, `git log`, `git push` all see everything

Two clones are completely separate. A worktree pair is one repo, two working directories.

## "Is this advanced?"

Worktrees are a built-in Git feature. They're not advanced — they're just not well-publicized.

The most common concern is: _"Will I corrupt Git?"_ The answer is no. A worktree is fundamentally a checked-out directory. The worst thing you can do is delete the folder manually (fix: run `grove prune` afterward). Grove handles the rest safely.

If you can use branches, you can use worktrees.

## When GitGrove might be overkill

GitGrove shines when you're juggling multiple branches, PRs, or AI agents. It's less useful when:

- You're making a small, focused change that doesn't require context-switching
- You're new to Git and still building your mental model of branches
- Your project is tiny and you work alone on one thing at a time

That's fine — come back to it when the stash pain shows up.

## Next steps

- [Quick Start](/getting-started/quickstart) — get running in 5 minutes
- [Core Concepts](/getting-started/concepts) — worktrees, providers, manifests explained
- [Common Workflows](/guides/workflows) — real scenarios: hotfixes, parallel PRs, AI agents
