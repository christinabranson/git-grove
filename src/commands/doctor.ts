import { existsSync } from "fs";
import path from "path";
import chalk from "chalk";
import { execa } from "execa";

export interface DoctorCheck {
  name: string;
  ok: boolean;
  optional?: boolean;
  message?: string;
}

export interface DoctorResult {
  ok: boolean;
  checks: DoctorCheck[];
}

async function checkGitRepo(
  cwd: string,
): Promise<{ check: DoctorCheck; repoRoot: string | null }> {
  try {
    const { stdout } = await execa("git", ["rev-parse", "--show-toplevel"], {
      cwd,
    });
    return {
      check: { name: "Git repository detected", ok: true },
      repoRoot: stdout.trim(),
    };
  } catch {
    return {
      check: {
        name: "Git repository detected",
        ok: false,
        message: "Run grove commands from inside a git repository",
      },
      repoRoot: null,
    };
  }
}

function checkGroveDir(repoRoot: string): DoctorCheck {
  const ok = existsSync(path.join(repoRoot, ".grove"));
  return {
    name: ".grove directory exists",
    ok,
    message: ok ? undefined : "Run `grove setup` to initialize",
  };
}

function checkGroveConfig(repoRoot: string): DoctorCheck {
  const ok = existsSync(path.join(repoRoot, ".grove", "config.json"));
  return {
    name: "config.json exists",
    ok,
    message: ok ? undefined : "Run `grove setup` to create it",
  };
}

function checkEnvWorktree(repoRoot: string): DoctorCheck {
  const ok = existsSync(path.join(repoRoot, ".env.worktree"));
  return {
    name: ".env.worktree exists",
    ok,
    optional: true,
    message: ok
      ? undefined
      : "Run `grove start` or `grove setup --refresh-env` to generate it",
  };
}

async function checkWorktreeState(repoRoot: string): Promise<DoctorCheck> {
  try {
    await execa("git", ["worktree", "list"], { cwd: repoRoot });
    return { name: "Git worktree state is valid", ok: true };
  } catch {
    return {
      name: "Git worktree state is valid",
      ok: false,
      message: "git worktree list failed — run `git worktree prune` to repair",
    };
  }
}

export async function runDoctorChecks(cwd: string): Promise<DoctorResult> {
  const checks: DoctorCheck[] = [];

  const { check: gitCheck, repoRoot } = await checkGitRepo(cwd);
  checks.push(gitCheck);

  if (!repoRoot) {
    return { ok: false, checks };
  }

  checks.push(checkGroveDir(repoRoot));
  checks.push(checkGroveConfig(repoRoot));
  checks.push(checkEnvWorktree(repoRoot));

  const worktreeCheck = await checkWorktreeState(repoRoot);
  checks.push(worktreeCheck);

  const ok = checks.every((c) => c.ok || c.optional === true);
  return { ok, checks };
}

export function formatDoctorReport(result: DoctorResult): string {
  const lines = result.checks.map((check) => {
    if (check.ok) {
      return chalk.green("✔") + " " + check.name;
    }
    if (check.optional) {
      const line = chalk.yellow("–") + " " + chalk.gray(check.name);
      return check.message
        ? line + "\n" + chalk.gray(`  → ${check.message}`)
        : line;
    }
    const line = chalk.red("✖") + " " + chalk.bold(check.name);
    return check.message
      ? line + "\n" + chalk.gray(`  → ${check.message}`)
      : line;
  });
  return lines.join("\n");
}

export async function runDoctor(
  cwd: string,
  opts: { json?: boolean } = {},
): Promise<void> {
  const result = await runDoctorChecks(cwd);

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          ok: result.ok,
          checks: result.checks.map(({ name, ok }) => ({ name, ok })),
        },
        null,
        2,
      ),
    );
  } else {
    console.log("\n" + formatDoctorReport(result) + "\n");
  }

  if (!result.ok) {
    process.exit(1);
  }
}
