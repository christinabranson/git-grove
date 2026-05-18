import { vi, describe, test, expect, beforeEach, afterEach } from "vitest";

vi.mock("../data/groveConfig.js");
vi.mock("../data/worktrees.js");

import { loadGroveConfig } from "../data/groveConfig.js";
import { resolveWorktreeRoot } from "../data/worktrees.js";
import { runInfo } from "./info.js";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveWorktreeRoot).mockReturnValue("/repo-worktrees");
  delete process.env.GROVE_WORKTREE_ROOT;
});

afterEach(() => {
  delete process.env.GROVE_WORKTREE_ROOT;
});

describe("runInfo", () => {
  test("prints repo path and worktree root without config", async () => {
    vi.mocked(loadGroveConfig).mockResolvedValue(null);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runInfo("/repo");
    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("/repo");
    expect(output).toContain("/repo-worktrees");
    logSpy.mockRestore();
  });

  test("shows project and editor when config is present", async () => {
    vi.mocked(loadGroveConfig).mockResolvedValue({
      enabled: true,
      project: "my-app",
      editor: "cursor",
      providers: {},
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runInfo("/repo");
    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("my-app");
    expect(output).toContain("cursor");
    logSpy.mockRestore();
  });

  test("shows $GROVE_WORKTREE_ROOT as source when env var is set", async () => {
    process.env.GROVE_WORKTREE_ROOT = "/custom/worktrees";
    vi.mocked(loadGroveConfig).mockResolvedValue(null);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runInfo("/repo");
    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("$GROVE_WORKTREE_ROOT");
    logSpy.mockRestore();
  });
});
