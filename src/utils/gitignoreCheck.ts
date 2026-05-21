import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import os from "os";
import chalk from "chalk";
import { execa } from "execa";

const SHOULD_BE_GITIGNORED = [".env.worktree", ".grove/active-worktree.json"];

async function readPatterns(filePath: string): Promise<string[]> {
  if (!existsSync(filePath)) return [];
  const content = await readFile(filePath, "utf-8");
  return content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

async function resolveGlobalGitignore(): Promise<string | null> {
  try {
    const { stdout } = await execa("git", [
      "config",
      "--global",
      "core.excludesfile",
    ]);
    const raw = stdout.trim();
    if (!raw) return null;
    return raw.startsWith("~") ? path.join(os.homedir(), raw.slice(1)) : raw;
  } catch {
    return null;
  }
}

function isIgnored(file: string, patterns: string[]): boolean {
  return patterns.some((p) => {
    const normalized = p.replace(/\/$/, "");
    return (
      p === file ||
      file.endsWith(`/${p}`) ||
      p === `**/${file}` ||
      file.startsWith(`${normalized}/`) ||
      file === normalized
    );
  });
}

export async function warnIfNotGitignored(repoPath: string): Promise<void> {
  const [localPatterns, globalGitignorePath] = await Promise.all([
    readPatterns(path.join(repoPath, ".gitignore")),
    resolveGlobalGitignore(),
  ]);
  const globalPatterns = globalGitignorePath
    ? await readPatterns(globalGitignorePath)
    : [];
  const allPatterns = [...localPatterns, ...globalPatterns];

  const missing = SHOULD_BE_GITIGNORED.filter(
    (file) => !isIgnored(file, allPatterns),
  );

  if (missing.length > 0) {
    process.stderr.write(
      chalk.yellow(
        "\n  ⚠  grove: these files should be in .gitignore but are not:\n",
      ),
    );
    for (const f of missing) {
      process.stderr.write(chalk.yellow(`       ${f}\n`));
    }
    process.stderr.write(
      chalk.gray(
        "     Add them to your global .gitignore (~/.gitignore_global) or the repo's .gitignore.\n\n",
      ),
    );
  }
}
