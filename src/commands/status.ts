import Table from "cli-table3";
import chalk from "chalk";
import type { Worktree } from "../types.js";
import { hyperlink } from "../utils/hyperlink.js";
import { loadWorktrees } from "../data/worktrees.js";
import { discoverProvider } from "../providers/index.js";

function dockerCell(worktree: Worktree): string {
  if (!worktree.docker) return chalk.gray("-");
  const { state, webPort, localstackPort } = worktree.docker;
  const urls = [
    webPort ? chalk.cyan(`http://localhost:${webPort}`) : null,
    localstackPort ? chalk.cyan(`http://localhost:${localstackPort}`) : null,
  ]
    .filter(Boolean)
    .join("  ");

  switch (state) {
    case "running":
      return chalk.green("● running") + (urls ? `  ${urls}` : "");
    case "partial":
      return chalk.yellow("◐ partial") + (urls ? `  ${urls}` : "");
    case "stopped":
      return chalk.gray("■ stopped");
    case "not started":
      return chalk.gray("-");
  }
}

function prCell(worktree: Worktree): string {
  if (!worktree.pr) return chalk.gray("-");
  const { number, url, approvals, reviewRequested } = worktree.pr;
  let label = chalk.cyan(hyperlink(`PR #${number}`, url));
  if (approvals > 0) label += chalk.green(` ✓${approvals}`);
  if (reviewRequested) label += chalk.yellow(" review requested");
  return label;
}

function changesCell(worktree: Worktree): string {
  if (!worktree.changeFootprint) return chalk.gray("clean");
  const n = worktree.changeFootprint.totalFiles;
  return chalk.yellow(`+${n} file${n === 1 ? "" : "s"}`);
}

export async function runStatus(
  repoPath: string,
  env?: string,
  opts: { json?: boolean } = {},
): Promise<void> {
  if (opts.json && env) {
    const { worktrees: wtList } = await loadWorktrees(repoPath);
    const wt = wtList.find(
      (w) => w.branch === env || w.branch.endsWith(`/${env}`),
    );
    if (!wt) {
      throw new Error(`no worktree found for: ${env}`);
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
}

export function printStatus(worktrees: Worktree[]): void {
  const table = new Table({
    head: [
      chalk.bold("branch"),
      chalk.bold("docker"),
      chalk.bold("pr"),
      chalk.bold("changes"),
    ],
    style: { head: [], border: ["gray"] },
    chars: {
      top: "─",
      "top-mid": "┬",
      "top-left": "┌",
      "top-right": "┐",
      bottom: "─",
      "bottom-mid": "┴",
      "bottom-left": "└",
      "bottom-right": "┘",
      left: "│",
      "left-mid": "├",
      mid: "─",
      "mid-mid": "┼",
      right: "│",
      "right-mid": "┤",
      middle: "│",
    },
  });

  for (const wt of worktrees) {
    const shortPath = wt.path.replace(process.env.HOME ?? "", "~");
    const branchLabel =
      (wt.isMain
        ? chalk.blue(wt.branch) + chalk.gray(" (main)")
        : chalk.white(wt.branch)) +
      (wt.isCurrent ? chalk.cyan(" ◀ current") : "") +
      (wt.baseBranch && !wt.isMain
        ? "\n" + chalk.gray(`  off ${wt.baseBranch}`)
        : "") +
      "\n" +
      chalk.gray(`  ${shortPath}`);

    table.push([branchLabel, dockerCell(wt), prCell(wt), changesCell(wt)]);
  }

  console.log(
    "\n" + chalk.bold.cyan("grove") + chalk.gray(" · worktree status\n"),
  );
  console.log(table.toString());
  console.log();
}
