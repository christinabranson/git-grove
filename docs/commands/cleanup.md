# grove delete / grove prune

Remove worktrees and clean up stale metadata.

---

## grove delete

Remove a worktree. Brings down its Docker stack first to avoid orphaned containers.

```bash
grove delete <branch> [options]
```

### What it does

1. Finds the worktree for the given branch
2. Prompts for confirmation (unless `--yes`)
3. Stops the Docker Compose stack if it's running
4. Removes the worktree directory with `git worktree remove --force`
5. Optionally deletes the git branch

### Examples

```bash
grove delete feat/my-feature                # confirmation prompt
grove delete feat/my-feature --yes          # skip confirmation
grove delete feat/my-feature --delete-branch
grove delete feat/my-feature --delete-branch --yes
```

### Flags

| Flag              | Effect                                            |
| ----------------- | ------------------------------------------------- |
| `--yes`           | Skip the confirmation prompt                      |
| `--delete-branch` | Delete the git branch after removing the worktree |

### Safety

- You cannot delete the main worktree
- If Docker down fails, Grove logs the error and continues with worktree removal — it won't leave your Git state broken because Docker had a problem
- `--delete-branch` uses `git branch -D` — the branch is deleted locally regardless of whether it has been merged

---

## grove prune

Remove stale worktree metadata left over from worktrees that were deleted outside of Grove.

```bash
grove prune
```

Runs `git worktree prune`, which removes entries from `.git/worktrees/` for paths that no longer exist on disk. No options, no confirmation — it only cleans up metadata, not live worktrees.

### When to use

- After manually deleting a worktree directory with `rm -rf`
- After a crashed session left Grove's metadata out of sync with git's
- If `grove status` shows worktrees with paths that don't exist

### Example

```bash
grove prune
# ✓ Pruned stale worktree metadata.
```
