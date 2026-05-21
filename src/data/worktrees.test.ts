import { vi, describe, test, expect, beforeEach } from "vitest";
import type { MockedFunction } from "vitest";

vi.mock("execa", () => ({ execa: vi.fn() }));
vi.mock("fs", () => ({ existsSync: vi.fn().mockReturnValue(false) }));
vi.mock("fs/promises", () => ({
  readFile: vi.fn(),
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

import { execa } from "execa";
import { existsSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import {
  resolveWorktreeRoot,
  detectRepoRoot,
  loadWorktrees,
  detectDefaultBranch,
  createWorktreeWithBase,
} from "./worktrees.js";

const mockedExeca = execa as MockedFunction<typeof execa>;
const mockedExistsSync = existsSync as MockedFunction<typeof existsSync>;
const mockedMkdir = mkdir as MockedFunction<typeof mkdir>;
const mockedWriteFile = writeFile as MockedFunction<typeof writeFile>;

beforeEach(() => {
  vi.clearAllMocks();
  mockedExistsSync.mockReturnValue(false);
  delete process.env.GROVE_WORKTREE_ROOT;
});

describe("resolveWorktreeRoot", () => {
  test("uses GROVE_WORKTREE_ROOT env var when set", () => {
    process.env.GROVE_WORKTREE_ROOT = "/custom/worktrees";
    expect(resolveWorktreeRoot("/repo/my-project")).toBe("/custom/worktrees");
    delete process.env.GROVE_WORKTREE_ROOT;
  });

  test("uses configRoot when provided and no env var", () => {
    expect(resolveWorktreeRoot("/repo/my-project", "/configured/path")).toBe(
      "/configured/path",
    );
  });

  test("defaults to sibling directory with -worktrees suffix", () => {
    expect(resolveWorktreeRoot("/parent/my-project")).toBe(
      "/parent/my-project-worktrees",
    );
  });

  test("env var takes priority over configRoot", () => {
    process.env.GROVE_WORKTREE_ROOT = "/env/path";
    expect(resolveWorktreeRoot("/repo", "/config/path")).toBe("/env/path");
    delete process.env.GROVE_WORKTREE_ROOT;
  });

  test("handles deeply nested repo paths", () => {
    expect(resolveWorktreeRoot("/a/b/c/my-repo")).toBe(
      "/a/b/c/my-repo-worktrees",
    );
  });
});

describe("detectRepoRoot", () => {
  test("returns the repo root from git rev-parse", async () => {
    mockedExeca.mockResolvedValueOnce({
      stdout: "/path/to/repo\n",
    } as ReturnType<typeof execa>);
    const result = await detectRepoRoot();
    expect(result).toBe("/path/to/repo");
  });

  test("throws when not inside a git repository", async () => {
    mockedExeca.mockRejectedValueOnce(new Error("not a git repository"));
    await expect(detectRepoRoot()).rejects.toThrow(
      "Not inside a git repository",
    );
  });

  test("trims whitespace from git output", async () => {
    mockedExeca.mockResolvedValueOnce({
      stdout: "  /path/to/repo  \n",
    } as ReturnType<typeof execa>);
    const result = await detectRepoRoot();
    expect(result).toBe("/path/to/repo");
  });
});

// Porcelain output format used by git worktree list --porcelain
const makePortcelain = (
  worktrees: Array<{ path: string; head: string; branch: string }>,
) =>
  worktrees
    .map(
      (wt) =>
        `worktree ${wt.path}\nHEAD ${wt.head}\nbranch refs/heads/${wt.branch}`,
    )
    .join("\n\n");

describe("loadWorktrees", () => {
  beforeEach(() => {
    // Default: all git sub-commands return empty results; gh is unavailable
    mockedExeca.mockImplementation(async (cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "worktree") {
        return {
          stdout: makePortcelain([
            { path: "/repo/main", head: "abc123", branch: "main" },
            { path: "/repo/feature", head: "def456", branch: "feature-auth" },
          ]),
        } as ReturnType<typeof execa>;
      }
      if (cmd === "git" && args[0] === "diff")
        return { stdout: "" } as ReturnType<typeof execa>;
      if (cmd === "git" && args[0] === "status")
        return { stdout: "" } as ReturnType<typeof execa>;
      if (cmd === "git" && args[0] === "rev-parse")
        throw new Error("no upstream");
      if (cmd === "docker") throw new Error("no docker");
      if (cmd === "gh") throw new Error("no gh");
      return { stdout: "" } as ReturnType<typeof execa>;
    });
  });

  test("returns a worktree for each entry in git worktree list", async () => {
    const { worktrees } = await loadWorktrees("/repo");
    expect(worktrees).toHaveLength(2);
  });

  test("sets isMain=true for the first worktree", async () => {
    const { worktrees } = await loadWorktrees("/repo");
    expect(worktrees[0].isMain).toBe(true);
    expect(worktrees[1].isMain).toBe(false);
  });

  test("populates branch from git output", async () => {
    const { worktrees } = await loadWorktrees("/repo");
    expect(worktrees[0].branch).toBe("main");
    expect(worktrees[1].branch).toBe("feature-auth");
  });

  test("populates path from git output", async () => {
    const { worktrees } = await loadWorktrees("/repo");
    expect(worktrees[0].path).toBe("/repo/main");
    expect(worktrees[1].path).toBe("/repo/feature");
  });

  test("populates head from git output", async () => {
    const { worktrees } = await loadWorktrees("/repo");
    expect(worktrees[0].head).toBe("abc123");
  });

  test("sets changeFootprint=null when no git changes", async () => {
    const { worktrees } = await loadWorktrees("/repo");
    expect(worktrees[0].changeFootprint).toBeNull();
  });

  test("sets docker=null when no .env.worktree exists", async () => {
    const { worktrees } = await loadWorktrees("/repo");
    expect(worktrees[0].docker).toBeNull();
  });

  test("sets baseBranch=null when no upstream is configured", async () => {
    const { worktrees } = await loadWorktrees("/repo");
    expect(worktrees[0].baseBranch).toBeNull();
  });

  test("handles detached HEAD worktrees", async () => {
    mockedExeca.mockImplementation(async (cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "worktree") {
        return {
          stdout:
            "worktree /repo/main\nHEAD abc123\nbranch refs/heads/main\n\nworktree /repo/detached\nHEAD xyz789\ndetached",
        } as ReturnType<typeof execa>;
      }
      if (cmd === "git") throw new Error("no upstream");
      return { stdout: "" } as ReturnType<typeof execa>;
    });

    const { worktrees } = await loadWorktrees("/repo");
    const detached = worktrees.find((wt) => wt.path === "/repo/detached");
    expect(detached?.branch).toBe("(detached)");
  });

  test("skips bare worktrees", async () => {
    mockedExeca.mockImplementation(async (cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "worktree") {
        return {
          stdout:
            "worktree /repo/main\nHEAD abc123\nbranch refs/heads/main\n\nworktree /repo/bare\nHEAD xyz789\nbranch refs/heads/main\nbare",
        } as ReturnType<typeof execa>;
      }
      if (cmd === "git") throw new Error("no upstream");
      return { stdout: "" } as ReturnType<typeof execa>;
    });

    const { worktrees } = await loadWorktrees("/repo");
    expect(worktrees).toHaveLength(1);
    expect(worktrees[0].path).toBe("/repo/main");
  });

  test("sets baseBranch from upstream tracking branch", async () => {
    mockedExeca.mockImplementation(async (cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "worktree") {
        return {
          stdout: makePortcelain([
            { path: "/repo/feature", head: "def456", branch: "feature" },
          ]),
        } as ReturnType<typeof execa>;
      }
      if (cmd === "git" && args[0] === "rev-parse") {
        return { stdout: "origin/main" } as ReturnType<typeof execa>;
      }
      if (cmd === "git") return { stdout: "" } as ReturnType<typeof execa>;
      if (cmd === "docker") throw new Error("no docker");
      return { stdout: "" } as ReturnType<typeof execa>;
    });

    const { worktrees } = await loadWorktrees("/repo");
    // "origin/main" upstream → baseBranch should be "main" (strips remote prefix)
    expect(worktrees[0].baseBranch).toBe("main");
  });

  test("sets isCurrent=true when cwd matches the worktree path exactly", async () => {
    vi.spyOn(process, "cwd").mockReturnValue("/repo/main");
    const { worktrees } = await loadWorktrees("/repo");
    expect(worktrees[0].isCurrent).toBe(true);
    expect(worktrees[1].isCurrent).toBe(false);
    vi.restoreAllMocks();
  });

  test("sets isCurrent=true when cwd is a subdirectory of the worktree path", async () => {
    vi.spyOn(process, "cwd").mockReturnValue("/repo/feature/src/components");
    const { worktrees } = await loadWorktrees("/repo");
    expect(worktrees[1].isCurrent).toBe(true);
    expect(worktrees[0].isCurrent).toBe(false);
    vi.restoreAllMocks();
  });

  test("sets isCurrent=false for all worktrees when cwd is unrelated", async () => {
    vi.spyOn(process, "cwd").mockReturnValue("/some/other/directory");
    const { worktrees } = await loadWorktrees("/repo");
    expect(worktrees.every((wt) => !wt.isCurrent)).toBe(true);
    vi.restoreAllMocks();
  });

  test("sets isCurrent=false for all worktrees when cwd throws", async () => {
    vi.spyOn(process, "cwd").mockImplementation(() => {
      throw new Error("no such file or directory");
    });
    const { worktrees } = await loadWorktrees("/repo");
    expect(worktrees.every((wt) => !wt.isCurrent)).toBe(true);
    vi.restoreAllMocks();
  });

  test("populates changeFootprint when git diff returns output", async () => {
    mockedExeca.mockImplementation(async (cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "worktree") {
        return {
          stdout: makePortcelain([
            { path: "/repo/main", head: "abc123", branch: "main" },
          ]),
        } as ReturnType<typeof execa>;
      }
      if (cmd === "git" && args[0] === "diff") {
        return {
          stdout:
            " src/auth/login.ts | 12 +++++------\n 1 file changed, 6 insertions(+), 6 deletions(-)",
        } as ReturnType<typeof execa>;
      }
      if (cmd === "git" && args[0] === "status")
        return { stdout: "" } as ReturnType<typeof execa>;
      if (cmd === "git") throw new Error("no upstream");
      if (cmd === "docker") throw new Error("no docker");
      return { stdout: "" } as ReturnType<typeof execa>;
    });

    const { worktrees } = await loadWorktrees("/repo");
    expect(worktrees[0].changeFootprint).not.toBeNull();
    expect(worktrees[0].changeFootprint?.totalFiles).toBeGreaterThan(0);
  });
});

describe("detectDefaultBranch", () => {
  test("returns develop when origin/HEAD points at origin/develop", async () => {
    mockedExeca.mockResolvedValueOnce({
      stdout: "origin/develop\n",
    } as ReturnType<typeof execa>); // symbolic-ref succeeds
    mockedExeca.mockResolvedValueOnce({ stdout: "abc123" } as ReturnType<
      typeof execa
    >); // local "develop" exists
    expect(await detectDefaultBranch("/repo")).toBe("develop");
  });

  test("returns short branch name from origin/HEAD when local branch exists", async () => {
    mockedExeca.mockResolvedValueOnce({
      stdout: "origin/main\n",
    } as ReturnType<typeof execa>); // symbolic-ref succeeds
    mockedExeca.mockResolvedValueOnce({ stdout: "abc123" } as ReturnType<
      typeof execa
    >); // local "main" exists
    expect(await detectDefaultBranch("/repo")).toBe("main");
  });

  test("returns full remote ref from origin/HEAD when local branch is absent", async () => {
    mockedExeca.mockResolvedValueOnce({
      stdout: "origin/main\n",
    } as ReturnType<typeof execa>); // symbolic-ref succeeds
    mockedExeca.mockRejectedValueOnce(new Error("no local main")); // local "main" absent
    expect(await detectDefaultBranch("/repo")).toBe("origin/main");
  });

  test("falls back to local main when origin/HEAD not configured", async () => {
    mockedExeca.mockRejectedValueOnce(new Error("no origin/HEAD"));
    mockedExeca.mockResolvedValueOnce({ stdout: "" } as ReturnType<
      typeof execa
    >); // local "main" exists
    expect(await detectDefaultBranch("/repo")).toBe("main");
  });

  test("falls back to origin/main ref when local main is absent", async () => {
    mockedExeca.mockRejectedValueOnce(new Error("no origin/HEAD"));
    mockedExeca.mockRejectedValueOnce(new Error("no local main"));
    mockedExeca.mockResolvedValueOnce({ stdout: "" } as ReturnType<
      typeof execa
    >); // origin/main exists
    expect(await detectDefaultBranch("/repo")).toBe("origin/main");
  });

  test("falls back to local master when main is absent in both local and remote", async () => {
    mockedExeca.mockRejectedValueOnce(new Error("no origin/HEAD"));
    mockedExeca.mockRejectedValueOnce(new Error("no local main"));
    mockedExeca.mockRejectedValueOnce(new Error("no origin/main"));
    mockedExeca.mockResolvedValueOnce({ stdout: "" } as ReturnType<
      typeof execa
    >); // local "master" exists
    expect(await detectDefaultBranch("/repo")).toBe("master");
  });

  test("throws when no default branch can be detected", async () => {
    mockedExeca.mockRejectedValue(new Error("not found"));
    await expect(detectDefaultBranch("/repo")).rejects.toThrow(
      "Unable to detect the default branch",
    );
  });
});

describe("createWorktreeWithBase", () => {
  test("runs git worktree add with correct arguments", async () => {
    mockedExeca.mockResolvedValue({ stdout: "" } as ReturnType<typeof execa>);
    await createWorktreeWithBase(
      "/repo",
      "feature-foo",
      "/worktrees/feature-foo",
      "main",
    );
    expect(mockedExeca).toHaveBeenCalledWith(
      "git",
      [
        "worktree",
        "add",
        "-b",
        "feature-foo",
        "/worktrees/feature-foo",
        "main",
      ],
      { cwd: "/repo" },
    );
  });

  test("writes .grove/active-worktree.json with the base branch", async () => {
    mockedExeca.mockResolvedValue({ stdout: "" } as ReturnType<typeof execa>);
    await createWorktreeWithBase(
      "/repo",
      "feature-foo",
      "/worktrees/feature-foo",
      "main",
    );
    expect(mockedMkdir).toHaveBeenCalledWith("/worktrees/feature-foo/.grove", {
      recursive: true,
    });
    expect(mockedWriteFile).toHaveBeenCalledWith(
      "/worktrees/feature-foo/.grove/active-worktree.json",
      JSON.stringify({ baseBranch: "main" }, null, 2),
    );
  });
});
