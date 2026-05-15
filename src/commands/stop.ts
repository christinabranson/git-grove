import { loadWorktrees } from "../data/worktrees.js";
import { discoverProvider } from "../providers/index.js";

export async function runStop(repoPath: string, env: string): Promise<void> {
  const { worktrees } = await loadWorktrees(repoPath);
  const wt = worktrees.find(
    (w) => w.branch === env || w.branch.endsWith(`/${env}`),
  );
  if (!wt) {
    throw new Error(`No worktree found for: ${env}`);
  }
  const provider = await discoverProvider(wt.path, env);
  console.log(`Stopping environment (${provider.name})…`);
  await provider.stop();
  console.log(`✓ Stopped: ${env}`);
}
