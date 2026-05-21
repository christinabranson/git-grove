# grove config

View and edit Grove configuration for the current repository.

```bash
grove config <get|set|list> [args]
```

Grove stores configuration in `~/.grove/repos/<repo-id>/config.json`. The repo ID is derived from the remote URL (or the repo path if no remote exists), so the config is automatically scoped to the right project when you have multiple repos cloned.

## Subcommands

### `grove config get <key>`

Print a single config value by its dot-path key:

```bash
grove config get project              # → my-app
grove config get providers.web.type   # → docker-compose
grove config get naming.webPort       # → auto
```

Exits 0 on success, 1 if the key is not set.

### `grove config set <key> <value>`

Set a config value. Values are type-checked and validated before writing:

```bash
grove config set editor cursor
grove config set naming.webPort 8080
grove config set naming.composeProject "myco-${branch_safe}"
grove config set enabled false
grove config set envContract.passthrough '["POSTGRES_USER","POSTGRES_PASSWORD"]'
```

Run `grove config set --help` for the full list of available keys, types, and defaults.

Unknown keys and invalid values are rejected with a clear error message.

### `grove config list`

Print all configured key/value pairs:

```bash
grove config list
```

```
project                  "my-app"
enabled                  true
providers.web.type       "docker-compose"
providers.web.service    "web"
naming.composeProject    "${project}-${branch_safe}"
naming.webPort           auto
naming.apiPort           auto
naming.dbPort            auto
```

## Available keys

Run `grove config set --help` to see all available keys with descriptions, types, and defaults. Key categories:

| Category           | Examples                                            |
| ------------------ | --------------------------------------------------- |
| Core               | `project`, `enabled`, `editor`, `sharedComposeFile` |
| Providers          | `providers.web.type`, `providers.api.service`       |
| Naming templates   | `naming.composeProject`, `naming.dbSchema`          |
| Port allocation    | `naming.webPort`, `naming.ports.REDIS_PORT`         |
| Worktree placement | `worktrees.root`, `worktrees.defaultBaseBranch`     |
| Env contract       | `envContract.required`, `envContract.passthrough`   |

## Where config lives

Grove uses `~/.grove/repos/<repo-id>/config.json`. The repo ID comes from the git remote URL — or a hash of the local path when there's no remote. This means:

- Config is **not committed to the repository** — it's personal to your machine
- Each developer runs `grove setup` once to generate their own copy
- All worktrees of a repo share the same config automatically (it's not per-worktree)

## Examples

```bash
# After grove setup, customize a few things
grove config set editor cursor
grove config set worktrees.root /fast-disk/worktrees

# Fix a port collision by pinning a specific port
grove config set naming.webPort 9000
grove setup --refresh-env   # regenerate .env.worktree with the new port

# Check what Grove thinks the project is set up as
grove config list

# Reset to defaults
grove setup --reset
```
