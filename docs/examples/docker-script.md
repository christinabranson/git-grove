# Example: Docker + Custom Script

A walkthrough of using Grove's `custom-shell` provider to run a shell script as the startup sequence — useful when `docker compose up` alone is not enough.

**Use this pattern when you need to:**

- Wait for a database healthcheck before starting the application
- Run per-worktree migrations or schema creation on first boot
- Execute any pre/post startup logic that belongs with the project

## Project structure

```
my-app/
├── docker-compose.yml     # web + db services
├── bin/
│   ├── start.sh           # Grove calls this on grove start
│   └── stop.sh            # Grove calls this on grove stop
└── .grove/
    └── config.json        # committed
```

## Config

**`.grove/config.json`:**

```json
{
  "project": "docker-script",
  "providers": {
    "web": {
      "type": "custom-shell",
      "service": "web",
      "script": "bin/start.sh",
      "stopScript": "bin/stop.sh"
    }
  },
  "naming": {
    "composeProject": "${project}-${branch_safe}",
    "dbSchema": "${project}_${branch_safe}",
    "ports": {
      "WEB_PORT": "auto",
      "DB_PORT": "auto"
    }
  },
  "worktrees": {
    "prefix": "grove",
    "defaultBaseBranch": "main"
  }
}
```

**`docker-compose.yml`:**

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ${DB_SCHEMA:-app}
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app
    ports:
      - "${DB_PORT:-5432}:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app"]
      interval: 2s
      retries: 10

  web:
    image: node:18-alpine
    working_dir: /app
    depends_on:
      db:
        condition: service_healthy
    ports:
      - "${WEB_PORT:-3000}:3000"
    environment:
      DATABASE_URL: postgres://app:app@db:5432/${DB_SCHEMA:-app}
```

**`bin/start.sh`:**

```bash
#!/usr/bin/env bash
# Grove injects all .env.worktree variables into the environment before
# calling this script, so $COMPOSE_PROJECT_NAME, $WEB_PORT, $DB_SCHEMA,
# etc. are all available without any sourcing.
# GROVE_ENV_FILE points at the .env.worktree file itself — pass it to
# docker compose with --env-file so Compose sees the same values.
set -euo pipefail

COMPOSE_FLAGS=(-p "$COMPOSE_PROJECT_NAME" --env-file "$GROVE_ENV_FILE")

echo "==> Starting infrastructure for project: $COMPOSE_PROJECT_NAME"

# Bring up the database and wait for its healthcheck.
docker compose "${COMPOSE_FLAGS[@]}" up -d db
echo "==> Waiting for postgres to be healthy..."
docker compose "${COMPOSE_FLAGS[@]}" wait db

# Seed the per-worktree schema once, on first boot.
SEED_MARKER=".grove/.seeded-${COMPOSE_PROJECT_NAME}"
if [[ ! -f "$SEED_MARKER" ]]; then
  echo "==> Creating schema: $DB_SCHEMA"
  docker compose "${COMPOSE_FLAGS[@]}" exec -T db \
    psql -U app -c "CREATE SCHEMA IF NOT EXISTS \"$DB_SCHEMA\";"
  touch "$SEED_MARKER"
fi

# Start the application.
docker compose "${COMPOSE_FLAGS[@]}" up -d --build web

echo "==> Environment ready at http://localhost:${WEB_PORT}"
```

**`bin/stop.sh`:**

```bash
#!/usr/bin/env bash
set -euo pipefail
docker compose -p "$COMPOSE_PROJECT_NAME" --env-file "$GROVE_ENV_FILE" down
```

## How Grove calls your scripts

When you run `grove start <branch>`, Grove:

1. Creates (or attaches) the worktree.
2. Generates `.env.worktree` from naming templates — unique ports, compose project name, db schema, etc.
3. Parses `.env.worktree` and injects every key=value pair into the script's environment.
4. Sets `GROVE_ENV_FILE=<path>/.env.worktree` as an additional variable.
5. Runs `bin/start.sh` with `cwd` set to the worktree root.

`grove stop` calls `bin/stop.sh` the same way. If `stopScript` is absent from the config, Grove falls back to `docker compose -p $COMPOSE_PROJECT_NAME down`.

## Workflow

### Start a feature branch

```bash
grove start feat/login --new
```

```
Creating worktree at ~/repos/my-app-worktrees/feat-login…
  branching off main
Generating .env.worktree from grove config…
  COMPOSE_PROJECT_NAME=docker-script-feat-login
  WEB_PORT=8081
  DB_PORT=5433
  DB_SCHEMA=docker_script_feat_login
Resolving environment provider…
  → provider: custom-shell  (bin/start.sh)
Starting environment…
==> Starting infrastructure for project: docker-script-feat-login
==> Waiting for postgres to be healthy...
==> Creating schema: docker_script_feat_login
==> Environment ready at http://localhost:8081
  web: http://localhost:8081
  source: grove
✓ Ready: feat/login
```

### Start a second branch in parallel

```bash
grove start feat/payments --new
```

```
COMPOSE_PROJECT_NAME=docker-script-feat-payments
WEB_PORT=8083
DB_PORT=5435
DB_SCHEMA=docker_script_feat_payments
```

Both environments run simultaneously with no port conflicts and isolated schemas.

### Check status

```bash
grove status
```

```
  branch           provider       web     db schema
  feat/login       custom-shell   :8081   docker_script_feat_login
  feat/payments    custom-shell   :8083   docker_script_feat_payments
  main             —              —       —
```

### Tear down

```bash
grove delete feat/login
```

Calls `bin/stop.sh` (which runs `docker compose down`), then removes the worktree directory.

## Variables available in your scripts

All variables written to `.env.worktree` are injected, plus `GROVE_ENV_FILE`:

| Variable               | Example value                                   |
| ---------------------- | ----------------------------------------------- |
| `COMPOSE_PROJECT_NAME` | `docker-script-feat-login`                      |
| `WEB_PORT`             | `8081`                                          |
| `DB_PORT`              | `5433`                                          |
| `DB_SCHEMA`            | `docker_script_feat_login`                      |
| `GROVE_ENV_FILE`       | `/home/user/worktrees/feat-login/.env.worktree` |

Any variables from `naming.ports`, `envContract.passthrough`, and `envContract.derived` are also present.

## Compared to the `docker-compose` provider

| Behavior                   | `docker-compose`         | `custom-shell`                      |
| -------------------------- | ------------------------ | ----------------------------------- |
| Who calls `docker compose` | Grove                    | Your script                         |
| Pre-start hooks            | Not supported            | Anything you put in the script      |
| Post-start hooks           | Not supported            | Anything you put in the script      |
| `grove status` check       | `docker compose ps`      | `docker compose ps` (same)          |
| Stop behavior              | `docker compose down`    | Your stop script (or same fallback) |
| `.env.worktree` generation | Grove (naming templates) | Grove (naming templates) — same     |
