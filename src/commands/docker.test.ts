import { vi, describe, test, expect, beforeEach } from "vitest";

vi.mock("execa", () => ({ execa: vi.fn() }));
vi.mock("../data/worktrees.js");
vi.mock("../data/groveConfig.js");
vi.mock("../providers/docker-compose-contract.js");
vi.mock("../providers/shared.js", () => ({
  DEFAULT_SHARED_COMPOSE_FILE: "compose.shared.yaml",
}));
vi.mock("../utils/hardcodedPortsCheck.js");

import { execa } from "execa";
import type { MockedFunction } from "vitest";
import { loadWorktrees } from "../data/worktrees.js";
import { loadGroveConfig } from "../data/groveConfig.js";
import {
  discoverComposeContract,
  preflightComposeEnv,
  readEnvFile,
} from "../providers/docker-compose-contract.js";
import { warnIfHardcodedComposePorts } from "../utils/hardcodedPortsCheck.js";
import { runDockerUp, runDockerDown, runDockerTeardown } from "./docker.js";
import type { Worktree, DockerInfo } from "../types.js";

const mockedExeca = execa as MockedFunction<typeof execa>;

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

function makeDockerInfo(overrides: Partial<DockerInfo> = {}): DockerInfo {
  return { state: "running", projectName: "myapp-feature", ...overrides };
}

const fakeContract = {
  expectedVars: [],
  portRefs: [],
  dbNameRefs: [],
  warnings: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedExeca.mockResolvedValue({ stdout: "" } as ReturnType<typeof execa>);
  vi.mocked(loadGroveConfig).mockResolvedValue(null);
  vi.mocked(warnIfHardcodedComposePorts).mockResolvedValue(undefined);
  vi.mocked(discoverComposeContract).mockResolvedValue(fakeContract as never);
  vi.mocked(readEnvFile).mockResolvedValue({});
  vi.mocked(preflightComposeEnv).mockResolvedValue({
    ok: true,
    issues: [],
  } as never);
});

// --- runDockerUp ---

describe("runDockerUp", () => {
  test("throws when no worktree found", async () => {
    vi.mocked(loadWorktrees).mockResolvedValue({
      worktrees: [],
      ghWarning: null,
    });
    await expect(runDockerUp("/repo")).rejects.toThrow("No worktree found");
  });

  test("throws when worktree has no docker state (.env.worktree missing)", async () => {
    vi.mocked(loadWorktrees).mockResolvedValue({
      worktrees: [makeWorktree({ docker: null })],
      ghWarning: null,
    });
    await expect(runDockerUp("/repo")).rejects.toThrow(".env.worktree");
  });

  test("throws when preflight check fails", async () => {
    vi.mocked(loadWorktrees).mockResolvedValue({
      worktrees: [makeWorktree({ docker: makeDockerInfo() })],
      ghWarning: null,
    });
    vi.mocked(preflightComposeEnv).mockResolvedValue({
      ok: false,
      issues: [{ severity: "error", message: "WEB_PORT is not set" }],
    } as never);
    await expect(runDockerUp("/repo")).rejects.toThrow(
      "Compose env preflight failed",
    );
  });

  test("runs docker compose up on happy path", async () => {
    vi.mocked(loadWorktrees).mockResolvedValue({
      worktrees: [
        makeWorktree({
          docker: makeDockerInfo({ projectName: "myapp-feature" }),
        }),
      ],
      ghWarning: null,
    });
    await runDockerUp("/repo");
    expect(mockedExeca).toHaveBeenCalledWith(
      "docker",
      expect.arrayContaining(["compose", "-p", "myapp-feature", "up"]),
      { cwd: "/worktrees/feature" },
    );
  });

  test("selects worktree by branch name when branch is provided", async () => {
    const wt = makeWorktree({
      branch: "feat-login",
      path: "/worktrees/feat-login",
      docker: makeDockerInfo({ projectName: "myapp-feat-login" }),
    });
    vi.mocked(loadWorktrees).mockResolvedValue({
      worktrees: [makeWorktree(), wt],
      ghWarning: null,
    });
    await runDockerUp("/repo", "feat-login");
    expect(mockedExeca).toHaveBeenCalledWith(
      "docker",
      expect.arrayContaining(["-p", "myapp-feat-login"]),
      { cwd: "/worktrees/feat-login" },
    );
  });
});

// --- runDockerDown ---

describe("runDockerDown", () => {
  test("throws when no worktree found", async () => {
    vi.mocked(loadWorktrees).mockResolvedValue({
      worktrees: [],
      ghWarning: null,
    });
    await expect(runDockerDown("/repo")).rejects.toThrow("No worktree found");
  });

  test("throws when worktree has no docker state", async () => {
    vi.mocked(loadWorktrees).mockResolvedValue({
      worktrees: [makeWorktree({ docker: null })],
      ghWarning: null,
    });
    await expect(runDockerDown("/repo")).rejects.toThrow(".env.worktree");
  });

  test("runs docker compose down on happy path", async () => {
    vi.mocked(loadWorktrees).mockResolvedValue({
      worktrees: [makeWorktree({ docker: makeDockerInfo() })],
      ghWarning: null,
    });
    await runDockerDown("/repo");
    expect(mockedExeca).toHaveBeenCalledWith(
      "docker",
      expect.arrayContaining(["compose", "-p", "myapp-feature", "down"]),
      { cwd: "/worktrees/feature" },
    );
  });
});

// --- runDockerTeardown ---

describe("runDockerTeardown", () => {
  test("throws when no worktree found", async () => {
    vi.mocked(loadWorktrees).mockResolvedValue({
      worktrees: [],
      ghWarning: null,
    });
    await expect(
      runDockerTeardown("/repo", undefined, async () => "myapp-feature"),
    ).rejects.toThrow("No worktree found");
  });

  test("throws Teardown cancelled when confirmation does not match project name", async () => {
    vi.mocked(loadWorktrees).mockResolvedValue({
      worktrees: [makeWorktree({ docker: makeDockerInfo() })],
      ghWarning: null,
    });
    await expect(
      runDockerTeardown("/repo", undefined, async () => "wrong-name"),
    ).rejects.toThrow("Teardown cancelled");
    expect(mockedExeca).not.toHaveBeenCalledWith(
      "docker",
      expect.arrayContaining(["-v"]),
      expect.anything(),
    );
  });

  test("tears down with volumes when confirmation matches", async () => {
    vi.mocked(loadWorktrees).mockResolvedValue({
      worktrees: [makeWorktree({ docker: makeDockerInfo() })],
      ghWarning: null,
    });
    await runDockerTeardown("/repo", undefined, async () => "myapp-feature");
    expect(mockedExeca).toHaveBeenCalledWith(
      "docker",
      expect.arrayContaining(["down", "-v"]),
      { cwd: "/worktrees/feature" },
    );
  });
});
