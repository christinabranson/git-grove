#!/usr/bin/env node
import chalk from "chalk";
import { program } from "commander";
import { LOGO } from "./tui/logo.js";
import { render } from "ink";
import React from "react";
import { loadWorktrees, detectRepoRoot } from "./data/worktrees.js";
import { App } from "./tui/App.js";
import { runStatus } from "./commands/status.js";
import { runSync } from "./commands/sync.js";
import { runOpen } from "./commands/open.js";
import { runStart } from "./commands/start.js";
import { runStop } from "./commands/stop.js";
import {
  runDockerUp,
  runDockerDown,
  runDockerTeardown,
} from "./commands/docker.js";
import {
  runSharedUp,
  runSharedDown,
  runSharedStatus,
} from "./commands/shared.js";
import { runDelete } from "./commands/delete.js";
import { runPrune } from "./commands/prune.js";
import { runInfo } from "./commands/info.js";
import { runSetup } from "./commands/setup.js";
import { runDoctor, runDoctorEnv } from "./commands/doctor.js";
import { warnIfNotGitignored } from "./utils/gitignoreCheck.js";
import type { PresetName } from "./setup/presets.js";

const pkg = {
  name: "@gitgrove/cli",
  version: process.env.PKG_VERSION ?? "0.0.0",
};

program
  .name("grove")
  .description("Terminal-based worktree manager for git repositories")
  .version(`\n${chalk.cyan(LOGO)}\n\n  v${pkg.version}\n`);

program.hook("preAction", async (_thisCommand, actionCommand) => {
  if (actionCommand.name() === "setup") return;
  try {
    const repoPath = await detectRepoRoot();
    await warnIfNotGitignored(repoPath);
  } catch {
    // Not in a git repo or can't read .gitignore — skip the check
  }
});

// grove status [env] [--json]
program
  .command("status [env]")
  .description("Show table of all worktrees with docker and PR state")
  .option("--json", "Output machine-readable JSON (requires [env] argument)")
  .action(async (env: string | undefined, opts: { json?: boolean }) => {
    try {
      const repoPath = await detectRepoRoot();
      await runStatus(repoPath, env, opts);
    } catch (err) {
      if (opts.json) {
        console.log(
          JSON.stringify({ ok: false, error: (err as Error).message }),
        );
      } else {
        console.error((err as Error).message);
      }
      process.exit(1);
    }
  });

// grove sync
program
  .command("sync")
  .description("Refresh all manifests and git status")
  .action(async () => {
    try {
      const repoPath = await detectRepoRoot();
      await runSync(repoPath);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

// grove open [branch]
program
  .command("open [branch]")
  .description(
    "Open worktree in editor (respects grove config, $VISUAL, $EDITOR)",
  )
  .action(async (branch?: string) => {
    try {
      const repoPath = await detectRepoRoot();
      await runOpen(repoPath, branch);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

// grove start <branch|PR#>
program
  .command("start <target>")
  .description("Create or attach a worktree and start its environment")
  .option(
    "--new",
    "Create a new branch (use --base to set the starting point, defaults to the repo default branch)",
  )
  .option(
    "--base <branch>",
    "Base branch for --new (default: repo default branch)",
  )
  .option(
    "--refresh-env",
    "Regenerate .env.worktree from grove config before starting",
  )
  .option("--json", "Output machine-readable JSON")
  .action(
    async (
      target: string,
      opts: {
        new?: boolean;
        base?: string;
        refreshEnv?: boolean;
        json?: boolean;
      },
    ) => {
      try {
        const repoPath = await detectRepoRoot();
        const groveEnv = await runStart(repoPath, target, opts);
        if (opts.json) {
          console.log(JSON.stringify(groveEnv, null, 2));
        } else {
          if (groveEnv.web) console.log(`  web: ${groveEnv.web.url}`);
          if (groveEnv.api) console.log(`  api: ${groveEnv.api.url}`);
          console.log(`  source: ${groveEnv.metadata.source}`);
          console.log(`✓ Ready: ${groveEnv.name}`);
        }
      } catch (err) {
        if (opts.json) {
          console.log(
            JSON.stringify({ ok: false, error: (err as Error).message }),
          );
        } else {
          console.error((err as Error).message);
        }
        process.exit(1);
      }
    },
  );

// grove stop <env>
program
  .command("stop <env>")
  .description("Stop the environment for a worktree")
  .action(async (env: string) => {
    try {
      const repoPath = await detectRepoRoot();
      await runStop(repoPath, env);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

// grove docker <up|down|teardown> [branch]
const docker = program
  .command("docker")
  .description("Manage docker compose stack for a worktree");

docker
  .command("up [branch]")
  .description("Start docker compose stack for a worktree")
  .option("--debug", "Enable debug output")
  .action(async (branch: string | undefined, opts: { debug?: boolean }) => {
    try {
      const repoPath = await detectRepoRoot();
      await runDockerUp(repoPath, branch, opts);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

docker
  .command("down [branch]")
  .description("Stop docker compose stack for a worktree")
  .action(async (branch?: string) => {
    try {
      const repoPath = await detectRepoRoot();
      await runDockerDown(repoPath, branch);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

docker
  .command("teardown [branch]")
  .description(
    "Tear down docker compose stack and volumes (destructive — prompts for confirmation)",
  )
  .action(async (branch?: string) => {
    try {
      const repoPath = await detectRepoRoot();
      await runDockerTeardown(repoPath, branch);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

// grove shared <up|down|status>
const shared = program
  .command("shared")
  .description("Manage the shared infrastructure stack (db, redis, etc.)");

shared
  .command("up")
  .description("Start the shared stack")
  .action(async () => {
    try {
      const repoPath = await detectRepoRoot();
      await runSharedUp(repoPath);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

shared
  .command("down")
  .description("Stop the shared stack")
  .action(async () => {
    try {
      const repoPath = await detectRepoRoot();
      await runSharedDown(repoPath);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

shared
  .command("status")
  .description("Show shared stack state")
  .action(async () => {
    try {
      const repoPath = await detectRepoRoot();
      await runSharedStatus(repoPath);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

// grove delete <branch>
program
  .command("delete <branch>")
  .description("Remove a worktree (with confirmation)")
  .option("--yes", "Skip confirmation prompt")
  .option(
    "--delete-branch",
    "Also delete the git branch after removing the worktree",
  )
  .action(
    async (branch: string, opts: { yes?: boolean; deleteBranch?: boolean }) => {
      try {
        const repoPath = await detectRepoRoot();
        await runDelete(repoPath, branch, opts);
      } catch (err) {
        console.error((err as Error).message);
        process.exit(1);
      }
    },
  );

// grove prune
program
  .command("prune")
  .description("Remove stale worktree metadata (git worktree prune)")
  .action(async () => {
    try {
      const repoPath = await detectRepoRoot();
      await runPrune(repoPath);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

// grove info
program
  .command("info")
  .description("Show resolved grove configuration for the current repo")
  .action(async () => {
    try {
      const repoPath = await detectRepoRoot();
      await runInfo(repoPath);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

// grove setup
program
  .command("setup")
  .description("Detect project type and write .grove/config.json")
  .option("--preset <name>", "Use a specific preset (docker, vite, node)")
  .option("--dry-run", "Print proposed config without writing anything")
  .option(
    "--refresh-env",
    "Regenerate .env.worktree in the current worktree from grove config",
  )
  .option("--debug", "Enable debug output")
  .option("--yes", "Skip confirmation prompt")
  .option("--reset", "Overwrite existing .grove/config.json")
  .action(
    async (opts: {
      preset?: string;
      dryRun?: boolean;
      refreshEnv?: boolean;
      debug?: boolean;
      yes?: boolean;
      reset?: boolean;
    }) => {
      try {
        const repoPath = await detectRepoRoot();
        await runSetup(repoPath, {
          preset: opts.preset as PresetName | undefined,
          dryRun: opts.dryRun,
          refreshEnv: opts.refreshEnv,
          debug: opts.debug,
          yes: opts.yes,
          reset: opts.reset,
        });
      } catch (err) {
        console.error((err as Error).message);
        process.exit(1);
      }
    },
  );

// grove doctor [--json]
// grove doctor env [branch]
const doctor = program.command("doctor").description("Run Grove diagnostics");

doctor
  .option("--json", "Output diagnostics as JSON")
  .action(async (opts: { json?: boolean }) => {
    try {
      const result = await runDoctor(process.cwd(), { json: opts.json });
      if (!result.ok) process.exit(1);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

doctor
  .command("env [branch]")
  .description("Inspect compose env contract, aliases, and resolved host ports")
  .action(async (branch?: string) => {
    try {
      const repoPath = await detectRepoRoot();
      const result = await runDoctorEnv(repoPath, branch);
      if (!result.ok) process.exit(1);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

// Default: TUI mode (no subcommand)
async function main() {
  if (process.argv.length <= 2) {
    try {
      const repoPath = await detectRepoRoot();
      const { worktrees } = await loadWorktrees(repoPath);
      const { waitUntilExit } = render(
        React.createElement(App, { repoPath, initialWorktrees: worktrees }),
        { exitOnCtrlC: true },
      );
      await waitUntilExit();
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
    return;
  }

  program.parse();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
