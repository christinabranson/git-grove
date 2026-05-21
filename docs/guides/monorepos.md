# Monorepos

Grove works well with monorepos — projects with multiple services, packages, or apps in a single repository.

## The challenge

Monorepos typically run multiple services in parallel (web, api, worker, etc.). In a worktree-based workflow, you need each branch to have its own isolated set of services running on unique ports. Without coordination, services from different branches collide.

## Configuration

Declare your services as providers via `grove config set` (or run `grove setup` which auto-detects them). The full config shape:

```json
{
  "project": "my-monorepo",
  "providers": {
    "web": { "type": "docker-compose", "service": "web" },
    "api": { "type": "docker-compose", "service": "api" },
    "worker": { "type": "docker-compose", "service": "worker" }
  },
  "shared": { "db": true, "redis": true },
  "naming": {
    "sharedProject": "my-monorepo-shared",
    "composeProject": "${project}-${branch_safe}",
    "dbSchema": "${project}_${branch_safe}",
    "ports": {
      "WEB_PORT": "auto",
      "API_PORT": "auto",
      "WORKER_PORT": "auto",
      "DB_PORT": "auto",
      "REDIS_PORT": "auto"
    }
  }
}
```

With this config, `grove start feat/my-feature` generates a `.env.worktree` like:

```bash
COMPOSE_PROJECT_NAME=my-monorepo-feat-my-feature
WEB_PORT=8081
API_PORT=8082
WORKER_PORT=8083
DB_PORT=5433
REDIS_PORT=6380
DB_SCHEMA=my_monorepo_feat_my_feature
SHARED_PROJECT_NAME=my-monorepo-shared
```

Each worktree gets a different set of ports. No two branches conflict.

## Compose file layout

```
compose.yaml           # all per-worktree services
compose.shared.yaml    # shared: db, redis
```

`compose.yaml`:

```yaml
services:
  web:
    build: ./packages/web
    ports:
      - "${WEB_PORT}:3000"
    environment:
      API_URL: http://localhost:${API_PORT}

  api:
    build: ./packages/api
    ports:
      - "${API_PORT}:4000"
    environment:
      DATABASE_URL: postgres://postgres:dev@db:5432/${DB_SCHEMA}
      REDIS_URL: redis://redis:6379/${REDIS_DB:-0}

  worker:
    build: ./packages/worker
    ports:
      - "${WORKER_PORT}:5000"
    environment:
      DATABASE_URL: postgres://postgres:dev@db:5432/${DB_SCHEMA}

networks:
  shared_net:
    external: true
    name: ${SHARED_PROJECT_NAME}_default
```

## Worktree root

By default, Grove places worktrees at `<repo-parent>/<repo-name>-worktrees/`. In a monorepo with a long path you might want to override this:

```json
{
  "worktrees": {
    "root": "/fast-disk/worktrees/my-monorepo"
  }
}
```

Or set it permanently in your Grove config:

```bash
grove config set worktrees.root /fast-disk/worktrees
```

## Parallel development across workspaces

With multiple worktrees running:

```bash
grove status
```

```
  branch                   provider        web              status
  feat/payments            docker-compose  :8081            running
  feat/notifications       docker-compose  :8084            running
  fix/api-race             docker-compose  :8087            stopped
  main                     docker-compose  —                —
```

Switch between contexts without stopping anything:

```bash
grove open feat/payments
# ... work on payments ...
grove open feat/notifications
# ... work on notifications ...
```

## Selective service startup

If your monorepo has services you don't always need, you can start only the ones relevant to a branch by filtering with `docker compose`:

```bash
grove docker up feat/payments
# then selectively scale up only what you need:
docker compose -p my-monorepo-feat-payments --env-file .env.worktree up api db -d
```

Grove sets up the env — you can always use `docker compose` directly with the generated `.env.worktree`.
