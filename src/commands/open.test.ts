import { vi, describe, test, expect, beforeEach } from "vitest";

vi.mock("../data/worktrees.js");
vi.mock("../data/groveConfig.js");
vi.mock("../tui/editor.js");

import { loadWorktrees } from "../data/worktrees.js";
import { loadGroveConfig } from "../data/groveConfig.js";
import {
  resolveEditor,
  openInEditor,
  editorDisplayName,
} from "../tui/editor.js";
import { runOpen } from "./open.js";
import type { Worktree } from "../types.js";

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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadGroveConfig).mockResolvedValue(null);
  vi.mocked(resolveEditor).mockResolvedValue({ bin: "code" } as never);
  vi.mocked(editorDisplayName).mockReturnValue("VS Code");
  vi.mocked(openInEditor).mockResolvedValue(undefined);
});

describe("runOpen", () => {
  test("throws when no worktree matches the branch", async () => {
    vi.mocked(loadWorktrees).mockResolvedValue({
      worktrees: [makeWorktree({ branch: "main" })],
      ghWarning: null,
    });
    await expect(runOpen("/repo", "missing")).rejects.toThrow(
      "No worktree found for branch: missing",
    );
  });

  test("throws when no editor is found", async () => {
    vi.mocked(loadWorktrees).mockResolvedValue({
      worktrees: [makeWorktree()],
      ghWarning: null,
    });
    vi.mocked(resolveEditor).mockResolvedValue(null);
    await expect(runOpen("/repo", "feature")).rejects.toThrow(
      "No editor found",
    );
  });

  test("opens the first worktree when no branch is specified", async () => {
    vi.mocked(loadWorktrees).mockResolvedValue({
      worktrees: [
        makeWorktree({ branch: "main", path: "/worktrees/main" }),
        makeWorktree({ branch: "feature" }),
      ],
      ghWarning: null,
    });
    await runOpen("/repo");
    expect(vi.mocked(openInEditor)).toHaveBeenCalledWith(
      "/worktrees/main",
      undefined,
    );
  });

  test("opens the matching branch worktree when branch is specified", async () => {
    vi.mocked(loadWorktrees).mockResolvedValue({
      worktrees: [
        makeWorktree({ branch: "main", path: "/worktrees/main" }),
        makeWorktree({ branch: "feature", path: "/worktrees/feature" }),
      ],
      ghWarning: null,
    });
    await runOpen("/repo", "feature");
    expect(vi.mocked(openInEditor)).toHaveBeenCalledWith(
      "/worktrees/feature",
      undefined,
    );
  });

  test("passes grove config editor setting to openInEditor", async () => {
    vi.mocked(loadGroveConfig).mockResolvedValue({
      enabled: true,
      project: "myapp",
      editor: "cursor",
      providers: {},
    });
    vi.mocked(loadWorktrees).mockResolvedValue({
      worktrees: [makeWorktree()],
      ghWarning: null,
    });
    await runOpen("/repo", "feature");
    expect(vi.mocked(openInEditor)).toHaveBeenCalledWith(
      "/worktrees/feature",
      "cursor",
    );
  });
});
