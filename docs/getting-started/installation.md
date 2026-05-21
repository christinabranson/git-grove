# Installation

Grove is a global Node.js CLI. It requires **Node 18+** and is available on [npm](https://www.npmjs.com/package/@gitgrove/cli).

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
npm install -g @gitgrove/cli@alpha
```

Verify it worked:

```bash
grove --version
```

## Contributing / building from source

If you want to contribute or run from source:

```bash
git clone https://github.com/christinabranson/git-grove.git
cd git-grove
npm install
npm run build
npm link
```

`npm link` makes the `grove` binary available globally, pointing at your local build.

## Global gitignore

Grove creates per-worktree files that should never be committed. Add them to your **global** gitignore so you don't have to touch each repo's `.gitignore`:

```bash
# See where your global gitignore lives
git config --global core.excludesfile

# Add the grove entries
echo '.env.worktree' >> ~/.gitignore_global
echo '.grove' >> ~/.gitignore_global
```

If you haven't set one up yet:

```bash
echo '.env.worktree' >> ~/.gitignore_global
echo '.grove' >> ~/.gitignore_global
git config --global core.excludesfile ~/.gitignore_global
```

| File                          | What it is                                                 |
| ----------------------------- | ---------------------------------------------------------- |
| `.env.worktree`               | Port assignments and Compose project name (per branch)     |
| `.grove/active-worktree.json` | Base branch recorded when creating a worktree with `--new` |

These are machine-local and per-session — committing them would break other developers' environments.

> **Note:** Grove configuration is stored in `~/.grove/` on your machine, not in the repository. Each developer runs `grove setup` once to generate their own config.

## Editor detection

Grove auto-detects your editor for `grove open` — no config required. It checks in order:

1. `editor` field in Grove config (`grove config set editor <cmd>`)
2. `$VISUAL` environment variable
3. `$EDITOR` environment variable
4. Scans `PATH` for `code`, `cursor`, `windsurf`, `vim`, `nano`
5. On macOS: checks standard app bundle locations (so VS Code works even if `code` isn't in `PATH`)

## Next steps

- [Quick Start](/getting-started/quickstart) — get to a working setup in 5 minutes
- [Core Concepts](/getting-started/concepts) — understand worktrees, providers, and manifests

## Troubleshooting

### `grove: command not found`

`npm install -g` puts the binary in npm's global bin directory. If that directory isn't in your `PATH`:

```bash
# Find where npm puts global binaries
npm bin -g

# Add it to your PATH (add this to ~/.zshrc or ~/.bashrc)
export PATH="$(npm bin -g):$PATH"

# Then reload your shell
source ~/.zshrc   # or ~/.bashrc
```

### `git worktree: unknown command`

Your Git version is too old. Grove requires Git 2.5+, which introduced worktree support.

```bash
git --version   # check your version

# macOS: update via Homebrew
brew install git

# Ubuntu/Debian
sudo apt-get install git
```

After updating, open a new terminal and verify:

```bash
git --version        # should be 2.5 or higher
git worktree list    # should work without error
```

### `grove open` opens the wrong editor (or nothing)

Grove auto-detects your editor in priority order: Grove config → `$VISUAL` → `$EDITOR` → PATH scan → macOS app bundles.

To force a specific editor, set `$VISUAL` in your shell profile:

```bash
# ~/.zshrc or ~/.bashrc
export VISUAL="code"   # VS Code
export VISUAL="cursor" # Cursor
export VISUAL="vim"    # Vim
```

Or configure it explicitly via Grove:

```bash
grove config set editor code
```

### Permission errors during `npm install -g`

If you see `EACCES: permission denied`:

```bash
# Option 1: fix npm's global directory permissions (recommended)
# See: https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally

# Option 2: use a Node version manager (nvm/fnm) — avoids permission issues entirely
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 20
nvm use 20
```

### VS Code opens a file instead of a folder

`grove open` passes the worktree path to your editor. If VS Code opens a file picker instead of the folder, ensure the `code` CLI is installed:

1. Open VS Code
2. Open the Command Palette (`⌘⇧P` on macOS, `Ctrl⇧P` on Linux/Windows)
3. Run: `Shell Command: Install 'code' command in PATH`

Then `grove open` will open the worktree as a VS Code workspace.
