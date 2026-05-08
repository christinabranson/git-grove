#!/usr/bin/env node
import chalk from "chalk";
import { program } from "commander";
import { LOGO } from "./tui/logo.js";
import { render } from "ink";
import React from "react";
import {
  loadWorktrees,
  detectRepoRoot,
  resolveWorktreeRoot,
} from "./data/worktrees.js";
import { printStatus } from "./commands/status.js";
import { App } from "./tui/App.js";
import { discoverProvider } from "./providers/index.js";
import {
  resolveSharedStack,
  getSharedStackState,
  sharedUp,
  sharedDown,
  DEFAULT_SHARED_COMPOSE_FILE,
} from "./providers/shared.js";
import { loadGroveConfig } from "./data/groveConfig.js";
import { expandNaming, buildEnvAgent } from "./setup/naming.js";
import { runSetup } from "./commands/setup.js";
import { warnIfNotGitignored } from "./utils/gitignoreCheck.js";
import { warnIfHardcodedComposePorts } from "./utils/hardcodedPortsCheck.js";
import type { PresetName } from "./setup/presets.js";

const pkg = { name: "grove-wt", version: "0.1.0" };

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

      if (opts.json && env) {
        const { worktrees: wtList } = await loadWorktrees(repoPath);
        const wt = wtList.find(
          (w) => w.branch === env || w.branch.endsWith(`/${env}`),
        );
        if (!wt) {
          console.log(
            JSON.stringify({
              ok: false,
              error: `no worktree found for: ${env}`,
            }),
          );
          process.exit(1);
        }
        const provider = await discoverProvider(wt.path, env);
        const groveEnv = await provider.status();
        console.log(
          JSON.stringify({
            ok: true,
            web: groveEnv.web?.url ?? null,
            api: groveEnv.api?.url ?? null,
            source: groveEnv.metadata.source,
            mode: groveEnv.metadata.provider,
          }),
        );
        return;
      }

      const { worktrees, ghWarning } = await loadWorktrees(repoPath);
      if (ghWarning)
        process.stderr.write(chalk.yellow(`\n  ⚠  grove: ${ghWarning}\n\n`));
      printStatus(worktrees);
    } catch (err) {
      console.error((err as Error).message);
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
      console.log("Syncing worktrees…");
      const { worktrees, ghWarning } = await loadWorktrees(repoPath);
      if (ghWarning)
        process.stderr.write(chalk.yellow(`\n  ⚠  grove: ${ghWarning}\n\n`));
      printStatus(worktrees);
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
    const { openInEditor, editorDisplayName, resolveEditor } =
      await import("./tui/editor.js");
    try {
      const repoPath = await detectRepoRoot();
      const [{ worktrees }, groveConfig] = await Promise.all([
        loadWorktrees(repoPath),
        loadGroveConfig(repoPath),
      ]);
      const target = branch
        ? worktrees.find((wt) => wt.branch === branch)
        : worktrees[0];
      if (!target) {
        console.error(`No worktree found for branch: ${branch}`);
        process.exit(1);
      }
      const editor = await resolveEditor(groveConfig?.editor);
      if (!editor) {
        console.error(
          'No editor found — set $VISUAL, $EDITOR, or add "editor" to .grove/config.json',
        );
        process.exit(1);
      }
      console.log(
        `Opening ${target.branch} in ${editorDisplayName(editor.bin)}…`,
      );
      await openInEditor(target.path, groveConfig?.editor);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

// grove start <branch|PR#> — create or attach worktree, generate .env.worktree, start environment
program
  .command("start <target>")
  .description("Create or attach a worktree and start its environment")
  .option(
    "--new",
    "Create a new branch (use --base to set the starting point, defaults to main)",
  )
  .option("--base <branch>", "Base branch for --new (default: main)")
  .option("--json", "Output machine-readable JSON")
  .action(
    async (
      target: string,
      opts: { new?: boolean; base?: string; json?: boolean },
    ) => {
      const { execa } = await import("execa");
      const { existsSync } = await import("fs");
      const { writeFile } = await import("fs/promises");
      const pathMod = await import("path");
      try {
        const repoPath = await detectRepoRoot();
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

        const worktreePath = pathMod.join(
          worktreeRoot,
          branch.replace(/\//g, "-"),
        );

        // 1. Create or attach worktree
        if (!existsSync(worktreePath)) {
          if (!opts.json) console.log(`Creating worktree at ${worktreePath}…`);
          if (opts.new) {
            const base = opts.base ?? "main";
            if (!opts.json) console.log(`  branching off ${base}`);
            await execa(
              "git",
              ["worktree", "add", "-b", branch, worktreePath, base],
              { cwd: repoPath },
            );
            // Record base branch so grove can display it later
            const groveMetaDir = pathMod.join(worktreePath, ".grove");
            const { mkdir } = await import("fs/promises");
            await mkdir(groveMetaDir, { recursive: true });
            await writeFile(
              pathMod.join(groveMetaDir, "meta.json"),
              JSON.stringify({ baseBranch: base }, null, 2),
            );
          } else {
            await execa("git", ["fetch", "origin", branch], { cwd: repoPath });
            await execa("git", ["worktree", "add", worktreePath, branch], {
              cwd: repoPath,
            });
          }
        } else if (!opts.json) {
          console.log(`Attaching to existing worktree at ${worktreePath}…`);
        }

        // 2. Generate .env.worktree from grove config naming templates if not present
        const envAgentPath = pathMod.join(worktreePath, ".env.worktree");
        const groveConfig =
          (await loadGroveConfig(worktreePath)) ??
          (await loadGroveConfig(repoPath));
        if (!existsSync(envAgentPath)) {
          if (groveConfig) {
            if (!opts.json)
              console.log("Generating .env.worktree from grove config…");
            const expanded = expandNaming(groveConfig, branch);
            const envContent = await buildEnvAgent(expanded);
            await writeFile(envAgentPath, envContent, "utf-8");
            if (!opts.json) {
              for (const line of envContent.trim().split("\n"))
                console.log(chalk.gray(`  ${line}`));
            }
          }
        }

        // 3. Ensure shared stack is running (if configured)
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
                console.log(
                  `Starting shared stack (${sharedInfo.projectName})…`,
                );
              await sharedUp(sharedInfo, repoPath);
              if (!opts.json) console.log(`✓ Shared stack running`);
            }
          } else if (!opts.json) {
            console.log(
              chalk.gray(
                `  shared stack: ${sharedInfo.projectName} already running`,
              ),
            );
          }
        }

        // 4. Discover and start provider
        if (!opts.json) console.log("Resolving environment provider…");
        const provider = await discoverProvider(worktreePath, branch);
        if (!opts.json) console.log(`  → provider: ${provider.name}`);

        if (!opts.json) console.log("Starting environment…");
        const groveEnv = await provider.start();

        // 4. Output
        if (opts.json) {
          console.log(JSON.stringify(groveEnv, null, 2));
        } else {
          if (groveEnv.web) console.log(`  web: ${groveEnv.web.url}`);
          if (groveEnv.api) console.log(`  api: ${groveEnv.api.url}`);
          console.log(`  source: ${groveEnv.metadata.source}`);
          console.log(`✓ Ready: ${branch}`);
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

// grove stop <env> — stop a running environment
program
  .command("stop <env>")
  .description("Stop the environment for a worktree")
  .action(async (env: string) => {
    try {
      const repoPath = await detectRepoRoot();
      const { worktrees } = await loadWorktrees(repoPath);
      const wt = worktrees.find(
        (w) => w.branch === env || w.branch.endsWith(`/${env}`),
      );
      if (!wt) {
        console.error(`No worktree found for: ${env}`);
        process.exit(1);
      }
      const provider = await discoverProvider(wt.path, env);
      console.log(`Stopping environment (${provider.name})…`);
      await provider.stop();
      console.log(`✓ Stopped: ${env}`);
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
  .action(async (branch?: string) => {
    const { execa } = await import("execa");
    try {
      const repoPath = await detectRepoRoot();
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
        console.error("No worktree found");
        process.exit(1);
      }
      if (!wt.docker) {
        console.error(`No .env.worktree found in ${wt.path}`);
        process.exit(1);
      }
      const { projectName } = wt.docker;
      console.log(`Starting ${projectName}…`);
      await execa(
        "docker",
        [
          "compose",
          "-p",
          projectName,
          "--env-file",
          ".env.worktree",
          "up",
          "-d",
          "--build",
        ],
        { cwd: wt.path },
      );
      console.log(`✓ ${projectName} started`);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

docker
  .command("down [branch]")
  .description("Stop docker compose stack for a worktree")
  .action(async (branch?: string) => {
    const { execa } = await import("execa");
    try {
      const repoPath = await detectRepoRoot();
      const { worktrees } = await loadWorktrees(repoPath);
      const wt = branch
        ? worktrees.find(
            (w) => w.branch === branch || w.branch.endsWith(`/${branch}`),
          )
        : worktrees[0];
      if (!wt) {
        console.error("No worktree found");
        process.exit(1);
      }
      if (!wt.docker) {
        console.error(`No .env.worktree found in ${wt.path}`);
        process.exit(1);
      }
      const { projectName } = wt.docker;
      console.log(`Stopping ${projectName}…`);
      await execa(
        "docker",
        ["compose", "-p", projectName, "--env-file", ".env.worktree", "down"],
        { cwd: wt.path },
      );
      console.log(`✓ ${projectName} stopped`);
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
    const { execa } = await import("execa");
    const readline = await import("readline");
    try {
      const repoPath = await detectRepoRoot();
      const { worktrees } = await loadWorktrees(repoPath);
      const wt = branch
        ? worktrees.find(
            (w) => w.branch === branch || w.branch.endsWith(`/${branch}`),
          )
        : worktrees[0];
      if (!wt) {
        console.error("No worktree found");
        process.exit(1);
      }
      if (!wt.docker) {
        console.error(`No .env.worktree found in ${wt.path}`);
        process.exit(1);
      }
      const { projectName } = wt.docker;

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      await new Promise<void>((resolve, reject) => {
        rl.question(
          `This will destroy all volumes for ${projectName}. Type the project name to confirm: `,
          (answer) => {
            rl.close();
            if (answer.trim() !== projectName) {
              reject(new Error("Teardown cancelled"));
            } else {
              resolve();
            }
          },
        );
      });

      console.log(`Tearing down ${projectName} (with volumes)…`);
      await execa(
        "docker",
        [
          "compose",
          "-p",
          projectName,
          "--env-file",
          ".env.worktree",
          "down",
          "-v",
        ],
        { cwd: wt.path },
      );
      console.log(`✓ ${projectName} torn down`);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

// grove shared <up|down|status> — manage the shared infrastructure stack
const shared = program
  .command("shared")
  .description("Manage the shared infrastructure stack (db, redis, etc.)");

shared
  .command("up")
  .description(
    `Start the shared stack (default file: ${DEFAULT_SHARED_COMPOSE_FILE})`,
  )
  .action(async () => {
    try {
      const repoPath = await detectRepoRoot();
      const config = await loadGroveConfig(repoPath);
      await warnIfHardcodedComposePorts(repoPath, [
        config?.sharedComposeFile ?? DEFAULT_SHARED_COMPOSE_FILE,
      ]);
      const info = resolveSharedStack(repoPath, config);
      if (!info) {
        console.error(
          "No shared stack configured. Add naming.sharedProject to .grove/config.json.",
        );
        process.exit(1);
      }
      if (!info.exists) {
        console.error(`Shared compose file not found: ${info.composeFilePath}`);
        process.exit(1);
      }
      const state = await getSharedStackState(info);
      if (state === "running") {
        console.log(
          chalk.gray(`Shared stack already running (${info.projectName})`),
        );
        return;
      }
      console.log(`Starting shared stack (${info.projectName})…`);
      await sharedUp(info, repoPath);
      console.log(`✓ Shared stack running`);
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
      const config = await loadGroveConfig(repoPath);
      const info = resolveSharedStack(repoPath, config);
      if (!info) {
        console.error("No shared stack configured.");
        process.exit(1);
      }
      const state = await getSharedStackState(info);
      if (state === "not started" || state === "stopped") {
        console.log(
          chalk.gray(`Shared stack is not running (${info.projectName})`),
        );
        return;
      }
      console.log(`Stopping shared stack (${info.projectName})…`);
      await sharedDown(info, repoPath);
      console.log(`✓ Shared stack stopped`);
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
      const config = await loadGroveConfig(repoPath);
      const info = resolveSharedStack(repoPath, config);
      if (!info) {
        console.log(chalk.gray("No shared stack configured."));
        return;
      }
      const state = await getSharedStackState(info);
      const dot =
        state === "running"
          ? chalk.green("●")
          : state === "partial"
            ? chalk.yellow("◐")
            : chalk.gray("■");
      console.log(`\n${chalk.bold("shared stack")}`);
      console.log(`  project:  ${info.projectName}`);
      console.log(`  file:     ${info.composeFile}`);
      console.log(`  state:    ${dot} ${state}`);
      console.log();
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

// grove delete <branch> — remove worktree and optionally delete the branch
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
      const { execa } = await import("execa");
      const readline = await import("readline");
      const ask = (q: string): Promise<string> =>
        new Promise((resolve) => {
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          });
          rl.question(q, (answer) => {
            rl.close();
            resolve(answer.trim());
          });
        });

      try {
        const repoPath = await detectRepoRoot();
        const { worktrees } = await loadWorktrees(repoPath);
        const wt = worktrees.find(
          (w) => w.branch === branch || w.branch.endsWith(`/${branch}`),
        );
        if (!wt) {
          console.error(`No worktree found for: ${branch}`);
          process.exit(1);
        }
        if (wt.isMain) {
          console.error("Cannot delete the main worktree.");
          process.exit(1);
        }

        if (!opts.yes) {
          const answer = await ask(`Remove worktree at ${wt.path}? (y/N) `);
          if (answer.toLowerCase() !== "y") {
            console.log("Cancelled.");
            process.exit(0);
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
              { cwd: wt.path },
            );
            console.log(`✓ Docker stack stopped`);
          } catch {
            console.log(
              `  (docker down failed — continuing with worktree removal)`,
            );
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
      } catch (err) {
        console.error((err as Error).message);
        process.exit(1);
      }
    },
  );

// grove prune — clean up stale worktree metadata
program
  .command("prune")
  .description("Remove stale worktree metadata (git worktree prune)")
  .action(async () => {
    const { execa } = await import("execa");
    try {
      const repoPath = await detectRepoRoot();
      await execa("git", ["worktree", "prune"], { cwd: repoPath });
      console.log("✓ Pruned stale worktree metadata.");
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

// grove info — show resolved configuration for the current repo
program
  .command("info")
  .description("Show resolved grove configuration for the current repo")
  .action(async () => {
    try {
      const repoPath = await detectRepoRoot();
      const groveConfig = await loadGroveConfig(repoPath);
      const worktreeRoot = resolveWorktreeRoot(
        repoPath,
        groveConfig?.worktrees?.root,
      );

      const rootSource = process.env.GROVE_WORKTREE_ROOT
        ? "$GROVE_WORKTREE_ROOT"
        : groveConfig?.worktrees?.root
          ? ".grove/config.json"
          : "default";

      console.log(
        `\n${chalk.bold.cyan("grove")} ${chalk.gray("· repo info")}\n`,
      );
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
        chalk.gray("  env:    ") +
          "GROVE_WORKTREE_ROOT=/your/path grove start ...",
      );
      console.log(
        chalk.gray("  config: ") +
          'set "worktrees": { "root": "/your/path" } in .grove/config.json',
      );
      console.log();
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

// grove setup [--preset docker|vite|node] [--dry-run] [--yes] [--reset]
program
  .command("setup")
  .description("Detect project type and write .grove/config.json")
  .option("--preset <name>", "Use a specific preset (docker, vite, node)")
  .option("--dry-run", "Print proposed config without writing anything")
  .option("--yes", "Skip confirmation prompt")
  .option("--reset", "Overwrite existing .grove/config.json")
  .action(
    async (opts: {
      preset?: string;
      dryRun?: boolean;
      yes?: boolean;
      reset?: boolean;
    }) => {
      try {
        const repoPath = await detectRepoRoot();
        await runSetup(repoPath, {
          preset: opts.preset as PresetName | undefined,
          dryRun: opts.dryRun,
          yes: opts.yes,
          reset: opts.reset,
        });
      } catch (err) {
        console.error((err as Error).message);
        process.exit(1);
      }
    },
  );

// Default: TUI mode (no subcommand)
async function main() {
  // If no args, launch TUI
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
