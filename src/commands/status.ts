import Table from "cli-table3";
import chalk from "chalk";
import type { Worktree } from "../types.js";
import { hyperlink } from "../utils/hyperlink.js";

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
