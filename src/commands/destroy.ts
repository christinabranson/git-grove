import chalk from "chalk";
import { execa } from "execa";
import { createInterface } from "readline";
import { loadWorktrees } from "../data/worktrees.js";
import { buildStartupEnvironment } from "../utils/envFiles.js";

async function defaultAsk(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function runDestroy(
  repoPath: string,
  branch?: string,
  opts: { yes?: boolean } = {},
  ask: (prompt: string) => Promise<string> = defaultAsk,
): Promise<void> {
  const { worktrees } = await loadWorktrees(repoPath);
  const wt = branch
    ? worktrees.find(
        (w) => w.branch === branch || w.branch.endsWith(`/${branch}`),
      )
    : worktrees[0];
  if (!wt) {
    throw new Error("No worktree found");
  }
  if (!wt.docker) {
    throw new Error(`No .env.worktree found in ${wt.path}`);
  }

  const { projectName } = wt.docker;
  const startupEnv = await buildStartupEnvironment(wt.path);

  if (!opts.yes) {
    const answer = await ask(
      `This will destroy all volumes for ${chalk.bold(projectName)}. Type the project name to confirm: `,
    );
    if (answer !== projectName) {
      throw new Error("Destroy cancelled");
    }
  }

  console.log(`Destroying ${projectName} (including volumes)…`);
  await execa(
    "docker",
    ["compose", "-p", projectName, "--env-file", ".env.worktree", "down", "-v"],
    { cwd: wt.path, env: startupEnv.merged },
  );
  console.log(chalk.green("✓") + ` ${projectName} destroyed`);
}
