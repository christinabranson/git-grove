# grove setup

Initialize a repository for Grove environment management. Detects your project type and writes `.grove/config.json`.

```bash
grove setup [options]
```

## What it does

`grove setup` inspects the current repository and:

1. Detects your project type (Docker Compose, Vite, Node)
2. Proposes a `.grove/config.json` with naming templates and provider config
3. Asks for confirmation before writing anything

Without any flags, it's fully interactive and non-destructive.

## Example output

```
Detecting project type…

  ✔ Found docker-compose.yml
  ✔ App services: web, api
  ✔ Shared infrastructure: db, redis
  ✔ Found package.json — framework: vite

  Using preset: docker (auto-detected)

Proposed .grove/config.json:

{
  "enabled": true,
  "project": "my-app",
  "providers": {
    "web": { "type": "docker-compose", "service": "web" },
    "api": { "type": "docker-compose", "service": "api" }
  },
  "shared": { "db": true, "redis": true },
  "naming": {
    "composeProject": "${project}-${branch_safe}",
    "dbSchema": "my_app_${branch_safe}",
    "ports": {
      "WEB_PORT": "auto",
      "API_PORT": "auto",
      "DB_PORT": "auto"
    }
  },
  "worktrees": { "prefix": "grove", "defaultBaseBranch": "main" }
}

Write .grove/config.json? (y/N)
```

## Flags

| Flag              | Effect                                                          |
| ----------------- | --------------------------------------------------------------- |
| `--preset <name>` | Skip detection, use a known preset: `docker`, `vite`, or `node` |
| `--dry-run`       | Print the proposed config without writing anything              |
| `--refresh-env`   | Regenerate `.env.worktree` in the current worktree from config  |
| `--yes`           | Skip the confirmation prompt                                    |
| `--reset`         | Overwrite an existing `.grove/config.json`                      |
| `--debug`         | Show detection details                                          |

## Examples

```bash
grove setup                        # interactive, auto-detect
grove setup --preset docker        # use docker preset, skip detection
grove setup --preset docker --yes  # non-interactive
grove setup --dry-run              # preview without writing
grove setup --reset                # overwrite existing config
grove setup --refresh-env          # regenerate .env.worktree in current worktree
```

## Presets

| Preset   | When to use                                                                      |
| -------- | -------------------------------------------------------------------------------- |
| `docker` | Project uses Docker Compose. Maps services and marks shared infra automatically. |
| `vite`   | Vite-based frontend. Runs `npm run dev` per worktree.                            |
| `node`   | Generic Node.js project. Runs `npm run dev` or `npm start` per worktree.         |

## The generated config

`.grove/config.json` can be committed — it describes how the project works, not per-worktree state. Runtime env files should be gitignored:

```gitignore
.env
.env.worktree
```

See the [Docker guide](/guides/docker) for a full breakdown of config options including `envContract`, `sharedComposeFile`, and naming templates.
