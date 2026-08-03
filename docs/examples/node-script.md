# Example: Node.js Project

A complete walkthrough of using Grove with a plain Node.js project — no Docker required.

## Project structure

```
my-node-app/
├── package.json
└── src/
    └── index.ts
```

Grove config is stored in `~/.grove/` on your machine — run `grove setup` to generate it.

**`package.json`:**

```json
{
  "name": "my-node-app",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js"
  }
}
```

## Setup

```bash
cd my-node-app
grove setup --preset node --yes
```

This saves Grove config to `~/.grove/`. The config shape (view with `grove config list`):

```json
{
  "project": "my-node-app",
  "providers": {
    "web": { "type": "node-scripts" }
  },
  "naming": {
    "composeProject": "my-node-app-${branch_safe}",
    "ports": {
      "WEB_PORT": "auto"
    }
  },
  "worktrees": {
    "defaultBaseBranch": "main"
  }
}
```

## Create a worktree

```bash
grove start feat/new-api --new
```

```
Creating worktree at ~/repos/my-node-app-worktrees/feat-new-api…
  branching off main
Generating .env.worktree from grove config…
  WEB_PORT=3001
Resolving environment provider…
  → provider: node-scripts
Starting environment…
  web: http://localhost:3001
  source: grove
✓ Ready: feat/new-api
```

Grove generates `.env.worktree` and starts `npm run dev`. The dev server picks up `WEB_PORT` if your script reads it, or Grove auto-detects the port from the process output.

## Working across worktrees

```bash
# Two features running at once
grove start feat/new-api --new       # → http://localhost:3001
grove start feat/auth-rework --new   # → http://localhost:3002

# Open each in your editor
grove open feat/new-api
grove open feat/auth-rework
```

## Monitor from the TUI

```bash
grove
```

The TUI shows both worktrees, their detected URLs, and their git change footprints.

## Stop and clean up

```bash
grove stop feat/new-api       # stops the dev server
grove delete feat/new-api     # removes the worktree
```

## Tip: port assignment

Grove allocates `WEB_PORT` from free ports starting above 3000. Your dev server reads this from `.env.worktree`. Make sure your start script reads `process.env.PORT` or `process.env.WEB_PORT`:

```ts
const port = process.env.WEB_PORT ?? process.env.PORT ?? 3000;
```
