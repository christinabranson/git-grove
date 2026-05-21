import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import chalk from "chalk";
import { detectProject } from "../setup/detect.js";
import { presets, recommendPreset, type PresetName } from "../setup/presets.js";
import type { GroveConfig } from "../types.js";
import { warnIfHardcodedComposePorts } from "../utils/hardcodedPortsCheck.js";
import { DEFAULT_SHARED_COMPOSE_FILE } from "../providers/shared.js";
import { expandNaming, buildCanonicalEnvVars } from "../setup/naming.js";
import { detectDefaultBranch } from "../data/worktrees.js";
import { execa } from "execa";
import { loadGroveConfig } from "../data/groveConfig.js";
import {
  discoverComposeContract,
  readEnvFile,
  readSourceEnvFiles,
  resolveContractEnvVars,
  selectCanonicalEnvForOutput,
  renderEnvContent,
} from "../providers/docker-compose-contract.js";

export interface SetupOptions {
  preset?: PresetName;
  dryRun?: boolean;
  refreshEnv?: boolean;
  debug?: boolean;
  yes?: boolean;
  reset?: boolean;
}

function debugLog(enabled: boolean | undefined, message: string): void {
  if (!enabled) return;
  console.log(chalk.gray(`  [debug] ${message}`));
}

function printDetectionSummary(
  repoPath: string,
  detection: Awaited<ReturnType<typeof detectProject>>,
): void {
  console.log(chalk.bold.cyan("\nDetecting project type…\n"));

  if (detection.hasDockerCompose) {
    console.log(chalk.green("  ✔") + " Found docker-compose.yml");
    if (detection.appServices.length > 0) {
      console.log(
        chalk.green("  ✔") +
          ` App services: ${chalk.white(detection.appServices.join(", "))}`,
      );
    }
    if (detection.sharedServices.length > 0) {
      console.log(
        chalk.green("  ✔") +
          ` Shared infrastructure: ${chalk.gray(detection.sharedServices.join(", "))}`,
      );
    }
  }

  if (detection.hasPackageJson) {
    const frameworkLabel = detection.framework
      ? chalk.white(detection.framework)
      : chalk.gray("generic Node.js");
    console.log(
      chalk.green("  ✔") + ` Found package.json — framework: ${frameworkLabel}`,
    );
  }

  if (!detection.hasDockerCompose && !detection.hasPackageJson) {
    console.log(
      chalk.yellow("  ⚠") + " No docker-compose.yml or package.json found",
    );
    console.log(chalk.gray("     Grove will write a minimal fallback config"));
  }

  const existingConfig = path.join(repoPath, ".grove", "config.json");
  if (existsSync(existingConfig)) {
    console.log(chalk.yellow("\n  ⚠  .grove/config.json already exists"));
  }

  console.log();
}

function printProposedConfig(config: GroveConfig): void {
  console.log(
    chalk.bold("Proposed") +
      " " +
      chalk.cyan(".grove/config.json") +
      chalk.bold(":") +
      "\n",
  );
  console.log(chalk.gray(JSON.stringify(config, null, 2)));
  console.log();
}

function printGitignoreSuggestion(): void {
  console.log(
    chalk.gray(
      "  Add these to .gitignore (local/runtime files, should not be committed):",
    ),
  );
  console.log(chalk.gray("    .env"));
  console.log(chalk.gray("    .env.worktree"));
  console.log(chalk.gray("    .worktree-manifest.json"));
  console.log(chalk.gray("    .grove/meta.json"));
  console.log();
}

async function confirm(question: string): Promise<boolean> {
  const readline = await import("readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(
        answer.trim().toLowerCase() === "y" ||
          answer.trim().toLowerCase() === "yes",
      );
    });
  });
}

async function writeGroveConfig(
  repoPath: string,
  config: GroveConfig,
): Promise<void> {
  const groveDir = path.join(repoPath, ".grove");
  if (!existsSync(groveDir)) {
    await mkdir(groveDir, { recursive: true });
  }
  await writeFile(
    path.join(groveDir, "config.json"),
    JSON.stringify(config, null, 2) + "\n",
    "utf-8",
  );
}

async function resolveCurrentBranch(repoPath: string): Promise<string> {
  try {
    const { stdout } = await execa(
      "git",
      ["rev-parse", "--abbrev-ref", "HEAD"],
      {
        cwd: repoPath,
      },
    );
    const branch = stdout.trim();
    return branch && branch !== "HEAD" ? branch : "main";
  } catch {
    return "main";
  }
}

async function regenerateEnvFromConfig(
  repoPath: string,
  config: GroveConfig,
  debug?: boolean,
): Promise<void> {
  const branch = await resolveCurrentBranch(repoPath);
  const envPath = path.join(repoPath, ".env.worktree");
  debugLog(debug, `branch resolved as: ${branch}`);

  const existingEnv = await readEnvFile(repoPath);
  const existingWebPort = /^\d+$/.test(existingEnv["WEB_PORT"] ?? "")
    ? Number.parseInt(existingEnv["WEB_PORT"], 10)
    : undefined;
  const expanded = expandNaming(config, branch);
  const canonicalEnv = await buildCanonicalEnvVars(expanded, existingWebPort);
  const contract = await discoverComposeContract(repoPath);
  const sourceEnv = await readSourceEnvFiles(
    repoPath,
    config.envContract?.sourceEnvFiles ?? [".env", ".env.example"],
  );
  const contractEnv = resolveContractEnvVars(
    contract,
    canonicalEnv,
    sourceEnv,
    config.envContract,
  );
  const renderedCanonicalEnv = selectCanonicalEnvForOutput(
    contract,
    canonicalEnv,
    config.envContract,
  );
  const envErrors = contractEnv.issues.filter((i) => i.severity === "error");
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
  const envContent = renderEnvContent(renderedCanonicalEnv, contractEnv.values);
  debugLog(
    debug,
    `contract expected vars: ${contract.expectedVars.length > 0 ? contract.expectedVars.join(", ") : "(none)"}`,
  );
  debugLog(
    debug,
    `contract port refs: ${contract.portRefs.length > 0 ? contract.portRefs.map((r) => `${r.service ?? "?"}:${r.variable}`).join(", ") : "(none)"}`,
  );
  debugLog(
    debug,
    `contract db refs: ${contract.dbNameRefs.length > 0 ? contract.dbNameRefs.map((r) => `${r.service ?? "?"}:${r.variable}`).join(", ") : "(none)"}`,
  );
  debugLog(
    debug,
    `canonical env vars: ${Object.keys(renderedCanonicalEnv)
      .sort((a, b) => a.localeCompare(b))
      .join(", ")}`,
  );
  await writeFile(envPath, envContent, "utf-8");

  console.log(chalk.green("✓ Regenerated .env.worktree"));
  console.log(chalk.gray(`  branch: ${branch}`));
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

export async function runSetup(
  repoPath: string,
  opts: SetupOptions = {},
): Promise<void> {
  const configPath = path.join(repoPath, ".grove", "config.json");

  // Guard: existing config without --reset
  if (existsSync(configPath) && !opts.reset && !opts.dryRun) {
    if (!opts.refreshEnv) {
      console.log(chalk.yellow(".grove/config.json already exists."));
      console.log(
        chalk.gray(
          "  Run with --reset to regenerate it, or --dry-run to preview a new config.",
        ),
      );
      return;
    }

    const existing = await loadGroveConfig(repoPath);
    if (!existing) {
      console.log(
        chalk.yellow(
          "Unable to refresh .env.worktree: .grove/config.json is missing, disabled, or invalid.",
        ),
      );
      return;
    }

    await regenerateEnvFromConfig(repoPath, existing, opts.debug);
    return;
  }

  // 1. Detect project
  const detection = await detectProject(repoPath);
  debugLog(
    opts.debug,
    `detected compose services: ${detection.composeServices.join(", ") || "(none)"}`,
  );
  debugLog(
    opts.debug,
    `detected app services: ${detection.appServices.join(", ") || "(none)"}`,
  );
  debugLog(
    opts.debug,
    `detected shared services: ${detection.sharedServices.join(", ") || "(none)"}`,
  );
  printDetectionSummary(repoPath, detection);

  if (opts.debug) {
    const contract = await discoverComposeContract(repoPath);
    debugLog(
      true,
      `contract expected vars: ${contract.expectedVars.join(", ") || "(none)"}`,
    );
    debugLog(
      true,
      `contract port refs: ${contract.portRefs.length > 0 ? contract.portRefs.map((r) => `${r.service ?? "?"}:${r.variable}`).join(", ") : "(none)"}`,
    );
    debugLog(
      true,
      `contract db refs: ${contract.dbNameRefs.length > 0 ? contract.dbNameRefs.map((r) => `${r.service ?? "?"}:${r.variable}`).join(", ") : "(none)"}`,
    );
  }

  // 2. Choose preset
  const presetName: PresetName = opts.preset ?? recommendPreset(detection);
  const preset = presets[presetName];

  if (opts.preset && !preset) {
    console.error(chalk.red(`Unknown preset: ${opts.preset}`));
    console.error(
      chalk.gray(`Available presets: ${Object.keys(presets).join(", ")}`),
    );
    process.exit(1);
  }

  if (!opts.preset) {
    console.log(
      chalk.gray(
        `  Using preset: ${chalk.white(presetName)} (auto-detected)\n`,
      ),
    );
  }

  // 3. Generate config
  const config = preset.generate(detection);
  try {
    const defaultBaseBranch = await detectDefaultBranch(repoPath);
    config.worktrees = {
      ...(config.worktrees ?? {}),
      defaultBaseBranch,
    };
    debugLog(opts.debug, `detected default base branch: ${defaultBaseBranch}`);
  } catch {
    debugLog(
      opts.debug,
      `default base branch detection failed; using preset default (${config.worktrees?.defaultBaseBranch ?? "main"})`,
    );
  }

  await warnIfHardcodedComposePorts(repoPath, [
    config.sharedComposeFile ?? DEFAULT_SHARED_COMPOSE_FILE,
  ]);

  // 4. Show proposal
  printProposedConfig(config);
  printGitignoreSuggestion();

  if (opts.dryRun) {
    console.log(chalk.yellow("Dry run — nothing written."));
    return;
  }

  // 5. Confirm (skip when --yes)
  if (!opts.yes) {
    const go = await confirm(
      chalk.bold("Write .grove/config.json?") + chalk.gray(" (y/N) "),
    );
    if (!go) {
      console.log(chalk.gray("Cancelled."));
      return;
    }
  }

  // 6. Write
  await writeGroveConfig(repoPath, config);

  const action = existsSync(configPath) && opts.reset ? "Updated" : "Created";
  console.log(chalk.green(`\n✓ ${action} .grove/config.json`));
  console.log(chalk.gray("\nNext steps:"));
  console.log(
    chalk.gray(
      "  grove spin <branch>   — create a worktree and start its environment",
    ),
  );
  console.log(chalk.gray("  grove status          — show all worktrees"));
  console.log(chalk.gray("  grove                 — open the TUI"));
  console.log();

  if (opts.refreshEnv) {
    await regenerateEnvFromConfig(repoPath, config, opts.debug);
  }
}
