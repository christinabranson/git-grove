import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import chalk from "chalk";
import { detectProject } from "../setup/detect.js";
import { presets, recommendPreset, type PresetName } from "../setup/presets.js";
import type { GroveConfig } from "../types.js";

export interface SetupOptions {
  preset?: PresetName;
  dryRun?: boolean;
  yes?: boolean;
  reset?: boolean;
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
      chalk.green("  ✔") +
        ` Found package.json — framework: ${frameworkLabel}`,
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
      "  Add these to .gitignore (per-worktree, should not be committed):",
    ),
  );
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

export async function runSetup(
  repoPath: string,
  opts: SetupOptions = {},
): Promise<void> {
  const configPath = path.join(repoPath, ".grove", "config.json");

  // Guard: existing config without --reset
  if (existsSync(configPath) && !opts.reset && !opts.dryRun) {
    console.log(chalk.yellow(".grove/config.json already exists."));
    console.log(
      chalk.gray(
        "  Run with --reset to regenerate it, or --dry-run to preview a new config.",
      ),
    );
    return;
  }

  // 1. Detect project
  const detection = await detectProject(repoPath);
  printDetectionSummary(repoPath, detection);

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
}
