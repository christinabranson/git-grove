import { vi, describe, test, expect, beforeEach } from "vitest";

vi.mock("../data/worktrees.js");
vi.mock("./status.js");

import { loadWorktrees } from "../data/worktrees.js";
import { printStatus } from "./status.js";
import { runSync } from "./sync.js";
import type { Worktree } from "../types.js";

const fakeWorktree: Worktree = {
  path: "/repo/main",
  branch: "main",
  baseBranch: null,
  isMain: true,
  isCurrent: true,
  head: "abc123",
  docker: null,
  changeFootprint: null,
  pr: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runSync", () => {
  test("calls loadWorktrees and printStatus", async () => {
    vi.mocked(loadWorktrees).mockResolvedValue({
      worktrees: [fakeWorktree],
      ghWarning: null,
    });
    await runSync("/repo");
    expect(vi.mocked(loadWorktrees)).toHaveBeenCalledWith("/repo");
    expect(vi.mocked(printStatus)).toHaveBeenCalledWith([fakeWorktree]);
  });

  test("writes ghWarning to stderr when present", async () => {
    vi.mocked(loadWorktrees).mockResolvedValue({
      worktrees: [fakeWorktree],
      ghWarning: "gh CLI not found",
    });
    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    await runSync("/repo");
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("gh CLI not found"),
    );
    stderrSpy.mockRestore();
  });
});
