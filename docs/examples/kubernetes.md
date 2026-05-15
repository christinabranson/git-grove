# Example: Kubernetes Developer Workflow

Grove manages your **local development environments**. This guide shows how to use Grove alongside a Kubernetes-based production (or staging) setup — giving you isolated local stacks per branch while your cluster handles deployed environments.

## The setup

A typical team using Kubernetes might have:

- **Production / staging** — deployed to a Kubernetes cluster
- **Local development** — Docker Compose per developer, per branch

Grove handles the local side. Kubernetes handles the deployed side. They don't overlap.

## Project layout

```
my-k8s-app/
├── k8s/                    # Kubernetes manifests (deployed)
│   ├── deployment.yaml
│   └── service.yaml
├── compose.yaml            # local dev (per branch)
├── compose.shared.yaml     # local dev (shared infra)
├── Dockerfile
└── .grove/
    └── config.json
```

## Grove config

```json
{
  "project": "my-k8s-app",
  "providers": {
    "web": { "type": "docker-compose", "service": "web" },
    "api": { "type": "docker-compose", "service": "api" }
  },
  "shared": { "db": true },
  "sharedComposeFile": "compose.shared.yaml",
  "naming": {
    "sharedProject": "my-k8s-app-shared",
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

## Local development workflow

Local development uses Docker Compose managed by Grove:

```bash
# Start shared infrastructure (Postgres)
grove shared up

# Start your feature branch environment
grove start feat/new-feature --new

# Develop, test, iterate
grove open feat/new-feature

# Clean up
grove delete feat/new-feature
```

Your Kubernetes configs are not involved here — local dev is entirely Docker Compose.

## Validating before deploying

Grove helps you validate changes locally before promoting to the cluster:

```bash
# Start the full local stack for your branch
grove start feat/new-feature

# Get the local URL
grove status feat/new-feature --json
# → { "web": "http://localhost:8081", ... }

# Run integration tests against it
API_URL=http://localhost:8081 npm run test:integration
```

## Multiple branches, multiple validation environments

With Grove you can validate multiple feature branches simultaneously before pushing to the cluster:

```bash
grove start feat/new-feature     # → :8081
grove start fix/regression       # → :8083

# Test both at the same time — different ports, different DB schemas, no interference
```

Once validated locally, promote via your normal CI/CD pipeline to the Kubernetes cluster.

## Tip: Consistent image names

If your Kubernetes manifests reference specific image names, use the same naming in `compose.yaml` so local builds match:

```yaml
services:
  api:
    image: my-k8s-app/api:local
    build: ./api
```

This makes it easy to push the same image to a registry after local validation.
