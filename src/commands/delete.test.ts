import { vi, describe, test, expect, beforeEach } from "vitest";

vi.mock("execa", () => ({ execa: vi.fn() }));
vi.mock("../data/worktrees.js");

import { execa } from "execa";
import type { MockedFunction } from "vitest";
import { loadWorktrees } from "../data/worktrees.js";
import { runDelete } from "./delete.js";
import type { Worktree, DockerInfo } from "../types.js";

const mockedExeca = execa as MockedFunction<typeof execa>;

function makeWorktree(overrides: Partial<Worktree> = {}): Worktree {
  return {
    path: "/worktrees/feature",
    branch: "feature",
    baseBranch: null,
    isMain: false,
    isCurrent: false,
    head: "abc123",
    docker: null,
    changeFootprint: null,
    pr: null,
    ...overrides,
  };
}

function makeDockerInfo(overrides: Partial<DockerInfo> = {}): DockerInfo {
  return {
    state: "running",
    projectName: "myapp-feature",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedExeca.mockResolvedValue({ stdout: "" } as ReturnType<typeof execa>);
});

describe("runDelete", () => {
  test("throws when no worktree found for branch", async () => {
    vi.mocked(loadWorktrees).mockResolvedValue({
      worktrees: [],
      ghWarning: null,
    });
    await expect(
      runDelete("/repo", "missing", {}, async () => "y"),
    ).rejects.toThrow("No worktree found for: missing");
  });

  test("throws when trying to delete the main worktree", async () => {
    vi.mocked(loadWorktrees).mockResolvedValue({
      worktrees: [makeWorktree({ branch: "main", isMain: true })],
      ghWarning: null,
    });
    await expect(
      runDelete("/repo", "main", {}, async () => "y"),
    ).rejects.toThrow("Cannot delete the main worktree.");
  });

  test("cancels without removing when user answers something other than y", async () => {
    vi.mocked(loadWorktrees).mockResolvedValue({
      worktrees: [makeWorktree()],
      ghWarning: null,
    });
    await runDelete("/repo", "feature", {}, async () => "n");
    expect(mockedExeca).not.toHaveBeenCalledWith(
      "git",
      expect.arrayContaining(["worktree", "remove"]),
      expect.anything(),
    );
  });

  test("removes worktree when user answers y", async () => {
    vi.mocked(loadWorktrees).mockResolvedValue({
      worktrees: [makeWorktree()],
      ghWarning: null,
    });
    await runDelete("/repo", "feature", {}, async () => "y");
    expect(mockedExeca).toHaveBeenCalledWith(
      "git",
      ["worktree", "remove", "--force", "/worktrees/feature"],
      { cwd: "/repo" },
    );
  });

  test("skips confirmation prompt when --yes is set", async () => {
    const ask = vi.fn();
    vi.mocked(loadWorktrees).mockResolvedValue({
      worktrees: [makeWorktree()],
      ghWarning: null,
    });
    await runDelete("/repo", "feature", { yes: true }, ask);
    expect(ask).not.toHaveBeenCalled();
    expect(mockedExeca).toHaveBeenCalledWith(
      "git",
      ["worktree", "remove", "--force", "/worktrees/feature"],
      { cwd: "/repo" },
    );
  });

  test("runs docker compose down before removing when stack is running", async () => {
    vi.mocked(loadWorktrees).mockResolvedValue({
      worktrees: [
        makeWorktree({ docker: makeDockerInfo({ state: "running" }) }),
      ],
      ghWarning: null,
    });
    await runDelete("/repo", "feature", { yes: true });
    expect(mockedExeca).toHaveBeenCalledWith(
      "docker",
      expect.arrayContaining(["compose", "-p", "myapp-feature", "down"]),
      expect.anything(),
    );
  });

  test("skips docker down when stack is not started", async () => {
    vi.mocked(loadWorktrees).mockResolvedValue({
      worktrees: [
        makeWorktree({ docker: makeDockerInfo({ state: "not started" }) }),
      ],
      ghWarning: null,
    });
    await runDelete("/repo", "feature", { yes: true });
    expect(mockedExeca).not.toHaveBeenCalledWith(
      "docker",
      expect.anything(),
      expect.anything(),
    );
  });

  test("deletes the branch after removing worktree when --delete-branch is set", async () => {
    vi.mocked(loadWorktrees).mockResolvedValue({
      worktrees: [makeWorktree({ branch: "feature" })],
      ghWarning: null,
    });
    await runDelete("/repo", "feature", { yes: true, deleteBranch: true });
    expect(mockedExeca).toHaveBeenCalledWith(
      "git",
      ["branch", "-D", "feature"],
      { cwd: "/repo" },
    );
  });

  test("continues removing worktree even when docker down fails", async () => {
    vi.mocked(loadWorktrees).mockResolvedValue({
      worktrees: [
        makeWorktree({ docker: makeDockerInfo({ state: "running" }) }),
      ],
      ghWarning: null,
    });
    mockedExeca
      .mockRejectedValueOnce(new Error("docker not running"))
      .mockResolvedValueOnce({ stdout: "" } as ReturnType<typeof execa>);
    await runDelete("/repo", "feature", { yes: true });
    expect(mockedExeca).toHaveBeenCalledWith(
      "git",
      ["worktree", "remove", "--force", "/worktrees/feature"],
      { cwd: "/repo" },
    );
  });
});
