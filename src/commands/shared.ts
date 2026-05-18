import chalk from "chalk";
import { loadGroveConfig } from "../data/groveConfig.js";
import {
  resolveSharedStack,
  getSharedStackState,
  sharedUp,
  sharedDown,
  DEFAULT_SHARED_COMPOSE_FILE,
} from "../providers/shared.js";
import { warnIfHardcodedComposePorts } from "../utils/hardcodedPortsCheck.js";

export async function runSharedUp(repoPath: string): Promise<void> {
  const config = await loadGroveConfig(repoPath);
  await warnIfHardcodedComposePorts(repoPath, [
    config?.sharedComposeFile ?? DEFAULT_SHARED_COMPOSE_FILE,
  ]);
  const info = resolveSharedStack(repoPath, config);
  if (!info) {
    throw new Error(
      "No shared stack configured. Add naming.sharedProject to .grove/config.json.",
    );
  }
  if (!info.exists) {
    throw new Error(`Shared compose file not found: ${info.composeFilePath}`);
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
}

export async function runSharedDown(repoPath: string): Promise<void> {
  const config = await loadGroveConfig(repoPath);
  const info = resolveSharedStack(repoPath, config);
  if (!info) {
    throw new Error("No shared stack configured.");
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
}

export async function runSharedStatus(repoPath: string): Promise<void> {
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
}
