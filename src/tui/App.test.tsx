import React from "react";
import { vi, describe, test, expect, beforeEach } from "vitest";
import type { MockedFunction } from "vitest";
import { render } from "./render-for-test.js";

vi.mock("../data/worktrees.js", () => ({
  loadWorktrees: vi.fn(),
}));

vi.mock("./editor.js", () => ({
  openInEditor: vi.fn(),
}));

vi.mock("execa", () => ({
  execa: vi.fn(),
}));

import { App } from "./App.js";
import { loadWorktrees } from "../data/worktrees.js";
import type { Worktree } from "../types.js";

const mockedLoadWorktrees = loadWorktrees as MockedFunction<
  typeof loadWorktrees
>;

function makeWorktree(overrides: Partial<Worktree> = {}): Worktree {
  return {
    path: "/repo/main",
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

const featureWorktree = makeWorktree({
  path: "/repo/feature",
  branch: "feature-auth",
  isMain: false,
});

const wait = (ms = 50) => new Promise<void>((r) => setTimeout(r, ms));

beforeEach(() => {
  vi.clearAllMocks();
  mockedLoadWorktrees.mockResolvedValue({ worktrees: [], ghWarning: null });
});

// NOTE: ink-testing-library creates an isolated stdin per render call, so
// multiple renders can coexist without interfering. We do NOT call unmount()
// after each test — doing so corrupts the shared process.stdin state and
// breaks subsequent tests' keyboard input.

describe("App — initial render", () => {
  test('shows "grove" brand in header', () => {
    const { lastFrame } = render(
      <App repoPath="/repo" initialWorktrees={[makeWorktree()]} />,
    );
    expect(lastFrame()).toContain("grove");
  });

  test("shows worktree count in header", () => {
    const { lastFrame } = render(
      <App
        repoPath="/repo"
        initialWorktrees={[makeWorktree(), featureWorktree]}
      />,
    );
    expect(lastFrame()).toContain("2 worktrees");
  });

  test("shows worktree branch names", () => {
    const { lastFrame } = render(
      <App
        repoPath="/repo"
        initialWorktrees={[makeWorktree({ branch: "main" })]}
      />,
    );
    expect(lastFrame()).toContain("main");
  });

  test("renders with empty worktrees list", () => {
    const { lastFrame } = render(
      <App repoPath="/repo" initialWorktrees={[]} />,
    );
    expect(lastFrame()).toContain("0 worktrees");
  });

  test('detail panel shows "select a worktree" when list is empty', () => {
    const { lastFrame } = render(
      <App repoPath="/repo" initialWorktrees={[]} />,
    );
    expect(lastFrame()).toContain("select a worktree");
  });

  test("shows keybind bar with sync and quit", () => {
    const { lastFrame } = render(
      <App repoPath="/repo" initialWorktrees={[makeWorktree()]} />,
    );
    expect(lastFrame()).toContain("sync");
    expect(lastFrame()).toContain("quit");
  });
});

describe("App — navigation", () => {
  // Navigation tests first: before any tests that write '?' which can leave
  // Ink's escape-sequence parser in an ambiguous state for other tests.
  const twoWorktrees = [makeWorktree(), featureWorktree];

  test("j key moves selection down to second worktree", async () => {
    const { lastFrame, stdin } = render(
      <App repoPath="/repo" initialWorktrees={twoWorktrees} />,
    );
    expect(lastFrame()).toContain("(main)");
    stdin.write("j");
    await wait();
    expect(lastFrame()).toContain("feature-auth");
    expect(lastFrame()).not.toContain("(main)");
  });

  test("k key moves selection back up", async () => {
    const { lastFrame, stdin } = render(
      <App repoPath="/repo" initialWorktrees={twoWorktrees} />,
    );
    stdin.write("j");
    await wait();
    stdin.write("k");
    await wait();
    expect(lastFrame()).toContain("(main)");
  });

  test("j key does not go past the last item", async () => {
    const { lastFrame, stdin } = render(
      <App repoPath="/repo" initialWorktrees={twoWorktrees} />,
    );
    stdin.write("j");
    await wait();
    stdin.write("j");
    await wait();
    expect(lastFrame()).toContain("feature-auth");
  });

  test("k key does not go above index 0", async () => {
    const { lastFrame, stdin } = render(
      <App repoPath="/repo" initialWorktrees={twoWorktrees} />,
    );
    stdin.write("k");
    await wait();
    expect(lastFrame()).toContain("(main)");
  });
});

describe("App — footprint expand", () => {
  test("pressing x toggles footprint expansion on and off", async () => {
    const worktree = makeWorktree({
      changeFootprint: {
        byDir: { src: [{ path: "src/file.ts", added: 10, removed: 3 }] },
        totalFiles: 1,
      },
    });
    const { lastFrame, stdin } = render(
      <App repoPath="/repo" initialWorktrees={[worktree]} />,
    );
    // CompactFootprint always shows "+10" (additions per dir), so use removal count "-3"
    // which only appears in the expanded ChangeFootprintPanel.
    expect(lastFrame()).not.toContain("-3");
    stdin.write("x");
    await wait();
    expect(lastFrame()).toContain("-3");
    stdin.write("x");
    await wait();
    expect(lastFrame()).not.toContain("-3");
  });

  test("navigating collapses footprint", async () => {
    const withFootprint = makeWorktree({
      changeFootprint: {
        byDir: { src: [{ path: "src/f.ts", added: 10, removed: 3 }] },
        totalFiles: 1,
      },
    });
    const { lastFrame, stdin } = render(
      <App
        repoPath="/repo"
        initialWorktrees={[withFootprint, featureWorktree]}
      />,
    );
    stdin.write("x");
    await wait();
    expect(lastFrame()).toContain("-3");
    stdin.write("j");
    await wait();
    stdin.write("k");
    await wait();
    expect(lastFrame()).not.toContain("-3");
  });
});

describe("App — delete confirmation", () => {
  const twoWorktrees = [makeWorktree(), featureWorktree];

  test("pressing D on non-main worktree shows confirm dialog", async () => {
    const { lastFrame, stdin } = render(
      <App repoPath="/repo" initialWorktrees={twoWorktrees} />,
    );
    stdin.write("j");
    await wait();
    stdin.write("D");
    await wait();
    expect(lastFrame()).toContain("Delete");
    expect(lastFrame()).toContain("feature-auth");
  });

  test("pressing any key other than y cancels delete and restores keybind bar", async () => {
    const { lastFrame, stdin } = render(
      <App repoPath="/repo" initialWorktrees={twoWorktrees} />,
    );
    stdin.write("j");
    await wait();
    stdin.write("D");
    await wait();
    stdin.write("n");
    await wait();
    expect(lastFrame()).not.toContain("Delete");
    expect(lastFrame()).toContain("sync");
  });

  test("pressing D on main worktree does nothing", async () => {
    const { lastFrame, stdin } = render(
      <App repoPath="/repo" initialWorktrees={twoWorktrees} />,
    );
    stdin.write("D"); // index 0 = main
    await wait();
    expect(lastFrame()).not.toContain("Delete");
  });
});

describe("App — sync", () => {
  test("pressing s triggers a sync and shows a status message", async () => {
    mockedLoadWorktrees.mockResolvedValue({
      worktrees: [makeWorktree()],
      ghWarning: null,
    });
    const { lastFrame, stdin } = render(
      <App repoPath="/repo" initialWorktrees={[makeWorktree()]} />,
    );
    stdin.write("s");
    await wait(100);
    const frame = lastFrame()!;
    expect(frame.includes("syncing") || frame.includes("synced")).toBe(true);
  });
});

describe("App — help view", () => {
  // These tests run after navigation tests because writing '?' leaves Ink's
  // escape parser in a state that doesn't affect simple alphanumeric keys but
  // could interfere if navigation tests ran after.

  test("pressing ? shows help screen with Grove Keyboard Shortcuts title", async () => {
    const { lastFrame, stdin } = render(
      <App repoPath="/repo" initialWorktrees={[makeWorktree()]} />,
    );
    stdin.write("?");
    await wait();
    expect(lastFrame()).toContain("Keyboard Shortcuts");
  });

  test("help screen lists keyboard shortcut descriptions", async () => {
    const { lastFrame, stdin } = render(
      <App repoPath="/repo" initialWorktrees={[makeWorktree()]} />,
    );
    stdin.write("?");
    await wait();
    const frame = lastFrame()!;
    expect(frame).toContain("sync worktrees");
    expect(frame).toContain("open in editor");
    expect(frame).toContain("docker up");
    expect(frame).toContain("docker down");
    expect(frame).toContain("delete worktree");
    expect(frame).toContain("quit");
    expect(frame).toContain("filter worktrees");
  });

  test("pressing ? again on help screen returns to main view", async () => {
    const { lastFrame, stdin } = render(
      <App repoPath="/repo" initialWorktrees={[makeWorktree()]} />,
    );
    stdin.write("?");
    await wait();
    expect(lastFrame()).toContain("Keyboard Shortcuts");
    stdin.write("?");
    await wait();
    expect(lastFrame()).not.toContain("Keyboard Shortcuts");
    expect(lastFrame()).toContain("grove");
  });
});
