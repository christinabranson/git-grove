import { createInterface } from "readline";
import { execa } from "execa";
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

export async function runDelete(
  repoPath: string,
  branch: string,
  opts: { yes?: boolean; deleteBranch?: boolean },
  ask: (prompt: string) => Promise<string> = defaultAsk,
): Promise<void> {
  const { worktrees } = await loadWorktrees(repoPath);
  const wt = worktrees.find(
    (w) => w.branch === branch || w.branch.endsWith(`/${branch}`),
  );
  if (!wt) {
    throw new Error(`No worktree found for: ${branch}`);
  }
  if (wt.isMain) {
    throw new Error("Cannot delete the main worktree.");
  }

  if (!opts.yes) {
    const answer = await ask(`Remove worktree at ${wt.path}? (y/N) `);
    if (answer.toLowerCase() !== "y") {
      console.log("Cancelled.");
      return;
    }
  }

  // Bring down docker stack first if running, to avoid orphaned containers
  if (
    wt.docker &&
    wt.docker.state !== "not started" &&
    wt.docker.state !== "stopped"
  ) {
    console.log(`Stopping docker stack ${wt.docker.projectName}…`);
    try {
      const startupEnv = await buildStartupEnvironment(wt.path);
      await execa(
        "docker",
        [
          "compose",
          "-p",
          wt.docker.projectName,
          "--env-file",
          ".env.worktree",
          "down",
        ],
        { cwd: wt.path, env: startupEnv.merged },
      );
      console.log(`✓ Docker stack stopped`);
    } catch {
      console.log(`  (docker down failed — continuing with worktree removal)`);
    }
  }

  console.log(`Removing worktree…`);
  await execa("git", ["worktree", "remove", "--force", wt.path], {
    cwd: repoPath,
  });
  console.log(`✓ Worktree removed: ${wt.path}`);

  if (opts.deleteBranch) {
    console.log(`Deleting branch ${wt.branch}…`);
    await execa("git", ["branch", "-D", wt.branch], { cwd: repoPath });
    console.log(`✓ Branch deleted: ${wt.branch}`);
  }
}
