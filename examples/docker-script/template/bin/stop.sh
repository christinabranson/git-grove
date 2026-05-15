#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FLAGS=(-p "$COMPOSE_PROJECT_NAME" --env-file "$GROVE_ENV_FILE")

echo "==> Stopping project: $COMPOSE_PROJECT_NAME"
docker compose "${COMPOSE_FLAGS[@]}" down
