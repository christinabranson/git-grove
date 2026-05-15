# Docker Compose

Grove's Docker integration gives each worktree an isolated Compose stack — unique project name, unique ports, and optional shared infrastructure for databases and caches.

## How it works

Grove reads `.env.worktree` to discover the Compose project name and port bindings for each worktree. It then uses `docker compose -p <project>` to keep stacks isolated at the Docker level.

When you run `grove start`, Grove:

1. Creates the worktree directory
2. Generates `.env.worktree` from naming templates (if `.grove/config.json` exists)
3. Starts the shared infrastructure stack (if configured)
4. Runs `docker compose up -d --build` for the worktree

## Setup

### Step 1 — Run grove setup

```bash
grove setup
```

Grove detects your `docker-compose.yml` or `compose.yaml` and proposes a config. Confirm and it writes `.grove/config.json`.

### Step 2 — Review the config

`.grove/config.json` for a typical Docker project:

```json
{
  "project": "my-app",
  "providers": {
    "web": { "type": "docker-compose", "service": "web" },
    "api": { "type": "docker-compose", "service": "api" }
  },
  "naming": {
    "composeProject": "${project}-${branch_safe}",
    "dbSchema": "${project}_${branch_safe}",
    "ports": {
      "WEB_PORT": "auto",
      "API_PORT": "auto",
      "DB_PORT": "auto"
    }
  }
}
```

Naming template variables:

| Variable         | Expands to                                                            |
| ---------------- | --------------------------------------------------------------------- |
| `${branch}`      | Branch name as-is (e.g. `feat/auth-refresh`)                          |
| `${branch_safe}` | Branch lowercased, `/` → `-`, max 40 chars (e.g. `feat-auth-refresh`) |
| `${project}`     | Project name from config                                              |

### Step 3 — Wire ports in your Compose file

Use the Grove-generated env vars in your `compose.yaml`:

```yaml
services:
  web:
    build: .
    ports:
      - "${WEB_PORT}:3000"
  db:
    image: postgres:16
    ports:
      - "${DB_PORT:-5432}:5432"
    environment:
      POSTGRES_DB: ${DB_SCHEMA}
```

Grove writes `WEB_PORT`, `DB_PORT`, `DB_SCHEMA`, and `COMPOSE_PROJECT_NAME` into `.env.worktree`. Your Compose file reads them.

## Shared infrastructure

Some services (Postgres, Redis) run once across all worktrees. Grove manages these as a separate "shared stack":

### Compose file layout

```
compose.yaml           # per-worktree: web, api, worker
compose.shared.yaml    # shared: db, redis
```

**`compose.shared.yaml`** — runs once under a fixed project name:

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: dev
    volumes:
      - db_data:/var/lib/postgresql/data
  redis:
    image: redis:7-alpine
volumes:
  db_data:
```

**`compose.yaml`** — per-worktree, joins the shared network:

```yaml
services:
  web:
    build: .
    ports:
      - "${WEB_PORT}:3000"
    environment:
      DATABASE_URL: postgres://postgres:dev@db:5432/${DB_SCHEMA}
      REDIS_URL: redis://redis:6379
    networks:
      - default
      - shared_net

networks:
  shared_net:
    external: true
    name: ${SHARED_PROJECT_NAME}_default
```

Docker Compose creates a network named `<project>_default` for every project. Per-worktree services join the shared project's network as an external network — that's how they reach `db` and `redis` by hostname.

### Config for shared infrastructure

```json
{
  "shared": { "db": true, "redis": true },
  "sharedComposeFile": "compose.shared.yaml",
  "naming": {
    "sharedProject": "my-app-shared",
    "composeProject": "my-app-${branch_safe}"
  }
}
```

`naming.sharedProject` is required to enable shared stack management. Grove writes `SHARED_PROJECT_NAME=my-app-shared` into every `.env.worktree`.

### Managing the shared stack

```bash
grove shared up       # start (idempotent — safe to run if already running)
grove shared status   # show state
grove shared down     # stop
```

`grove start` automatically starts the shared stack if it isn't running.

## Env contract

For projects with secrets or derived env vars, configure `envContract` in `.grove/config.json`:

```json
{
  "envContract": {
    "strict": true,
    "passthrough": ["POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB"],
    "derived": {
      "DATABASE_URL": "postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}?schema=${DB_SCHEMA}"
    },
    "required": ["DATABASE_URL"],
    "sourceEnvFiles": [".env"]
  }
}
```

| Class         | Behavior                                                   |
| ------------- | ---------------------------------------------------------- |
| `passthrough` | Copied from source env files (`.env`) into `.env.worktree` |
| `derived`     | Rendered from explicit templates — never guessed           |
| `required`    | Must be present after rendering — fails fast if missing    |

## Diagnostics

If Docker seems to ignore Grove's ports:

```bash
# Regenerate .env.worktree for a worktree
grove start feat/my-feature --refresh-env

# Inspect what Compose expects vs what Grove generated
grove doctor env feat/my-feature
```

`grove doctor env` shows expected variables, detected port references, and any mismatches.

## Custom startup scripts

Sometimes `docker compose up` is not enough. If your startup sequence needs steps that plain Compose cannot express — waiting for a database to be healthy, running per-worktree schema migrations, seeding fixture data on first boot — use the `custom-shell` provider.

### How it works

Grove still generates `.env.worktree` exactly as it would for a `docker-compose` project. Instead of calling `docker compose up` itself, it:

1. Parses `.env.worktree` and injects every variable into the script's environment.
2. Sets `GROVE_ENV_FILE=<worktree-path>/.env.worktree` so the script can forward the file to `docker compose --env-file "$GROVE_ENV_FILE"`.
3. Runs your script with `cwd` set to the worktree root.

Your script is responsible for the actual `docker compose up` call and any surrounding logic.

### Config

```json
{
  "project": "my-app",
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
  }
}
```

| Field        | Required | Description                                                                   |
| ------------ | -------- | ----------------------------------------------------------------------------- |
| `script`     | yes      | Path to the startup script, relative to the worktree root                     |
| `stopScript` | no       | Path to the teardown script. Falls back to `docker compose down` when absent. |
| `service`    | no       | Compose service name used by `grove status` to check the running state        |

### Writing the script

All `.env.worktree` variables are already in the environment when the script runs. You do not need to `source` the file — though you can pass it to `docker compose` via `$GROVE_ENV_FILE`:

```bash
#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FLAGS=(-p "$COMPOSE_PROJECT_NAME" --env-file "$GROVE_ENV_FILE")

# Start the database and wait for its healthcheck.
docker compose "${COMPOSE_FLAGS[@]}" up -d db
docker compose "${COMPOSE_FLAGS[@]}" wait db

# Run migrations once per worktree.
SEED_MARKER=".grove/.seeded-${COMPOSE_PROJECT_NAME}"
if [[ ! -f "$SEED_MARKER" ]]; then
  docker compose "${COMPOSE_FLAGS[@]}" run --rm db \
    psql -U app -c "CREATE SCHEMA IF NOT EXISTS \"$DB_SCHEMA\";"
  touch "$SEED_MARKER"
fi

# Bring up the application.
docker compose "${COMPOSE_FLAGS[@]}" up -d --build web
echo "Ready at http://localhost:${WEB_PORT}"
```

Variables always available in the script:

| Variable               | Example value                                   |
| ---------------------- | ----------------------------------------------- |
| `COMPOSE_PROJECT_NAME` | `my-app-feat-login`                             |
| `WEB_PORT`             | `8081`                                          |
| `DB_PORT`              | `5433`                                          |
| `DB_SCHEMA`            | `my_app_feat_login`                             |
| `GROVE_ENV_FILE`       | `/home/user/worktrees/feat-login/.env.worktree` |

Any additional variables from `naming.ports` or `envContract.passthrough` / `envContract.derived` are also present.

### Stop script

If `stopScript` is omitted, `grove stop` falls back to `docker compose -p $COMPOSE_PROJECT_NAME down`. Provide a stop script when you need custom teardown:

```bash
#!/usr/bin/env bash
set -euo pipefail
docker compose -p "$COMPOSE_PROJECT_NAME" --env-file "$GROVE_ENV_FILE" down
```

### Full example

See the [Docker Script example](/examples/docker-script) for a complete project using this pattern.

## Docker commands

```bash
grove docker up feat/my-feature        # docker compose up -d --build
grove docker down feat/my-feature      # docker compose down
grove docker teardown feat/my-feature  # docker compose down -v (destroys volumes)
```

`teardown` prompts you to type the project name before proceeding — it's destructive.
