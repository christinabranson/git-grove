import { vi, describe, test, expect, beforeEach } from "vitest";

vi.mock("execa", () => ({ execa: vi.fn() }));
vi.mock("fs", () => ({ existsSync: vi.fn() }));
vi.mock("../data/worktrees.js");
vi.mock("../data/groveConfig.js");
vi.mock("../providers/docker-compose-contract.js");

import { execa } from "execa";
import { existsSync } from "fs";
import type { MockedFunction } from "vitest";
import { loadWorktrees } from "../data/worktrees.js";
import { loadGroveConfig } from "../data/groveConfig.js";
import {
  discoverComposeContract,
  preflightComposeEnv,
  readEnvFile,
  formatDoctorEnvReport,
} from "../providers/docker-compose-contract.js";
import { runDoctorChecks, runDoctorEnv } from "./doctor.js";
import type { Worktree } from "../types.js";

const mockedExeca = execa as MockedFunction<typeof execa>;
const mockedExistsSync = existsSync as MockedFunction<typeof existsSync>;

function makeWorktree(overrides: Partial<Worktree> = {}): Worktree {
  return {
    path: "/repo/main",
    branch: "main",
    baseBranch: null,
    isMain: true,
    isCurrent: true,
    head: "abc123",
    docker: null,
    changeFootprint: null,
    pr: null,
    ...overrides,
  };
}

const fakeContract = {
  expectedVars: [],
  portRefs: [],
  dbNameRefs: [],
  warnings: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadGroveConfig).mockResolvedValue(null);
  vi.mocked(readEnvFile).mockResolvedValue({});
  vi.mocked(discoverComposeContract).mockResolvedValue(fakeContract as never);
  vi.mocked(formatDoctorEnvReport).mockReturnValue("env report");
});

// --- runDoctorChecks ---

describe("runDoctorChecks", () => {
  test("returns ok=false when not in a git repo", async () => {
    mockedExeca.mockRejectedValue(new Error("not a git repository"));
    const result = await runDoctorChecks("/not-a-repo");
    expect(result.ok).toBe(false);
    expect(result.checks[0].ok).toBe(false);
  });

  test("returns ok=true when all required checks pass", async () => {
    mockedExeca
      .mockResolvedValueOnce({ stdout: "/repo" } as ReturnType<typeof execa>) // git rev-parse
      .mockResolvedValueOnce({ stdout: "" } as ReturnType<typeof execa>); // git worktree list
    mockedExistsSync.mockReturnValue(true);
    const result = await runDoctorChecks("/repo");
    expect(result.ok).toBe(true);
  });

  test("includes git repo check as the first check", async () => {
    mockedExeca.mockRejectedValue(new Error("not a git repository"));
    const result = await runDoctorChecks("/not-a-repo");
    expect(result.checks[0].name).toContain("Git repository");
  });

  test("returns ok=false when .grove directory is missing", async () => {
    mockedExeca
      .mockResolvedValueOnce({ stdout: "/repo" } as ReturnType<typeof execa>)
      .mockResolvedValueOnce({ stdout: "" } as ReturnType<typeof execa>);
    mockedExistsSync
      .mockReturnValueOnce(false) // .grove dir missing
      .mockReturnValue(false);
    const result = await runDoctorChecks("/repo");
    expect(result.ok).toBe(false);
    expect(result.checks.some((c) => c.name.includes(".grove") && !c.ok)).toBe(
      true,
    );
  });
});

// --- runDoctorEnv ---

describe("runDoctorEnv", () => {
  test("throws when no worktree is found", async () => {
    vi.mocked(loadWorktrees).mockResolvedValue({
      worktrees: [],
      ghWarning: null,
    });
    await expect(runDoctorEnv("/repo")).rejects.toThrow("No worktree found");
  });

  test("selects the first worktree when no branch is specified", async () => {
    vi.mocked(loadWorktrees).mockResolvedValue({
      worktrees: [makeWorktree({ path: "/repo/main" })],
      ghWarning: null,
    });
    vi.mocked(preflightComposeEnv).mockResolvedValue({
      ok: true,
      issues: [],
    } as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runDoctorEnv("/repo");
    expect(vi.mocked(discoverComposeContract)).toHaveBeenCalledWith(
      "/repo/main",
    );
    logSpy.mockRestore();
  });

  test("selects worktree by branch name when branch is provided", async () => {
    vi.mocked(loadWorktrees).mockResolvedValue({
      worktrees: [
        makeWorktree({ branch: "main", path: "/repo/main" }),
        makeWorktree({ branch: "feature", path: "/worktrees/feature" }),
      ],
      ghWarning: null,
    });
    vi.mocked(preflightComposeEnv).mockResolvedValue({
      ok: true,
      issues: [],
    } as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runDoctorEnv("/repo", "feature");
    expect(vi.mocked(discoverComposeContract)).toHaveBeenCalledWith(
      "/worktrees/feature",
    );
    logSpy.mockRestore();
  });

  test("returns ok: false when preflight fails", async () => {
    vi.mocked(loadWorktrees).mockResolvedValue({
      worktrees: [makeWorktree()],
      ghWarning: null,
    });
    vi.mocked(preflightComposeEnv).mockResolvedValue({
      ok: false,
      issues: [{ severity: "error", message: "missing var" }],
    } as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const result = await runDoctorEnv("/repo");
    expect(result.ok).toBe(false);
    logSpy.mockRestore();
  });

  test("returns ok: true when preflight passes", async () => {
    vi.mocked(loadWorktrees).mockResolvedValue({
      worktrees: [makeWorktree()],
      ghWarning: null,
    });
    vi.mocked(preflightComposeEnv).mockResolvedValue({
      ok: true,
      issues: [],
    } as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const result = await runDoctorEnv("/repo");
    expect(result.ok).toBe(true);
    logSpy.mockRestore();
  });

  test("logs the env report to console", async () => {
    vi.mocked(loadWorktrees).mockResolvedValue({
      worktrees: [makeWorktree()],
      ghWarning: null,
    });
    vi.mocked(preflightComposeEnv).mockResolvedValue({
      ok: true,
      issues: [],
    } as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runDoctorEnv("/repo");
    expect(logSpy).toHaveBeenCalledWith("env report");
    logSpy.mockRestore();
  });
});
