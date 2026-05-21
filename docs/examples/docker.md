# Example: Docker Compose

A complete walkthrough of using Grove with a Docker Compose project — shared database, per-branch app stacks, and isolated schemas.

## Project structure

```
my-app/
├── compose.yaml           # per-worktree: web, api
├── compose.shared.yaml    # shared: db, redis
└── .env                   # base secrets (gitignored)
```

Grove config is stored in `~/.grove/` on your machine — run `grove setup` once to generate it, then use `grove config set` to customize.

## Config

**Grove config** (run `grove setup` to generate, `grove config list` to view):

```json
{
  "project": "my-app",
  "providers": {
    "web": { "type": "docker-compose", "service": "web" },
    "api": { "type": "docker-compose", "service": "api" }
  },
  "shared": { "db": true, "redis": true },
  "sharedComposeFile": "compose.shared.yaml",
  "naming": {
    "sharedProject": "my-app-shared",
    "composeProject": "${project}-${branch_safe}",
    "dbSchema": "${project}_${branch_safe}",
    "ports": {
      "WEB_PORT": "auto",
      "API_PORT": "auto",
      "DB_PORT": "auto"
    }
  },
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

**`compose.shared.yaml`:**

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: dev
      POSTGRES_USER: dev
      POSTGRES_DB: my_app
    volumes:
      - db_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  db_data:
```

**`compose.yaml`:**

```yaml
services:
  web:
    build: ./web
    ports:
      - "${WEB_PORT}:3000"
    environment:
      API_URL: http://localhost:${API_PORT}
    networks:
      - default
      - shared_net

  api:
    build: ./api
    ports:
      - "${API_PORT}:4000"
    environment:
      DATABASE_URL: ${DATABASE_URL}
      REDIS_URL: redis://redis:6379
    networks:
      - default
      - shared_net

networks:
  shared_net:
    external: true
    name: ${SHARED_PROJECT_NAME}_default
```

**`.env`** (gitignored):

```bash
POSTGRES_USER=dev
POSTGRES_PASSWORD=dev
POSTGRES_DB=my_app
```

## Workflow

### Start shared infrastructure once

```bash
grove shared up
```

Postgres and Redis start under the fixed project name `my-app-shared`. This runs once — all worktrees share it.

### Start a feature branch environment

```bash
grove start feat/checkout --new
```

```
Creating worktree at ~/repos/my-app-worktrees/feat-checkout…
  branching off main
Generating .env.worktree from grove config…
  aliases: none
  COMPOSE_PROJECT_NAME=my-app-feat-checkout
  WEB_PORT=8081
  API_PORT=8082
  DB_PORT=5433
  DB_SCHEMA=my_app_feat_checkout
  DATABASE_URL=postgresql://dev:dev@db:5432/my_app?schema=my_app_feat_checkout
  SHARED_PROJECT_NAME=my-app-shared
  shared stack: my-app-shared already running
Resolving environment provider…
  → provider: docker-compose
Starting environment…
  web: http://localhost:8081
  api: http://localhost:8082
  source: grove
✓ Ready: feat/checkout
```

The API connects to Postgres using `my_app_feat_checkout` as its schema — isolated from every other branch.

### Start a second feature branch

```bash
grove start feat/search --new
```

```
COMPOSE_PROJECT_NAME=my-app-feat-search
WEB_PORT=8083
API_PORT=8084
DB_SCHEMA=my_app_feat_search
```

Both environments run simultaneously. No port conflicts. No data leakage between schemas.

### See everything at a glance

```bash
grove status
```

```
  branch             provider        web     api     agent
  feat/checkout      docker-compose  :8081   :8082   idle
  feat/search        docker-compose  :8083   :8084   idle
  main               —               —       —       —
```

### Diagnose env issues

If something seems off:

```bash
grove doctor env feat/checkout
```

Shows expected Compose variables, what Grove generated, any detected port mismatches, and actionable fixes.

### Tear down

```bash
# Stop stack, remove worktree
grove delete feat/checkout

# Destroy volumes too (irreversible)
grove docker teardown feat/checkout
```

Shared infrastructure keeps running — other branches depend on it.

```bash
# Stop shared stack when you're done for the day
grove shared down
```
