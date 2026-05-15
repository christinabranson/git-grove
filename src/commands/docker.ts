import chalk from "chalk";
import { execa } from "execa";
import { createInterface } from "readline";
import { loadWorktrees } from "../data/worktrees.js";
import { loadGroveConfig } from "../data/groveConfig.js";
import {
  discoverComposeContract,
  preflightComposeEnv,
  readEnvFile,
} from "../providers/docker-compose-contract.js";
import { DEFAULT_SHARED_COMPOSE_FILE } from "../providers/shared.js";
import { warnIfHardcodedComposePorts } from "../utils/hardcodedPortsCheck.js";

async function defaultReadline(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function runDockerUp(
  repoPath: string,
  branch?: string,
  opts: { debug?: boolean } = {},
): Promise<void> {
  const debug = Boolean(opts.debug || process.env.GROVE_DEBUG === "1");
  const logDebug = (message: string) => {
    if (!debug) return;
    console.log(chalk.gray(`  [debug] ${message}`));
  };

  const config = await loadGroveConfig(repoPath);
  await warnIfHardcodedComposePorts(repoPath, [
    config?.sharedComposeFile ?? DEFAULT_SHARED_COMPOSE_FILE,
  ]);
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

  const contract = await discoverComposeContract(wt.path);
  const envVars = await readEnvFile(wt.path);
  logDebug(
    `compose expected vars: ${contract.expectedVars.join(", ") || "(none)"}`,
  );
  logDebug(
    `compose port refs: ${
      contract.portRefs.length > 0
        ? contract.portRefs
            .map((r) => `${r.service ?? "?"}:${r.variable}`)
            .join(", ")
        : "(none)"
    }`,
  );
  const preflight = await preflightComposeEnv(
    wt.path,
    contract,
    envVars,
    config?.envContract,
  );
  if (!preflight.ok) {
    const lines = ["Compose env preflight failed:"];
    for (const issue of preflight.issues) {
      lines.push(`- ${issue.message}`);
      if (issue.details) lines.push(`  ${issue.details}`);
      if (issue.suggestion) lines.push(`  fix: ${issue.suggestion}`);
    }
    throw new Error(lines.join("\n"));
  }

  for (const issue of preflight.issues.filter(
    (i) => i.severity === "warning",
  )) {
    console.warn(`warning: ${issue.message}`);
    if (issue.details) console.warn(`  ${issue.details}`);
  }

  const { projectName } = wt.docker;
  console.log(`Starting ${projectName}…`);
  const composeArgs = [
    "compose",
    "-p",
    projectName,
    "--env-file",
    ".env.worktree",
    "up",
    "-d",
    "--build",
  ];
  logDebug(`running in ${wt.path}`);
  logDebug(`docker ${composeArgs.join(" ")}`);
  await execa("docker", composeArgs, { cwd: wt.path });
  console.log(`✓ ${projectName} started`);
}

export async function runDockerDown(
  repoPath: string,
  branch?: string,
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
  console.log(`Stopping ${projectName}…`);
  await execa(
    "docker",
    ["compose", "-p", projectName, "--env-file", ".env.worktree", "down"],
    { cwd: wt.path },
  );
  console.log(`✓ ${projectName} stopped`);
}

export async function runDockerTeardown(
  repoPath: string,
  branch?: string,
  ask: (prompt: string) => Promise<string> = defaultReadline,
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

  const answer = await ask(
    `This will destroy all volumes for ${projectName}. Type the project name to confirm: `,
  );
  if (answer !== projectName) {
    throw new Error("Teardown cancelled");
  }

  console.log(`Tearing down ${projectName} (with volumes)…`);
  await execa(
    "docker",
    ["compose", "-p", projectName, "--env-file", ".env.worktree", "down", "-v"],
    { cwd: wt.path },
  );
  console.log(`✓ ${projectName} torn down`);
}
