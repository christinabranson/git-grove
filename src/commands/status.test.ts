import { vi, describe, test, expect, beforeEach } from "vitest";

vi.mock("../data/worktrees.js");
vi.mock("../providers/index.js");

import { loadWorktrees } from "../data/worktrees.js";
import { discoverProvider } from "../providers/index.js";
import { runStatus } from "./status.js";
import type { Worktree, GroveEnvironment } from "../types.js";

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

function makeGroveEnvironment(): GroveEnvironment {
  return {
    name: "feature",
    worktreePath: "/worktrees/feature",
    web: { url: "http://localhost:3001" },
    metadata: { source: "grove", provider: "docker-compose" },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runStatus — JSON mode", () => {
  test("throws when no worktree matches env in JSON mode", async () => {
    vi.mocked(loadWorktrees).mockResolvedValue({
      worktrees: [makeWorktree({ branch: "other" })],
      ghWarning: null,
    });
    await expect(runStatus("/repo", "missing", { json: true })).rejects.toThrow(
      "no worktree found for: missing",
    );
  });

  test("logs JSON with provider status on success", async () => {
    vi.mocked(loadWorktrees).mockResolvedValue({
      worktrees: [makeWorktree({ branch: "feature" })],
      ghWarning: null,
    });
    vi.mocked(discoverProvider).mockResolvedValue({
      name: "docker-compose",
      start: vi.fn(),
      stop: vi.fn(),
      status: vi.fn().mockResolvedValue(makeGroveEnvironment()),
    } as never);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runStatus("/repo", "feature", { json: true });
    const output = JSON.parse(logSpy.mock.calls[0][0]);
    expect(output.ok).toBe(true);
    expect(output.web).toBe("http://localhost:3001");
    expect(output.source).toBe("grove");
    logSpy.mockRestore();
  });

  test("matches env by branch suffix (endsWith) in JSON mode", async () => {
    vi.mocked(loadWorktrees).mockResolvedValue({
      worktrees: [makeWorktree({ branch: "user/feature" })],
      ghWarning: null,
    });
    vi.mocked(discoverProvider).mockResolvedValue({
      name: "docker-compose",
      start: vi.fn(),
      stop: vi.fn(),
      status: vi.fn().mockResolvedValue(makeGroveEnvironment()),
    } as never);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runStatus("/repo", "feature", { json: true });
    const output = JSON.parse(logSpy.mock.calls[0][0]);
    expect(output.ok).toBe(true);
    logSpy.mockRestore();
  });
});

describe("runStatus — table mode", () => {
  test("calls loadWorktrees and does not throw", async () => {
    vi.mocked(loadWorktrees).mockResolvedValue({
      worktrees: [makeWorktree()],
      ghWarning: null,
    });
    vi.spyOn(console, "log").mockImplementation(() => {});
    await runStatus("/repo");
    expect(vi.mocked(loadWorktrees)).toHaveBeenCalledWith("/repo");
  });

  test("writes ghWarning to stderr when present", async () => {
    vi.mocked(loadWorktrees).mockResolvedValue({
      worktrees: [makeWorktree()],
      ghWarning: "gh CLI not found",
    });
    vi.spyOn(console, "log").mockImplementation(() => {});
    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    await runStatus("/repo");
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("gh CLI not found"),
    );
    stderrSpy.mockRestore();
  });
});
