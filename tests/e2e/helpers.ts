import { cp, mkdir, mkdtemp, rm, readFile } from "fs/promises";
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
  await mkdir(repoPath);

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
    cleanup: () => rm(parentDir, { recursive: true, force: true }),
  };
}

async function runGroveCli(
  repoPath: string,
  command: string,
  extraArgs: string[] = [],
): Promise<CliResult> {
  try {
    const result = await execa("node", [CLI_BIN, command, ...extraArgs], {
      cwd: repoPath,
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
  repoPath: string,
  extraArgs: string[] = [],
): Promise<CliResult> {
  return runGroveCli(repoPath, "setup", ["--yes", ...extraArgs]);
}

export function runGroveDoctor(
  repoPath: string,
  extraArgs: string[] = [],
): Promise<CliResult> {
  return runGroveCli(repoPath, "doctor", extraArgs);
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
