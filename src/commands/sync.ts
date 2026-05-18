import chalk from "chalk";
import { loadWorktrees } from "../data/worktrees.js";
import { printStatus } from "./status.js";

export async function runSync(repoPath: string): Promise<void> {
  console.log("Syncing worktrees…");
  const { worktrees, ghWarning } = await loadWorktrees(repoPath);
  if (ghWarning)
    process.stderr.write(chalk.yellow(`\n  ⚠  grove: ${ghWarning}\n\n`));
  printStatus(worktrees);
}
