import React from "react";
import { describe, test, expect } from "vitest";
import { render } from "ink-testing-library";
import { WorktreeList } from "./WorktreeList.js";
import type { Worktree } from "../types.js";

function makeWorktree(overrides: Partial<Worktree> = {}): Worktree {
  return {
    path: "/tmp/worktree",
    branch: "main",
    baseBranch: null,
    isMain: true,
    isCurrent: false,
    head: "abc1234",
    docker: null,
    changeFootprint: null,
    pr: null,
    ...overrides,
  };
}

function renderList(
  worktrees: Worktree[],
  selectedIndex = 0,
  width = 40,
  height = 20,
) {
  return render(
    <WorktreeList
      worktrees={worktrees}
      selectedIndex={selectedIndex}
      width={width}
      height={height}
    />,
  );
}

describe("WorktreeList", () => {
  test('renders the "worktrees" header', () => {
    const { lastFrame } = renderList([makeWorktree()]);
    expect(lastFrame()).toContain("worktrees");
  });

  test("shows each worktree branch name", () => {
    const worktrees = [
      makeWorktree({ branch: "main" }),
      makeWorktree({ branch: "feature-auth", isMain: false }),
    ];
    const { lastFrame } = renderList(worktrees);
    expect(lastFrame()).toContain("primary");
    expect(lastFrame()).toContain("main");
    expect(lastFrame()).toContain("feature-auth");
  });

  test('shows "primary" label for main worktree', () => {
    const wt = makeWorktree({ isMain: true, branch: "some-branch" });
    const { lastFrame } = renderList([wt]);
    expect(lastFrame()).toContain("primary");
    expect(lastFrame()).toContain("some-branch");
  });

  test("shows branch name as subtitle for main worktree, not as main label", () => {
    const wt = makeWorktree({ isMain: true, branch: "my-feature-branch" });
    const { lastFrame } = renderList([wt]);
    const frame = lastFrame()!;
    const lines = frame.split("\n");
    const primaryLine = lines.find((l) => l.includes("primary"));
    expect(primaryLine).not.toContain("my-feature-branch");
    const subtitleLine = lines.find((l) => l.includes("my-feature-branch"));
    expect(subtitleLine).toBeDefined();
  });

  test("non-main worktrees show branch name as main label, not primary", () => {
    const wt = makeWorktree({ isMain: false, branch: "feature-x" });
    const { lastFrame } = renderList([wt]);
    expect(lastFrame()).toContain("feature-x");
    expect(lastFrame()).not.toContain("primary");
  });

  test("selected item shows ▶ prefix", () => {
    const worktrees = [
      makeWorktree({ branch: "main" }),
      makeWorktree({ branch: "feature", isMain: false }),
    ];
    const { lastFrame } = renderList(worktrees, 0);
    expect(lastFrame()).toContain("▶");
  });

  test("non-selected items show space prefix", () => {
    const worktrees = [
      makeWorktree({ branch: "main" }),
      makeWorktree({ branch: "feature", isMain: false }),
    ];
    const { lastFrame } = renderList(worktrees, 0);
    // The second item should not have ▶
    const frame = lastFrame()!;
    const lines = frame.split("\n");
    const featureLine = lines.find((l) => l.includes("feature"));
    expect(featureLine).not.toContain("▶");
  });

  test("shows PR number when worktree has a PR", () => {
    const wt = makeWorktree({
      pr: {
        number: 42,
        title: "my PR",
        url: "",
        state: "open",
        approvals: 0,
        reviewRequested: false,
        youCommented: false,
        isAuthor: true,
      },
    });
    const { lastFrame } = renderList([wt]);
    expect(lastFrame()).toContain("PR #42");
  });

  test('shows "clean" when no changeFootprint', () => {
    const wt = makeWorktree({ changeFootprint: null });
    const { lastFrame } = renderList([wt]);
    expect(lastFrame()).toContain("clean");
  });

  test("shows file count when changeFootprint is present", () => {
    const wt = makeWorktree({
      changeFootprint: { byDir: {}, totalFiles: 5 },
    });
    const { lastFrame } = renderList([wt]);
    expect(lastFrame()).toContain("+5");
  });

  test("shows base branch for non-main worktrees that have one", () => {
    const wt = makeWorktree({
      isMain: false,
      baseBranch: "main",
      branch: "feature",
    });
    const { lastFrame } = renderList([wt]);
    expect(lastFrame()).toContain("off main");
  });

  test("does not show base branch for main worktree even if set", () => {
    const wt = makeWorktree({ isMain: true, baseBranch: "origin/main" });
    const { lastFrame } = renderList([wt]);
    expect(lastFrame()).not.toContain("off origin/main");
  });

  test("does not show base branch when baseBranch is null", () => {
    const wt = makeWorktree({ isMain: false, baseBranch: null });
    const { lastFrame } = renderList([wt]);
    expect(lastFrame()).not.toContain("off");
  });

  test("truncates long branch names to fit width", () => {
    const longBranch = "a".repeat(50);
    const wt = makeWorktree({ branch: longBranch, isMain: false });
    const { lastFrame } = renderList([wt], 0, 30);
    expect(lastFrame()).toContain("…");
  });

  test("scroll window: hides items outside visible range", () => {
    const worktrees = Array.from({ length: 10 }, (_, i) =>
      makeWorktree({
        branch: `branch-${i}`,
        path: `/tmp/worktree-${i}`,
        isMain: i === 0,
      }),
    );
    // height=6 means visibleCount=4 (height - 2 for border); Ink clips overflow
    // from the bottom, so item 0 (branch-0) appears in the first visible lines
    const { lastFrame } = renderList(worktrees, 0, 40, 6);
    const frame = lastFrame()!;
    expect(frame).toContain("branch-0");
    // branch-9 should not be rendered when selectedIndex=0 and visibleCount=4
    expect(frame).not.toContain("branch-9");
  });

  test("scroll window: centers on selected item", () => {
    const worktrees = Array.from({ length: 10 }, (_, i) =>
      makeWorktree({
        branch: `branch-${i}`,
        path: `/tmp/worktree-${i}`,
        isMain: i === 0,
      }),
    );
    // Select last item — scroll window should move away from item 0.
    // With 2-line rows and height=6, Ink clips from the bottom so only the
    // first few rows of the window are visible; branch-7 (window start) is
    // in the frame while branch-0 (outside the window) is not.
    const { lastFrame } = renderList(worktrees, 9, 40, 6);
    expect(lastFrame()).toContain("branch-7");
    expect(lastFrame()).not.toContain("branch-0");
  });

  test("renders empty list without error", () => {
    const { lastFrame } = renderList([]);
    expect(lastFrame()).toContain("worktrees");
  });
});
