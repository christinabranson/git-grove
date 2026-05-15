# Reviewing Pull Requests

Grove makes PR review faster by giving you a fully isolated environment for the branch — separate from your current work, with its own stack and ports.

## The workflow

### 1. Check out the PR

```bash
grove start 847
```

Grove uses `gh pr view 847 --json headRefName` to resolve the branch name, fetches it, and creates a worktree:

```
Resolving PR #847…
  → branch: feat/auth-refresh
Creating worktree at ~/repos/my-app-worktrees/feat-auth-refresh…
Generating .env.worktree from grove config…
  COMPOSE_PROJECT_NAME=my-app-feat-auth-refresh
  WEB_PORT=8082
  DB_PORT=5434
Resolving environment provider…
  → provider: docker-compose
Starting environment…
  web: http://localhost:8082
✓ Ready: feat/auth-refresh
```

Your current worktree and its stack keep running untouched.

### 2. Open in your editor

```bash
grove open feat/auth-refresh
```

Grove opens the worktree path in your editor — VS Code, Cursor, Windsurf, or whatever is configured.

### 3. Browse the running app

The PR's environment is available at the URL from `grove start`:

```bash
grove status feat/auth-refresh --json
```

```json
{
  "ok": true,
  "web": "http://localhost:8082",
  "api": null,
  "source": "grove",
  "mode": "docker-compose"
}
```

Visit `http://localhost:8082` to interact with the PR's version of the app. It has its own database schema — no data from your main environment leaks in.

### 4. Run tests

```bash
# From inside the PR worktree
cd ~/repos/my-app-worktrees/feat-auth-refresh
npm test
```

Or use your editor's integrated test runner — it's already opened in the right directory.

### 5. Clean up

```bash
grove delete feat/auth-refresh
```

Grove prompts for confirmation, brings down the Docker stack, and removes the worktree directory.

To also delete the local branch:

```bash
grove delete feat/auth-refresh --delete-branch --yes
```

## Reviewing multiple PRs

You can have several PR worktrees running simultaneously — each gets unique ports, so there's no conflict:

```bash
grove start 847   # feat/auth-refresh → :8081
grove start 891   # fix/validation → :8082
grove start 923   # feat/dashboard → :8083

grove status      # see all three at once
```

Switch between them with `grove open <branch>` or by navigating the TUI.

## Requirements

PR checkout via `grove start <PR#>` requires the `gh` CLI:

```bash
gh --version   # must be installed and authenticated
```

If `gh` is not available, check out the branch manually:

```bash
git fetch origin feat/auth-refresh
grove start feat/auth-refresh   # attaches to the existing fetch
```
