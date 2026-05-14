import chalk from "chalk";
import { existsSync } from "fs";
import { readFile } from "fs/promises";
import path from "path";

const DEFAULT_COMPOSE_FILES = [
  "docker-compose.yml",
  "docker-compose.yaml",
  "compose.yml",
  "compose.yaml",
];

const SHORT_SYNTAX_PORT_RE =
  /^\s*-\s*["']?(?:(?:\d{1,3}\.){3}\d{1,3}:)?\d{2,5}:\d{2,5}(?:\/(?:tcp|udp))?["']?\s*(?:#.*)?$/;
const LONG_SYNTAX_PUBLISHED_RE = /^\s*published\s*:\s*\d{2,5}\s*(?:#.*)?$/;

export interface HardcodedPortFinding {
  file: string;
  line: number;
  text: string;
}

function isHardcodedPortLine(line: string): boolean {
  if (line.includes("${")) return false;
  return SHORT_SYNTAX_PORT_RE.test(line) || LONG_SYNTAX_PUBLISHED_RE.test(line);
}

function buildCandidateFiles(
  repoPath: string,
  extraComposeFiles: string[] = [],
): string[] {
  const candidates = new Set<string>(
    DEFAULT_COMPOSE_FILES.map((f) => path.join(repoPath, f)),
  );

  for (const extraFile of extraComposeFiles) {
    const abs = path.isAbsolute(extraFile)
      ? extraFile
      : path.join(repoPath, extraFile);
    candidates.add(abs);
  }

  return [...candidates];
}

export async function findHardcodedComposePortFindings(
  repoPath: string,
  extraComposeFiles: string[] = [],
): Promise<HardcodedPortFinding[]> {
  const findings: HardcodedPortFinding[] = [];
  const candidates = buildCandidateFiles(repoPath, extraComposeFiles);

  for (const file of candidates) {
    if (!existsSync(file)) continue;

    const raw = await readFile(file, "utf-8");
    const lines = raw.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!isHardcodedPortLine(line)) continue;
      findings.push({
        file: path.relative(repoPath, file),
        line: i + 1,
        text: line.trim(),
      });
    }
  }

  return findings;
}

export async function warnIfHardcodedComposePorts(
  repoPath: string,
  extraComposeFiles: string[] = [],
): Promise<void> {
  const findings = await findHardcodedComposePortFindings(
    repoPath,
    extraComposeFiles,
  );
  if (findings.length === 0) return;

  process.stderr.write(
    chalk.yellow(
      "\n  ⚠  grove: likely hardcoded host ports found in compose files.\n",
    ),
  );

  for (const finding of findings.slice(0, 6)) {
    process.stderr.write(
      chalk.gray(`     ${finding.file}:${finding.line}  ${finding.text}\n`),
    );
  }

  if (findings.length > 6) {
    process.stderr.write(
      chalk.gray(`     ...and ${findings.length - 6} more\n`),
    );
  }

  process.stderr.write(
    chalk.gray(
      "     Prefer env-based mappings (e.g. ${DB_PORT:-5432}:5432) to avoid branch collisions.\n\n",
    ),
  );
}
