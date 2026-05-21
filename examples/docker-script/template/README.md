# docker-script

A Docker Compose project that uses a custom shell script to orchestrate startup.
Grove treats `.env` as user-owned and `.env.worktree` as Grove-owned, then
delegates `grove start` to `bin/start.sh` instead of calling
`docker compose up` directly.

## Why a custom script?

Use this pattern when your startup sequence needs steps that plain
`docker compose up` cannot express:

- waiting for a dependency to be healthy before running migrations
- seeding a per-worktree database schema on first boot
- any pre/post startup logic that belongs with the project, not in CI

## How it works

`.grove/config.json` declares the `custom-shell` provider:

```json
{
  "providers": {
    "web": {
      "type": "custom-shell",
      "service": "web",
      "script": "bin/start.sh",
      "stopScript": "bin/stop.sh"
    }
  }
}
```

When you run `grove start <branch>`, Grove:

1. Creates the worktree and bootstraps `.env` from `.env.example` only when
   `.env` is missing.
2. Generates or refreshes `.env.worktree` with per-worktree values
   (`COMPOSE_PROJECT_NAME`, `WEB_PORT`, `DB_PORT`, `DB_SCHEMA`, …).
3. Invokes `bin/start.sh` with env precedence:
   shell env > `.env.worktree` > `.env` > `.env.example`.
4. Sets `GROVE_ENV_FILE=<path>/.env.worktree` so the script can pass the file
   to `docker compose --env-file "$GROVE_ENV_FILE"`.

`grove stop` calls `bin/stop.sh` the same way.

## Usage

```bash
grove setup          # writes .grove/config.json
grove start feature/my-branch
```
