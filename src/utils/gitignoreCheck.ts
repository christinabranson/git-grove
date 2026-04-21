import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import chalk from 'chalk';

const SHOULD_BE_GITIGNORED = ['.env.worktree', '.worktree-manifest.json', '.grove/meta.json'];

export async function warnIfNotGitignored(repoPath: string): Promise<void> {
  const gitignorePath = path.join(repoPath, '.gitignore');

  let patterns: string[] = [];
  if (existsSync(gitignorePath)) {
    const content = await readFile(gitignorePath, 'utf-8');
    patterns = content
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
  }

  const missing = SHOULD_BE_GITIGNORED.filter((file) => !patterns.some((p) => p === file || file.endsWith(`/${p}`) || p === `**/${file}`));

  if (missing.length > 0) {
    process.stderr.write(
      chalk.yellow('\n  ⚠  grove: these files should be in .gitignore but are not:\n'),
    );
    for (const f of missing) {
      process.stderr.write(chalk.yellow(`       ${f}\n`));
    }
    process.stderr.write(
      chalk.gray('     Run `grove setup` or add them manually to .gitignore.\n\n'),
    );
  }
}
