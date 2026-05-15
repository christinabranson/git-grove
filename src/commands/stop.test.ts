import { vi, describe, test, expect, beforeEach } from "vitest";

vi.mock("../data/worktrees.js");
vi.mock("../providers/index.js");

import { loadWorktrees } from "../data/worktrees.js";
import { discoverProvider } from "../providers/index.js";
import { runStop } from "./stop.js";
import type { Worktree } from "../types.js";

function makeWorktree(overrides: Partial<Worktree> = {}): Worktree {
  return {
    path: "/worktrees/feature-auth",
    branch: "feature-auth",
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

function makeProvider() {
  return {
    name: "mock-provider",
    start: vi.fn(),
    stop: vi.fn().mockResolvedValue(undefined),
    status: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runStop", () => {
  test("throws when no worktree matches env", async () => {
    vi.mocked(loadWorktrees).mockResolvedValue({
      worktrees: [makeWorktree()],
      ghWarning: null,
    });
    await expect(runStop("/repo", "missing")).rejects.toThrow(
      "No worktree found for: missing",
    );
  });

  test("matches by exact branch name", async () => {
    const provider = makeProvider();
    vi.mocked(loadWorktrees).mockResolvedValue({
      worktrees: [makeWorktree({ branch: "feature-auth" })],
      ghWarning: null,
    });
    vi.mocked(discoverProvider).mockResolvedValue(provider as never);
    await runStop("/repo", "feature-auth");
    expect(provider.stop).toHaveBeenCalled();
  });

  test("matches by branch suffix (endsWith)", async () => {
    const provider = makeProvider();
    vi.mocked(loadWorktrees).mockResolvedValue({
      worktrees: [makeWorktree({ branch: "user/feature-auth" })],
      ghWarning: null,
    });
    vi.mocked(discoverProvider).mockResolvedValue(provider as never);
    await runStop("/repo", "feature-auth");
    expect(provider.stop).toHaveBeenCalled();
  });

  test("calls discoverProvider with the worktree path and env name", async () => {
    const provider = makeProvider();
    vi.mocked(loadWorktrees).mockResolvedValue({
      worktrees: [
        makeWorktree({
          path: "/worktrees/feature-auth",
          branch: "feature-auth",
        }),
      ],
      ghWarning: null,
    });
    vi.mocked(discoverProvider).mockResolvedValue(provider as never);
    await runStop("/repo", "feature-auth");
    expect(vi.mocked(discoverProvider)).toHaveBeenCalledWith(
      "/worktrees/feature-auth",
      "feature-auth",
    );
  });

  test("bubbles up errors from provider.stop()", async () => {
    const provider = makeProvider();
    provider.stop.mockRejectedValue(new Error("docker not running"));
    vi.mocked(loadWorktrees).mockResolvedValue({
      worktrees: [makeWorktree()],
      ghWarning: null,
    });
    vi.mocked(discoverProvider).mockResolvedValue(provider as never);
    await expect(runStop("/repo", "feature-auth")).rejects.toThrow(
      "docker not running",
    );
  });
});
