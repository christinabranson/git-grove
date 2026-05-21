import chalk from "chalk";
import { loadGroveConfig } from "../data/groveConfig.js";
import { resolveWorktreeRoot } from "../data/worktrees.js";

export async function runInfo(repoPath: string): Promise<void> {
  const groveConfig = await loadGroveConfig(repoPath);
  const worktreeRoot = resolveWorktreeRoot(
    repoPath,
    groveConfig?.worktrees?.root,
  );

  const rootSource = process.env.GROVE_WORKTREE_ROOT
    ? "$GROVE_WORKTREE_ROOT"
    : groveConfig?.worktrees?.root
      ? "grove config"
      : "default";

  console.log(`\n${chalk.bold.cyan("grove")} ${chalk.gray("· repo info")}\n`);
  console.log(`${chalk.gray("repo")}          ${repoPath}`);
  console.log(
    `${chalk.gray("worktree root")} ${worktreeRoot}  ${chalk.gray(`(${rootSource})`)}`,
  );
  console.log(
    `${chalk.gray("grove config")}  ${groveConfig ? chalk.green("found") : chalk.gray("none")}`,
  );
  if (groveConfig) {
    console.log(`${chalk.gray("  project")}     ${groveConfig.project}`);
    console.log(
      `${chalk.gray("  editor")}      ${groveConfig.editor ?? chalk.gray("(not set)")}`,
    );
  }
  console.log();
  console.log(chalk.gray("To override worktree root:"));
  console.log(
    chalk.gray("  env:    ") + "GROVE_WORKTREE_ROOT=/your/path grove start ...",
  );
  console.log(
    chalk.gray("  config: ") + "grove config set worktrees.root /your/path",
  );
  console.log();
}
