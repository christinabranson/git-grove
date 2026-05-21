import path from "path";
import { existsSync } from "fs";
import { writeFile } from "fs/promises";
import chalk from "chalk";
import { execa } from "execa";
import {
  detectDefaultBranch,
  createWorktreeWithBase,
  resolveWorktreeRoot,
} from "../data/worktrees.js";
import { loadGroveConfig } from "../data/groveConfig.js";
import { expandNaming, buildCanonicalEnvVars } from "../setup/naming.js";
import { discoverProvider } from "../providers/index.js";
import {
  resolveSharedStack,
  getSharedStackState,
  sharedUp,
  DEFAULT_SHARED_COMPOSE_FILE,
} from "../providers/shared.js";
import {
  discoverComposeContract,
  readEnvFile,
  readSourceEnvFiles,
  resolveContractEnvVars,
  selectCanonicalEnvForOutput,
  renderEnvContent,
} from "../providers/docker-compose-contract.js";
import { warnIfHardcodedComposePorts } from "../utils/hardcodedPortsCheck.js";
import { bootstrapUserEnvFile } from "../utils/envFiles.js";
import type { GroveEnvironment } from "../types.js";

export interface StartOptions {
  new?: boolean;
  base?: string;
  refreshEnv?: boolean;
  json?: boolean;
}

export async function runStart(
  repoPath: string,
  target: string,
  opts: StartOptions,
): Promise<GroveEnvironment> {
  const repoGroveConfig = await loadGroveConfig(repoPath);
  await warnIfHardcodedComposePorts(repoPath, [
    repoGroveConfig?.sharedComposeFile ?? DEFAULT_SHARED_COMPOSE_FILE,
  ]);
  const worktreeRoot = resolveWorktreeRoot(
    repoPath,
    repoGroveConfig?.worktrees?.root,
  );

  let branch = target;

  // Resolve PR number to branch
  if (/^\d+$/.test(target)) {
    if (!opts.json) console.log(`Resolving PR #${target}…`);
    const { stdout } = await execa("gh", [
      "pr",
      "view",
      target,
      "--json",
      "headRefName",
      "--jq",
      ".headRefName",
    ]);
    branch = stdout.trim();
    if (!opts.json) console.log(`  → branch: ${branch}`);
  }

  const worktreePath = path.join(worktreeRoot, branch.replace(/\//g, "-"));

  // 1. Create or attach worktree
  if (!existsSync(worktreePath)) {
    if (!opts.json) console.log(`Creating worktree at ${worktreePath}…`);
    if (opts.new) {
      const base = opts.base ?? (await detectDefaultBranch(repoPath));
      if (!opts.json) console.log(`  branching off ${base}`);
      await createWorktreeWithBase(repoPath, branch, worktreePath, base);
    } else {
      await execa("git", ["fetch", "origin", branch], { cwd: repoPath });
      await execa("git", ["worktree", "add", worktreePath, branch], {
        cwd: repoPath,
      });
    }
  } else if (!opts.json) {
    console.log(`Attaching to existing worktree at ${worktreePath}…`);
  }

  // 2. Ensure a user-owned .env exists (bootstrap once from .env.example).
  const bootstrappedUserEnv = await bootstrapUserEnvFile(worktreePath);
  if (bootstrappedUserEnv && !opts.json) {
    console.log("Bootstrapped .env from .env.example");
  }

  // 3. Generate or refresh .env.worktree from grove config naming templates
  const envAgentPath = path.join(worktreePath, ".env.worktree");
  const groveConfig =
    (await loadGroveConfig(worktreePath)) ?? (await loadGroveConfig(repoPath));
  const shouldGenerateEnv = Boolean(groveConfig);
  if (shouldGenerateEnv && groveConfig) {
    if (!opts.json) {
      console.log(
        existsSync(envAgentPath)
          ? "Refreshing .env.worktree from grove config…"
          : "Generating .env.worktree from grove config…",
      );
    }
    const existingEnv = await readEnvFile(worktreePath);
    const existingWebPort = /^\d+$/.test(existingEnv["WEB_PORT"] ?? "")
      ? Number.parseInt(existingEnv["WEB_PORT"], 10)
      : undefined;
    const expanded = expandNaming(groveConfig, branch);
    const canonicalEnv = await buildCanonicalEnvVars(expanded, existingWebPort);
    const contract = await discoverComposeContract(worktreePath);
    const sourceEnv = await readSourceEnvFiles(
      worktreePath,
      groveConfig.envContract?.sourceEnvFiles ?? [".env", ".env.example"],
    );
    const contractEnv = resolveContractEnvVars(
      contract,
      canonicalEnv,
      sourceEnv,
      groveConfig.envContract,
    );
    const renderedCanonicalEnv = selectCanonicalEnvForOutput(
      contract,
      canonicalEnv,
      groveConfig.envContract,
    );
    const envErrors = contractEnv.issues.filter(
      (issue) => issue.severity === "error",
    );
    if (envErrors.length > 0) {
      throw new Error(
        [
          "Env contract resolution failed:",
          ...envErrors.map((issue) =>
            issue.details
              ? `- ${issue.message} (${issue.details})`
              : `- ${issue.message}`,
          ),
        ].join("\n"),
      );
    }
    const envContent = renderEnvContent(
      renderedCanonicalEnv,
      contractEnv.values,
    );
    await writeFile(envAgentPath, envContent, "utf-8");
    if (!opts.json) {
      const aliasKeys = Object.keys(contractEnv.values).sort((a, b) =>
        a.localeCompare(b),
      );
      console.log(
        chalk.gray(
          `  aliases: ${aliasKeys.length > 0 ? aliasKeys.join(", ") : "none"}`,
        ),
      );
      for (const line of envContent.trim().split("\n")) {
        console.log(chalk.gray(`  ${line}`));
      }
      for (const warning of contract.warnings) {
        console.log(
          chalk.yellow(`  warning: compose contract detection: ${warning}`),
        );
      }
      for (const issue of contractEnv.issues.filter(
        (i) => i.severity === "warning",
      )) {
        console.log(chalk.yellow(`  warning: env contract: ${issue.message}`));
        if (issue.details) console.log(chalk.gray(`    ${issue.details}`));
      }
    }
  } else if (!groveConfig && !opts.json && opts.refreshEnv) {
    console.log(
      chalk.yellow(
        "  warning: --refresh-env requested but no Grove config was found — run `grove config set` to configure",
      ),
    );
  }

  // 4. Ensure shared stack is running (if configured)
  const sharedInfo = resolveSharedStack(repoPath, groveConfig);
  if (sharedInfo) {
    const sharedState = await getSharedStackState(sharedInfo);
    if (sharedState !== "running") {
      if (!sharedInfo.exists) {
        if (!opts.json)
          console.log(
            chalk.yellow(
              `  warning: shared stack configured (${sharedInfo.projectName}) but ${sharedInfo.composeFile} not found`,
            ),
          );
      } else {
        if (!opts.json)
          console.log(`Starting shared stack (${sharedInfo.projectName})…`);
        await sharedUp(sharedInfo, repoPath);
        if (!opts.json) console.log(`✓ Shared stack running`);
      }
    } else if (!opts.json) {
      console.log(
        chalk.gray(`  shared stack: ${sharedInfo.projectName} already running`),
      );
    }
  }

  // 5. Discover and start provider
  if (!opts.json) console.log("Resolving environment provider…");
  const provider = await discoverProvider(worktreePath, branch);
  if (!opts.json) console.log(`  → provider: ${provider.name}`);

  if (!opts.json) console.log("Starting environment…");
  return provider.start();
}
