import { vi, describe, test, expect, beforeEach } from "vitest";

vi.mock("execa", () => ({ execa: vi.fn() }));
vi.mock("../data/worktrees.js");

import { execa } from "execa";
import type { MockedFunction } from "vitest";
import { loadWorktrees } from "../data/worktrees.js";
import { runDestroy } from "./destroy.js";
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
  return { state: "running", projectName: "myapp-feature", ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedExeca.mockResolvedValue({ stdout: "" } as ReturnType<typeof execa>);
});

describe("runDestroy", () => {
  test("throws when no worktree found", async () => {
    vi.mocked(loadWorktrees).mockResolvedValue({
      worktrees: [],
      ghWarning: null,
    });
    await expect(
      runDestroy("/repo", undefined, {}, async () => "myapp-feature"),
    ).rejects.toThrow("No worktree found");
  });

  test("throws when worktree has no docker state (.env.worktree missing)", async () => {
    vi.mocked(loadWorktrees).mockResolvedValue({
      worktrees: [makeWorktree({ docker: null })],
      ghWarning: null,
    });
    await expect(
      runDestroy("/repo", undefined, {}, async () => "myapp-feature"),
    ).rejects.toThrow(".env.worktree");
  });

  test("throws Destroy cancelled when confirmation does not match project name", async () => {
    vi.mocked(loadWorktrees).mockResolvedValue({
      worktrees: [makeWorktree({ docker: makeDockerInfo() })],
      ghWarning: null,
    });
    await expect(
      runDestroy("/repo", undefined, {}, async () => "wrong-name"),
    ).rejects.toThrow("Destroy cancelled");
    expect(mockedExeca).not.toHaveBeenCalledWith(
      "docker",
      expect.arrayContaining(["-v"]),
      expect.anything(),
    );
  });

  test("destroys with volumes when confirmation matches", async () => {
    vi.mocked(loadWorktrees).mockResolvedValue({
      worktrees: [makeWorktree({ docker: makeDockerInfo() })],
      ghWarning: null,
    });
    await runDestroy("/repo", undefined, {}, async () => "myapp-feature");
    expect(mockedExeca).toHaveBeenCalledWith(
      "docker",
      expect.arrayContaining(["down", "-v"]),
      expect.objectContaining({
        cwd: "/worktrees/feature",
        env: expect.any(Object),
      }),
    );
  });

  test("skips confirmation when --yes is passed", async () => {
    vi.mocked(loadWorktrees).mockResolvedValue({
      worktrees: [makeWorktree({ docker: makeDockerInfo() })],
      ghWarning: null,
    });
    const askSpy = vi.fn();
    await runDestroy("/repo", undefined, { yes: true }, askSpy);
    expect(askSpy).not.toHaveBeenCalled();
    expect(mockedExeca).toHaveBeenCalledWith(
      "docker",
      expect.arrayContaining(["down", "-v"]),
      expect.anything(),
    );
  });

  test("selects worktree by branch name when provided", async () => {
    const wt = makeWorktree({
      branch: "feat-login",
      path: "/worktrees/feat-login",
      docker: makeDockerInfo({ projectName: "myapp-feat-login" }),
    });
    vi.mocked(loadWorktrees).mockResolvedValue({
      worktrees: [makeWorktree(), wt],
      ghWarning: null,
    });
    await runDestroy("/repo", "feat-login", {}, async () => "myapp-feat-login");
    expect(mockedExeca).toHaveBeenCalledWith(
      "docker",
      expect.arrayContaining(["-p", "myapp-feat-login"]),
      expect.objectContaining({ cwd: "/worktrees/feat-login" }),
    );
  });
});
