import { vi, describe, test, expect, beforeEach } from "vitest";

vi.mock("execa", () => ({ execa: vi.fn() }));

import { execa } from "execa";
import type { MockedFunction } from "vitest";
import { runPrune } from "./prune.js";

const mockedExeca = execa as MockedFunction<typeof execa>;

beforeEach(() => {
  vi.clearAllMocks();
  mockedExeca.mockResolvedValue({ stdout: "" } as ReturnType<typeof execa>);
});

describe("runPrune", () => {
  test("calls git worktree prune with repo path as cwd", async () => {
    await runPrune("/repo");
    expect(mockedExeca).toHaveBeenCalledWith("git", ["worktree", "prune"], {
      cwd: "/repo",
    });
  });

  test("bubbles up errors from git", async () => {
    mockedExeca.mockRejectedValue(new Error("git error"));
    await expect(runPrune("/repo")).rejects.toThrow("git error");
  });
});
