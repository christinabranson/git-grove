import { existsSync } from "fs";
import { copyFile, readFile } from "fs/promises";
import path from "path";

const USER_ENV_FILE = ".env";
const USER_ENV_EXAMPLE_FILE = ".env.example";
const WORKTREE_ENV_FILE = ".env.worktree";

function parseEnvContent(content: string): Record<string, string> {
  const env: Record<string, string> = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx);
    const value = trimmed.slice(idx + 1);
    env[key] = value;
  }

  return env;
}

async function readEnvFileIfExists(
  worktreePath: string,
  fileName: string,
): Promise<Record<string, string>> {
  const filePath = path.join(worktreePath, fileName);
  if (!existsSync(filePath)) return {};
  const raw = await readFile(filePath, "utf-8");
  return parseEnvContent(raw);
}

function sanitizeShellEnv(shellEnv: NodeJS.ProcessEnv): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(shellEnv)) {
    if (typeof value === "string") result[key] = value;
  }
  return result;
}

export async function bootstrapUserEnvFile(
  worktreePath: string,
): Promise<boolean> {
  const envPath = path.join(worktreePath, USER_ENV_FILE);
  const envExamplePath = path.join(worktreePath, USER_ENV_EXAMPLE_FILE);

  if (existsSync(envPath) || !existsSync(envExamplePath)) {
    return false;
  }

  await copyFile(envExamplePath, envPath);
  return true;
}

export async function readWorktreeEnvFile(
  worktreePath: string,
): Promise<Record<string, string>> {
  return readEnvFileIfExists(worktreePath, WORKTREE_ENV_FILE);
}

export async function buildStartupEnvironment(
  worktreePath: string,
  shellEnv: NodeJS.ProcessEnv = process.env,
): Promise<{
  envExample: Record<string, string>;
  env: Record<string, string>;
  envWorktree: Record<string, string>;
  merged: Record<string, string>;
}> {
  const [envExample, env, envWorktree] = await Promise.all([
    readEnvFileIfExists(worktreePath, USER_ENV_EXAMPLE_FILE),
    readEnvFileIfExists(worktreePath, USER_ENV_FILE),
    readEnvFileIfExists(worktreePath, WORKTREE_ENV_FILE),
  ]);

  // Precedence: shell env > .env.worktree > .env > .env.example
  const merged = {
    ...envExample,
    ...env,
    ...envWorktree,
    ...sanitizeShellEnv(shellEnv),
  };

  return {
    envExample,
    env,
    envWorktree,
    merged,
  };
}
