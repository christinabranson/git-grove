import { cp, mkdir, mkdtemp, rm, readFile, readdir } from "fs/promises";
import path from "path";
import os from "os";
import { execa } from "execa";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PROJECT_ROOT = path.resolve(__dirname, "../..");
const EXAMPLES_DIR = path.join(PROJECT_ROOT, "examples");
export const CLI_BIN = path.join(PROJECT_ROOT, "dist", "cli.js");

export interface TempRepo {
  repoPath: string;
  groveHome: string;
  cleanup: () => Promise<void>;
}

export interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Copy an example template into a temp directory whose basename matches the
 * example name (so `detectProject` derives a predictable project name), then
 * initialise it as a git repo on branch `main`.
 */
export async function createTempExampleRepo(
  exampleName: string,
): Promise<TempRepo> {
  const parentDir = await mkdtemp(path.join(os.tmpdir(), "grove-e2e-"));
  const repoPath = path.join(parentDir, exampleName);
  const groveHome = path.join(parentDir, ".grove-home");
  await mkdir(repoPath);
  await mkdir(groveHome);

  const templateDir = path.join(EXAMPLES_DIR, exampleName, "template");
  await cp(templateDir, repoPath, { recursive: true });

  await execa("git", ["init"], { cwd: repoPath });
  // Set HEAD to main without requiring the branch to exist yet
  await execa("git", ["symbolic-ref", "HEAD", "refs/heads/main"], {
    cwd: repoPath,
  });
  await execa("git", ["config", "user.email", "test@grove.local"], {
    cwd: repoPath,
  });
  await execa("git", ["config", "user.name", "Grove Test"], { cwd: repoPath });
  await execa("git", ["add", "-A"], { cwd: repoPath });
  await execa("git", ["commit", "-m", "initial commit"], { cwd: repoPath });

  return {
    repoPath,
    groveHome,
    cleanup: () => rm(parentDir, { recursive: true, force: true }),
  };
}

async function runGroveCli(
  repo: TempRepo,
  command: string,
  extraArgs: string[] = [],
): Promise<CliResult> {
  try {
    const result = await execa("node", [CLI_BIN, command, ...extraArgs], {
      cwd: repo.repoPath,
      env: { ...process.env, GROVE_HOME: repo.groveHome },
    });
    return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; exitCode?: number };
    return {
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
      exitCode: e.exitCode ?? 1,
    };
  }
}

export function runGroveSetup(
  repo: TempRepo,
  extraArgs: string[] = [],
): Promise<CliResult> {
  return runGroveCli(repo, "setup", ["--yes", ...extraArgs]);
}

export function runGroveDoctor(
  repo: TempRepo,
  extraArgs: string[] = [],
): Promise<CliResult> {
  return runGroveCli(repo, "doctor", extraArgs);
}

export function runGroveConfig(
  repo: TempRepo,
  args: string[] = [],
): Promise<CliResult> {
  return runGroveCli(repo, "config", args);
}

/**
 * Read the grove config JSON from GROVE_HOME. Assumes exactly one repo has
 * been configured (which is true in isolated e2e tests).
 */
export async function readGroveConfigJson(
  repo: TempRepo,
): Promise<Record<string, unknown>> {
  const reposDir = path.join(repo.groveHome, "repos");
  const entries = await readdir(reposDir);
  const configPath = path.join(reposDir, entries[0], "config.json");
  return JSON.parse(await readFile(configPath, "utf-8"));
}

export async function readGeneratedFile(
  repoPath: string,
  relPath: string,
): Promise<string> {
  return readFile(path.join(repoPath, relPath), "utf-8");
}

export async function readExpectedFile(
  exampleName: string,
  relPath: string,
): Promise<string> {
  return readFile(
    path.join(EXAMPLES_DIR, exampleName, "expected", relPath),
    "utf-8",
  );
}
