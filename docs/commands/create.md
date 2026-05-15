# grove start

Create or attach to a worktree and start its environment.

```bash
grove start <branch|PR#> [options]
```

`grove start` is the main command for setting up an isolated development environment. It handles the full lifecycle: creating the worktree, generating the environment file, starting shared infrastructure, and booting the environment.

## What it does

1. Resolves the target (branch name or PR number → branch)
2. Creates the worktree at the configured root, or attaches to an existing one
3. Generates `.env.worktree` from naming templates in `.grove/config.json`
4. Starts the shared infrastructure stack if configured and not already running
5. Discovers the environment provider and starts it
6. Prints the environment URLs (or JSON if `--json`)

## Usage

```bash
# Check out an existing remote branch
grove start feat/my-feature

# Create a new branch off the default branch
grove start feat/my-feature --new

# Create a new branch off a specific base
grove start feat/my-feature --new --base develop

# Resolve a PR number to its branch, then start
grove start 1234

# Regenerate .env.worktree before starting
grove start feat/my-feature --refresh-env

# Machine-readable output for scripting and agents
grove start feat/my-feature --json
```

## Flags

| Flag              | Effect                                                       |
| ----------------- | ------------------------------------------------------------ |
| `--new`           | Create a new branch (uses `--base` or repo default branch)   |
| `--base <branch>` | Base branch for `--new` (default: repo default branch)       |
| `--refresh-env`   | Regenerate `.env.worktree` from grove config before starting |
| `--json`          | Output machine-readable JSON                                 |

## JSON output

With `--json`, Grove outputs the full `GroveEnvironment` object:

```json
{
  "name": "feat/my-feature",
  "worktreePath": "/home/user/repos/my-app-worktrees/feat-my-feature",
  "web": {
    "url": "http://localhost:8081",
    "port": 8081
  },
  "api": null,
  "db": {
    "mode": "shared"
  },
  "metadata": {
    "source": "grove",
    "provider": "docker-compose"
  }
}
```

`web` and `api` are `null` when the provider doesn't expose that endpoint. `db.mode` is one of `"shared"`, `"local"`, or `"unknown"`.

For a simpler status-only query from agents, prefer `grove status <branch> --json` which returns a flatter shape (`ok`, `web`, `api`, `source`, `mode`).

## PR checkout

When the target is a number, Grove uses `gh` to resolve the branch:

```bash
grove start 847
```

```
Resolving PR #847…
  → branch: feat/auth-refresh
Creating worktree at ~/repos/my-app-worktrees/feat-auth-refresh…
```

Requires the `gh` CLI to be installed and authenticated.

## Worktree location

Worktrees are placed at `<repo-parent>/<repo-name>-worktrees/<branch-safe>` by default. Override with:

```json
{ "worktrees": { "root": "/your/path" } }
```

Or set `GROVE_WORKTREE_ROOT=/your/path` as an environment variable.

## .env.worktree generation

If `.grove/config.json` has a `naming` section, Grove generates `.env.worktree` automatically on `grove start`. If the file already exists, Grove skips generation unless `--refresh-env` is passed.

Generated file example:

```bash
COMPOSE_PROJECT_NAME=my-app-feat-my-feature
WEB_PORT=8081
API_PORT=8082
DB_PORT=5433
DB_SCHEMA=my_app_feat_my_feature
SHARED_PROJECT_NAME=my-app-shared
```
