import chalk from "chalk";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { existsSync } from "fs";
import {
  getConfigValue,
  setConfigValue,
  loadUserRepoConfig,
  flattenConfig,
  getRepoId,
  getRepoConfigPath,
  getGroveHome,
} from "../data/userConfig.js";
import { readEnvFile } from "../providers/docker-compose-contract.js";
import { openInEditor } from "../tui/editor.js";

export async function runConfigGet(
  repoPath: string,
  keyPath: string,
): Promise<void> {
  const value = await getConfigValue(repoPath, keyPath);
  if (value === undefined) {
    console.error(chalk.yellow(`No config value for: ${keyPath}`));
    process.exit(1);
  }
  console.log(typeof value === "string" ? value : JSON.stringify(value));
}

export async function runConfigSet(
  repoPath: string,
  keyPath: string,
  rawValue: string,
): Promise<void> {
  const { configPath } = await setConfigValue(repoPath, keyPath, rawValue);
  const rel = path.relative(path.join(getGroveHome()), configPath);
  console.log(chalk.green(`✓`) + ` ${keyPath} saved to ~/.grove/${rel}`);
}

export async function runConfigList(
  repoPath: string,
  worktreePath?: string,
): Promise<void> {
  const repoId = await getRepoId(repoPath);
  const configPath = getRepoConfigPath(repoId);
  const config = await loadUserRepoConfig(repoPath);

  console.log(chalk.bold("\nGrove config"));
  console.log(chalk.gray(`  ${configPath}\n`));

  if (!config) {
    console.log(
      chalk.yellow(
        "  No config found. Run `grove setup` or `grove config set` to configure.",
      ),
    );
  } else {
    const entries = flattenConfig(config as unknown as Record<string, unknown>);
    const maxLen = Math.max(...entries.map(([k]) => k.length), 0);
    console.log(chalk.dim("Repo config:"));
    for (const [key, value] of entries) {
      console.log(`  ${key.padEnd(maxLen + 2)}${chalk.cyan(value)}`);
    }
  }

  const wtPath = worktreePath ?? repoPath;
  const envVars = await readEnvFile(wtPath);
  if (Object.keys(envVars).length > 0) {
    const maxLen = Math.max(...Object.keys(envVars).map((k) => k.length), 0);
    console.log("");
    console.log(chalk.dim("Current worktree (.env.worktree):"));
    for (const [key, value] of Object.entries(envVars)) {
      console.log(`  ${key.padEnd(maxLen + 2)}${chalk.cyan(value)}`);
    }
  }

  console.log("");
}

export async function runConfigOpen(repoPath: string): Promise<void> {
  const repoId = await getRepoId(repoPath);
  const configPath = getRepoConfigPath(repoId);

  if (!existsSync(configPath)) {
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, "{}\n", "utf-8");
  }

  const editor = (await getConfigValue(repoPath, "editor")) as
    | string
    | undefined;
  const displayName = await openInEditor(configPath, editor);
  console.log(chalk.green(`✓`) + ` Opened config in ${displayName}`);
}
