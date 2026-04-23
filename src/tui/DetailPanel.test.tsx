import React from "react";
import { describe, test, expect } from "vitest";
import { render } from "ink-testing-library";
import { DetailPanel } from "./DetailPanel.js";
import type { Worktree } from "../types.js";

function makeWorktree(overrides: Partial<Worktree> = {}): Worktree {
  return {
    path: "/tmp/worktree",
    branch: "feature-auth",
    baseBranch: null,
    isMain: false,
    isCurrent: false,
    head: "abc1234",
    docker: null,
    changeFootprint: null,
    pr: null,
    ...overrides,
  };
}

function renderPanel(
  worktree: Worktree | null,
  opts: { footprintExpanded?: boolean } = {},
) {
  return render(
    <DetailPanel
      worktree={worktree}
      width={60}
      height={30}
      footprintExpanded={opts.footprintExpanded ?? false}
    />,
  );
}

describe("DetailPanel — empty state", () => {
  test('shows "select a worktree" when no worktree is provided', () => {
    const { lastFrame } = renderPanel(null);
    expect(lastFrame()).toContain("select a worktree");
  });
});

describe("DetailPanel — branch header", () => {
  test("shows the branch name", () => {
    const { lastFrame } = renderPanel(makeWorktree({ branch: "feature-auth" }));
    expect(lastFrame()).toContain("feature-auth");
  });

  test('shows "(main)" label for main worktree', () => {
    const { lastFrame } = renderPanel(
      makeWorktree({ branch: "main", isMain: true }),
    );
    expect(lastFrame()).toContain("(main)");
  });

  test('does not show "(main)" for non-main worktrees', () => {
    const { lastFrame } = renderPanel(makeWorktree({ isMain: false }));
    expect(lastFrame()).not.toContain("(main)");
  });

  test("shows base branch for non-main worktrees", () => {
    const wt = makeWorktree({ isMain: false, baseBranch: "main" });
    const { lastFrame } = renderPanel(wt);
    expect(lastFrame()).toContain("off main");
  });

  test("does not show base branch for main worktree", () => {
    const wt = makeWorktree({ isMain: true, baseBranch: "origin/main" });
    const { lastFrame } = renderPanel(wt);
    expect(lastFrame()).not.toContain("off origin/main");
  });
});

describe("DetailPanel — docker section", () => {
  test("does not show docker section when docker is null", () => {
    const { lastFrame } = renderPanel(makeWorktree({ docker: null }));
    expect(lastFrame()).not.toContain("docker");
  });

  test("shows docker section header when docker is present", () => {
    const wt = makeWorktree({
      docker: { state: "running", projectName: "myapp" },
    });
    const { lastFrame } = renderPanel(wt);
    expect(lastFrame()).toContain("docker");
  });

  test("shows running state with ● symbol", () => {
    const wt = makeWorktree({
      docker: { state: "running", projectName: "myapp" },
    });
    const { lastFrame } = renderPanel(wt);
    expect(lastFrame()).toContain("running");
  });

  test("shows web port URL when webPort is present", () => {
    const wt = makeWorktree({
      docker: { state: "running", projectName: "myapp", webPort: 3000 },
    });
    const { lastFrame } = renderPanel(wt);
    expect(lastFrame()).toContain("localhost:3000");
  });

  test("shows localstack port URL when localstackPort is present", () => {
    const wt = makeWorktree({
      docker: { state: "running", projectName: "myapp", localstackPort: 4566 },
    });
    const { lastFrame } = renderPanel(wt);
    expect(lastFrame()).toContain("localhost:4566");
  });

  test("shows db schema when present", () => {
    const wt = makeWorktree({
      docker: {
        state: "running",
        projectName: "myapp",
        dbSchema: "myapp_feature",
      },
    });
    const { lastFrame } = renderPanel(wt);
    expect(lastFrame()).toContain("schema: myapp_feature");
  });

  test("shows redis db when present", () => {
    const wt = makeWorktree({
      docker: { state: "stopped", projectName: "myapp", redisDb: "3" },
    });
    const { lastFrame } = renderPanel(wt);
    expect(lastFrame()).toContain("redis db: 3");
  });

  test("shows stopped state with ■ symbol", () => {
    const wt = makeWorktree({
      docker: { state: "stopped", projectName: "myapp" },
    });
    const { lastFrame } = renderPanel(wt);
    expect(lastFrame()).toContain("stopped");
  });

  test("shows partial state", () => {
    const wt = makeWorktree({
      docker: { state: "partial", projectName: "myapp" },
    });
    const { lastFrame } = renderPanel(wt);
    expect(lastFrame()).toContain("partial");
  });
});

describe("DetailPanel — PR section", () => {
  test("does not show PR section when pr is null", () => {
    const { lastFrame } = renderPanel(makeWorktree({ pr: null }));
    expect(lastFrame()).not.toContain("pull request");
  });

  test("shows PR section header", () => {
    const wt = makeWorktree({
      pr: {
        number: 42,
        title: "Add auth",
        url: "",
        state: "open",
        approvals: 0,
        reviewRequested: false,
        youCommented: false,
        isAuthor: true,
      },
    });
    const { lastFrame } = renderPanel(wt);
    expect(lastFrame()).toContain("pull request");
  });

  test("shows PR number", () => {
    const wt = makeWorktree({
      pr: {
        number: 99,
        title: "Fix bug",
        url: "",
        state: "open",
        approvals: 0,
        reviewRequested: false,
        youCommented: false,
        isAuthor: true,
      },
    });
    const { lastFrame } = renderPanel(wt);
    expect(lastFrame()).toContain("PR #99");
  });

  test("shows PR title", () => {
    const wt = makeWorktree({
      pr: {
        number: 1,
        title: "Implement feature flags",
        url: "",
        state: "open",
        approvals: 0,
        reviewRequested: false,
        youCommented: false,
        isAuthor: true,
      },
    });
    const { lastFrame } = renderPanel(wt);
    expect(lastFrame()).toContain("Implement feature flags");
  });

  test("shows approval count when approvals > 0", () => {
    const wt = makeWorktree({
      pr: {
        number: 1,
        title: "My PR",
        url: "",
        state: "open",
        approvals: 2,
        reviewRequested: false,
        youCommented: false,
        isAuthor: true,
      },
    });
    const { lastFrame } = renderPanel(wt);
    expect(lastFrame()).toContain("2 approvals");
  });

  test('shows singular "approval" for 1 approval', () => {
    const wt = makeWorktree({
      pr: {
        number: 1,
        title: "My PR",
        url: "",
        state: "open",
        approvals: 1,
        reviewRequested: false,
        youCommented: false,
        isAuthor: true,
      },
    });
    const { lastFrame } = renderPanel(wt);
    expect(lastFrame()).toContain("1 approval");
    expect(lastFrame()).not.toContain("1 approvals");
  });

  test("does not show approval count when approvals is 0", () => {
    const wt = makeWorktree({
      pr: {
        number: 1,
        title: "My PR",
        url: "",
        state: "open",
        approvals: 0,
        reviewRequested: false,
        youCommented: false,
        isAuthor: true,
      },
    });
    const { lastFrame } = renderPanel(wt);
    expect(lastFrame()).not.toContain("approval");
  });

  test('shows "review requested" when reviewRequested is true', () => {
    const wt = makeWorktree({
      pr: {
        number: 1,
        title: "My PR",
        url: "",
        state: "open",
        approvals: 0,
        reviewRequested: true,
        youCommented: false,
        isAuthor: true,
      },
    });
    const { lastFrame } = renderPanel(wt);
    expect(lastFrame()).toContain("review requested");
  });
});

describe("DetailPanel — change footprint section", () => {
  test("shows changes section when changeFootprint is present", () => {
    const wt = makeWorktree({
      changeFootprint: {
        byDir: { src: [{ path: "src/file.ts", added: 5, removed: 0 }] },
        totalFiles: 1,
      },
    });
    const { lastFrame } = renderPanel(wt);
    expect(lastFrame()).toContain("changes");
    expect(lastFrame()).toContain("src/");
  });

  test("does not show changes section when changeFootprint is null", () => {
    const { lastFrame } = renderPanel(makeWorktree({ changeFootprint: null }));
    expect(lastFrame()).not.toContain("changes");
  });

  test("passes footprintExpanded to ChangeFootprintPanel", () => {
    const wt = makeWorktree({
      changeFootprint: {
        byDir: { src: [{ path: "src/file.ts", added: 10, removed: 3 }] },
        totalFiles: 1,
      },
    });
    const { lastFrame: expanded } = renderPanel(wt, {
      footprintExpanded: true,
    });
    const { lastFrame: collapsed } = renderPanel(wt, {
      footprintExpanded: false,
    });
    expect(expanded()).toContain("+10");
    expect(collapsed()).not.toContain("+10");
  });
});
