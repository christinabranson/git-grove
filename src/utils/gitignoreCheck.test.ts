import { vi, describe, test, expect, beforeEach, afterEach } from "vitest";

vi.mock("execa", () => ({ execa: vi.fn() }));

import { execa } from "execa";
import type { MockedFunction } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "fs/promises";
import path from "path";
import os from "os";
import { warnIfNotGitignored } from "./gitignoreCheck.js";

const mockedExeca = execa as MockedFunction<typeof execa>;

let tmpDir: string;
let repoPath: string;
let stderrOutput: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "grove-gitignore-test-"));
  repoPath = path.join(tmpDir, "repo");
  await mkdir(repoPath);
  stderrOutput = "";
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderrOutput += chunk;
    return true;
  });
  mockedExeca.mockRejectedValue(new Error("no global gitignore"));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(tmpDir, { recursive: true, force: true });
});

async function writeLocalGitignore(patterns: string[]): Promise<void> {
  await writeFile(
    path.join(repoPath, ".gitignore"),
    patterns.join("\n") + "\n",
    "utf-8",
  );
}

async function writeGlobalGitignore(patterns: string[]): Promise<string> {
  const globalPath = path.join(tmpDir, ".gitignore_global");
  await writeFile(globalPath, patterns.join("\n") + "\n", "utf-8");
  return globalPath;
}

describe("warnIfNotGitignored", () => {
  test("warns about both files when no .gitignore exists", async () => {
    await warnIfNotGitignored(repoPath);
    expect(stderrOutput).toContain(".env.worktree");
    expect(stderrOutput).toContain(".grove/active-worktree.json");
  });

  test("no warning when all files are in local .gitignore", async () => {
    await writeLocalGitignore([".env.worktree", ".grove/active-worktree.json"]);
    await warnIfNotGitignored(repoPath);
    expect(stderrOutput).toBe("");
  });

  test("no warning when all files are covered by global .gitignore", async () => {
    const globalPath = await writeGlobalGitignore([
      ".env.worktree",
      ".grove/active-worktree.json",
    ]);
    mockedExeca.mockResolvedValue({
      stdout: globalPath,
    } as ReturnType<typeof execa>);
    await warnIfNotGitignored(repoPath);
    expect(stderrOutput).toBe("");
  });

  test("only warns about files missing from both local and global", async () => {
    await writeLocalGitignore([".env.worktree"]);
    const globalPath = await writeGlobalGitignore(["# no grove entries"]);
    mockedExeca.mockResolvedValue({
      stdout: globalPath,
    } as ReturnType<typeof execa>);
    await warnIfNotGitignored(repoPath);
    expect(stderrOutput).toContain(".grove/active-worktree.json");
    expect(stderrOutput).not.toContain(".env.worktree");
  });

  test("no warning when split across local and global", async () => {
    await writeLocalGitignore([".env.worktree"]);
    const globalPath = await writeGlobalGitignore([
      ".grove/active-worktree.json",
    ]);
    mockedExeca.mockResolvedValue({
      stdout: globalPath,
    } as ReturnType<typeof execa>);
    await warnIfNotGitignored(repoPath);
    expect(stderrOutput).toBe("");
  });

  test("expands ~ in global gitignore path", async () => {
    const homeRelPath = ".grove-gitignore-test-tmp";
    const homeAbsPath = path.join(os.homedir(), homeRelPath);
    await writeFile(
      homeAbsPath,
      [".env.worktree", ".grove/active-worktree.json"].join("\n") + "\n",
      "utf-8",
    );
    try {
      mockedExeca.mockResolvedValue({
        stdout: `~/${homeRelPath}`,
      } as ReturnType<typeof execa>);
      await warnIfNotGitignored(repoPath);
      expect(stderrOutput).toBe("");
    } finally {
      await rm(homeAbsPath, { force: true });
    }
  });

  test("silently ignores git config failure and falls back to local only", async () => {
    mockedExeca.mockRejectedValue(new Error("git not found"));
    await writeLocalGitignore([".env.worktree", ".grove/active-worktree.json"]);
    await warnIfNotGitignored(repoPath);
    expect(stderrOutput).toBe("");
  });

  test("no warning when .grove directory is gitignored", async () => {
    await writeLocalGitignore([".env.worktree", ".grove"]);
    await warnIfNotGitignored(repoPath);
    expect(stderrOutput).toBe("");
  });

  test("no warning when .grove/ (trailing slash) is gitignored", async () => {
    await writeLocalGitignore([".env.worktree", ".grove/"]);
    await warnIfNotGitignored(repoPath);
    expect(stderrOutput).toBe("");
  });

  test("warning message suggests global gitignore first", async () => {
    await warnIfNotGitignored(repoPath);
    expect(stderrOutput).toContain("global .gitignore");
  });
});
