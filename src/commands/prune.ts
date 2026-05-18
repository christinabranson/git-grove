import { execa } from "execa";

export async function runPrune(repoPath: string): Promise<void> {
  await execa("git", ["worktree", "prune"], { cwd: repoPath });
  console.log("✓ Pruned stale worktree metadata.");
}
