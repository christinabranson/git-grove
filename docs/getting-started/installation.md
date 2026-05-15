# Installation

Grove is a global Node.js CLI. It requires **Node 18+** and is installed from source.

## Prerequisites

| Tool     | Required for                                   |
| -------- | ---------------------------------------------- |
| `git`    | All worktree operations                        |
| `gh`     | PR checkout (`grove start <PR#>`), GitHub sync |
| `docker` | Docker Compose environment management          |

`gh` and `docker` are optional — Grove degrades gracefully if they're missing. Only the features that depend on them won't activate.

Check your Node version:

```bash
node --version   # must be 18+
```

## Install

```bash
git clone https://github.com/christinabranson/git-grove.git
cd git-grove
npm install
npm run build
npm link
```

`npm link` makes the `grove` binary available globally. Verify it worked:

```bash
grove --version
```

## Global gitignore

Grove creates per-worktree files that should never be committed. Add them to your **global** gitignore so you don't have to touch each repo's `.gitignore`:

```bash
# See where your global gitignore lives
git config --global core.excludesfile

# Add the grove entries
echo '.env.worktree' >> ~/.gitignore_global
echo '.worktree-manifest.json' >> ~/.gitignore_global
```

If you haven't set one up yet:

```bash
echo '.env.worktree' >> ~/.gitignore_global
echo '.worktree-manifest.json' >> ~/.gitignore_global
git config --global core.excludesfile ~/.gitignore_global
```

| File                      | What it is                                             |
| ------------------------- | ------------------------------------------------------ |
| `.env.worktree`           | Port assignments and Compose project name (per branch) |
| `.worktree-manifest.json` | Agent status file written at runtime                   |

These are machine-local and per-session — committing them would break other developers' environments.

> **Note:** `.grove/config.json` is different — it describes how the project works and **should** be committed. Only the runtime state files above need to stay out of git.

## Editor detection

Grove auto-detects your editor for `grove open` — no config required. It checks in order:

1. `editor` field in `.grove/config.json`
2. `$VISUAL` environment variable
3. `$EDITOR` environment variable
4. Scans `PATH` for `code`, `cursor`, `windsurf`, `vim`, `nano`
5. On macOS: checks standard app bundle locations (so VS Code works even if `code` isn't in `PATH`)

## Next steps

- [Quick Start](/getting-started/quickstart) — get to a working setup in 5 minutes
- [Core Concepts](/getting-started/concepts) — understand worktrees, providers, and manifests
