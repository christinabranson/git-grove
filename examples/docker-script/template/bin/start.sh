#!/usr/bin/env bash
# Grove invokes this script with all .env.worktree variables already present in
# the environment, plus GROVE_ENV_FILE pointing at the file itself so you can
# pass it to docker compose with --env-file.
set -euo pipefail

COMPOSE_FLAGS=(-p "$COMPOSE_PROJECT_NAME" --env-file "$GROVE_ENV_FILE")

echo "==> Starting infrastructure for project: $COMPOSE_PROJECT_NAME"

# Bring up the DB first and wait for its healthcheck to pass.
docker compose "${COMPOSE_FLAGS[@]}" up -d db
echo "==> Waiting for postgres to be healthy..."
docker compose "${COMPOSE_FLAGS[@]}" wait db 2>/dev/null || \
  docker compose "${COMPOSE_FLAGS[@]}" run --rm db \
    sh -c 'until pg_isready -U app; do sleep 1; done'

# Run any one-time seed / migration work here.
# (This block is skipped when the schema already exists.)
SEED_MARKER=".grove/.seeded-${COMPOSE_PROJECT_NAME}"
if [[ ! -f "$SEED_MARKER" ]]; then
  echo "==> Seeding database schema: $DB_SCHEMA"
  docker compose "${COMPOSE_FLAGS[@]}" exec -T db \
    psql -U app -c "CREATE SCHEMA IF NOT EXISTS \"$DB_SCHEMA\";" 2>/dev/null || true
  touch "$SEED_MARKER"
fi

# Start the rest of the services.
docker compose "${COMPOSE_FLAGS[@]}" up -d --build web

echo "==> Environment ready at http://localhost:${WEB_PORT}"
