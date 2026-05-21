import { vi, describe, test, expect, beforeEach } from "vitest";

vi.mock("execa", () => ({ execa: vi.fn() }));
vi.mock("fs", () => ({ existsSync: vi.fn() }));
vi.mock("fs/promises", () => ({ writeFile: vi.fn(), copyFile: vi.fn() }));
vi.mock("../data/worktrees.js");
vi.mock("../data/groveConfig.js");
vi.mock("../setup/naming.js");
vi.mock("../providers/index.js");
vi.mock("../providers/shared.js", () => ({
  DEFAULT_SHARED_COMPOSE_FILE: "compose.shared.yaml",
  resolveSharedStack: vi.fn(),
  getSharedStackState: vi.fn(),
  sharedUp: vi.fn(),
  sharedDown: vi.fn(),
}));
vi.mock("../providers/docker-compose-contract.js");
vi.mock("../utils/hardcodedPortsCheck.js");

import { execa } from "execa";
import { existsSync } from "fs";
import { copyFile, writeFile } from "fs/promises";
import type { MockedFunction } from "vitest";
import {
  resolveWorktreeRoot,
  detectDefaultBranch,
  createWorktreeWithBase,
} from "../data/worktrees.js";
import { loadGroveConfig } from "../data/groveConfig.js";
import { expandNaming, buildCanonicalEnvVars } from "../setup/naming.js";
import { discoverProvider } from "../providers/index.js";
import {
  resolveSharedStack,
  getSharedStackState,
  sharedUp,
} from "../providers/shared.js";
import {
  discoverComposeContract,
  readEnvFile,
  readSourceEnvFiles,
  resolveContractEnvVars,
  selectCanonicalEnvForOutput,
  renderEnvContent,
} from "../providers/docker-compose-contract.js";
import { warnIfHardcodedComposePorts } from "../utils/hardcodedPortsCheck.js";
import { runStart } from "./start.js";
import type { GroveConfig } from "../types.js";

const mockedExeca = execa as MockedFunction<typeof execa>;
const mockedExistsSync = existsSync as MockedFunction<typeof existsSync>;
const mockedWriteFile = writeFile as MockedFunction<typeof writeFile>;
const mockedCopyFile = copyFile as MockedFunction<typeof copyFile>;

const fakeGroveConfig: GroveConfig = {
  enabled: true,
  project: "myapp",
  providers: {},
  naming: {
    composeProject: "myapp-${branchSafe}",
    sharedProject: "myapp-shared",
  },
};

const fakeExpanded = {
  composeProject: "myapp-feature",
  sharedProject: "myapp-shared",
  webPort: 3001,
  dbSchema: "myapp_feature",
};

const fakeContract = {
  expectedVars: [],
  portRefs: [],
  dbNameRefs: [],
  projectNameVars: [],
  warnings: [],
};

const fakeContractEnvVars = {
  issues: [],
  values: { SOME_ALIAS: "value" },
};

const fakeProvider = {
  name: "docker-compose",
  start: vi.fn(),
  stop: vi.fn(),
  status: vi.fn(),
};

const fakeEnv = {
  web: { url: "http://localhost:3001", port: 3001 },
  metadata: { provider: "docker-compose", source: "grove" },
};

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(loadGroveConfig).mockResolvedValue(null);
  vi.mocked(resolveWorktreeRoot).mockReturnValue("/repo/.worktrees");
  vi.mocked(warnIfHardcodedComposePorts).mockResolvedValue(undefined);
  vi.mocked(discoverProvider).mockResolvedValue(fakeProvider as never);
  fakeProvider.start.mockResolvedValue(fakeEnv);

  // existsSync: worktree path exists, .env.worktree exists by default
  mockedExistsSync.mockReturnValue(true);

  // execa: default no-op
  mockedExeca.mockResolvedValue({ stdout: "" } as ReturnType<typeof execa>);
  mockedWriteFile.mockResolvedValue(undefined);
  mockedCopyFile.mockResolvedValue(undefined);

  // shared stack: not configured by default
  vi.mocked(resolveSharedStack).mockReturnValue(null);
  vi.mocked(getSharedStackState).mockResolvedValue("not started");
  vi.mocked(sharedUp).mockResolvedValue(undefined);

  // env generation mocks
  vi.mocked(expandNaming).mockReturnValue(fakeExpanded as never);
  vi.mocked(buildCanonicalEnvVars).mockResolvedValue({} as never);
  vi.mocked(discoverComposeContract).mockResolvedValue(fakeContract as never);
  vi.mocked(readEnvFile).mockResolvedValue({});
  vi.mocked(readSourceEnvFiles).mockResolvedValue({});
  vi.mocked(resolveContractEnvVars).mockReturnValue(
    fakeContractEnvVars as never,
  );
  vi.mocked(selectCanonicalEnvForOutput).mockReturnValue({} as never);
  vi.mocked(renderEnvContent).mockReturnValue("WEB_PORT=3001\n");
});

// --- worktree resolution ---

describe("worktree resolution", () => {
  test("attaches to existing worktree without creating one", async () => {
    mockedExistsSync.mockReturnValue(true);
    await runStart("/repo", "feature", { json: true });
    expect(mockedExeca).not.toHaveBeenCalledWith(
      "git",
      expect.arrayContaining(["worktree", "add"]),
      expect.anything(),
    );
    expect(vi.mocked(createWorktreeWithBase)).not.toHaveBeenCalled();
  });

  test("fetches and creates worktree when path does not exist", async () => {
    mockedExistsSync.mockImplementation((p) =>
      !String(p).endsWith("feature") ? true : false,
    );
    await runStart("/repo", "feature", { json: true });
    expect(mockedExeca).toHaveBeenCalledWith(
      "git",
      ["fetch", "origin", "feature"],
      { cwd: "/repo" },
    );
    expect(mockedExeca).toHaveBeenCalledWith(
      "git",
      ["worktree", "add", "/repo/.worktrees/feature", "feature"],
      { cwd: "/repo" },
    );
  });

  test("creates worktree with base branch when --new is set", async () => {
    mockedExistsSync.mockImplementation((p) =>
      !String(p).endsWith("feature") ? true : false,
    );
    vi.mocked(detectDefaultBranch).mockResolvedValue("main");
    await runStart("/repo", "feature", { new: true, json: true });
    expect(vi.mocked(createWorktreeWithBase)).toHaveBeenCalledWith(
      "/repo",
      "feature",
      "/repo/.worktrees/feature",
      "main",
    );
    expect(mockedExeca).not.toHaveBeenCalledWith(
      "git",
      expect.arrayContaining(["fetch"]),
      expect.anything(),
    );
  });

  test("uses explicit --base branch when --new is set", async () => {
    mockedExistsSync.mockImplementation((p) =>
      !String(p).endsWith("feature") ? true : false,
    );
    await runStart("/repo", "feature", {
      new: true,
      base: "develop",
      json: true,
    });
    expect(vi.mocked(createWorktreeWithBase)).toHaveBeenCalledWith(
      "/repo",
      "feature",
      "/repo/.worktrees/feature",
      "develop",
    );
  });

  test("converts slashes in branch name to hyphens for worktree path", async () => {
    mockedExistsSync.mockImplementation((p) =>
      !String(p).includes("feat-my-feature") ? true : false,
    );
    await runStart("/repo", "feat/my-feature", { json: true });
    expect(mockedExeca).toHaveBeenCalledWith(
      "git",
      ["fetch", "origin", "feat/my-feature"],
      { cwd: "/repo" },
    );
    expect(mockedExeca).toHaveBeenCalledWith(
      "git",
      [
        "worktree",
        "add",
        "/repo/.worktrees/feat-my-feature",
        "feat/my-feature",
      ],
      { cwd: "/repo" },
    );
  });
});

// --- PR number resolution ---

describe("PR number resolution", () => {
  test("resolves PR number to branch name via gh cli", async () => {
    mockedExeca.mockImplementation((cmd, args) => {
      if (cmd === "gh") {
        return Promise.resolve({
          stdout: "feature-branch\n",
        }) as ReturnType<typeof execa>;
      }
      return Promise.resolve({ stdout: "" }) as ReturnType<typeof execa>;
    });
    // worktree at resolved branch path exists
    mockedExistsSync.mockReturnValue(true);
    await runStart("/repo", "42", { json: true });
    expect(mockedExeca).toHaveBeenCalledWith("gh", [
      "pr",
      "view",
      "42",
      "--json",
      "headRefName",
      "--jq",
      ".headRefName",
    ]);
  });

  test("uses resolved branch name for worktree path", async () => {
    mockedExeca.mockImplementation((cmd) => {
      if (cmd === "gh") {
        return Promise.resolve({
          stdout: "my-pr-branch\n",
        }) as ReturnType<typeof execa>;
      }
      return Promise.resolve({ stdout: "" }) as ReturnType<typeof execa>;
    });
    // worktree does not exist → will try to create
    mockedExistsSync.mockImplementation((p) =>
      !String(p).includes("my-pr-branch") ? true : false,
    );
    await runStart("/repo", "99", { json: true });
    expect(mockedExeca).toHaveBeenCalledWith(
      "git",
      ["fetch", "origin", "my-pr-branch"],
      { cwd: "/repo" },
    );
  });
});

// --- .env.worktree generation ---

describe(".env.worktree generation", () => {
  test("refreshes .env.worktree when config exists", async () => {
    vi.mocked(loadGroveConfig).mockResolvedValue(fakeGroveConfig);
    mockedExistsSync.mockReturnValue(true); // both worktree and .env.worktree exist
    await runStart("/repo", "feature", { json: true });
    expect(mockedWriteFile).toHaveBeenCalledWith(
      expect.stringContaining(".env.worktree"),
      "WEB_PORT=3001\n",
      "utf-8",
    );
  });

  test("generates .env.worktree when file is absent and grove config exists", async () => {
    vi.mocked(loadGroveConfig).mockResolvedValue(fakeGroveConfig);
    mockedExistsSync.mockImplementation((p) =>
      !String(p).endsWith(".env.worktree") ? true : false,
    );
    await runStart("/repo", "feature", { json: true });
    expect(mockedWriteFile).toHaveBeenCalledWith(
      expect.stringContaining(".env.worktree"),
      "WEB_PORT=3001\n",
      "utf-8",
    );
  });

  test("regenerates .env.worktree when --refreshEnv is set even if file exists", async () => {
    vi.mocked(loadGroveConfig).mockResolvedValue(fakeGroveConfig);
    mockedExistsSync.mockReturnValue(true);
    await runStart("/repo", "feature", { refreshEnv: true, json: true });
    expect(mockedWriteFile).toHaveBeenCalled();
  });

  test("skips env generation entirely when grove config is absent", async () => {
    vi.mocked(loadGroveConfig).mockResolvedValue(null);
    mockedExistsSync.mockImplementation((p) =>
      !String(p).endsWith(".env.worktree") ? true : false,
    );
    await runStart("/repo", "feature", { json: true });
    expect(mockedWriteFile).not.toHaveBeenCalled();
  });

  test("throws when contract resolution returns error-severity issues", async () => {
    vi.mocked(loadGroveConfig).mockResolvedValue(fakeGroveConfig);
    mockedExistsSync.mockImplementation((p) =>
      !String(p).endsWith(".env.worktree") ? true : false,
    );
    vi.mocked(resolveContractEnvVars).mockReturnValue({
      issues: [{ severity: "error", message: "WEB_PORT is required" }],
      values: {},
    } as never);
    await expect(runStart("/repo", "feature", { json: true })).rejects.toThrow(
      "Env contract resolution failed",
    );
  });

  test("does not throw for warning-severity contract issues", async () => {
    vi.mocked(loadGroveConfig).mockResolvedValue(fakeGroveConfig);
    mockedExistsSync.mockImplementation((p) =>
      !String(p).endsWith(".env.worktree") ? true : false,
    );
    vi.mocked(resolveContractEnvVars).mockReturnValue({
      issues: [{ severity: "warning", message: "WEB_PORT not verified" }],
      values: {},
    } as never);
    await expect(
      runStart("/repo", "feature", { json: true }),
    ).resolves.toBeDefined();
  });
});

describe(".env bootstrap", () => {
  test("bootstraps .env from .env.example when .env is missing", async () => {
    mockedExistsSync.mockImplementation((p) => {
      const filePath = String(p);
      if (filePath.endsWith("/feature")) return true;
      if (filePath.endsWith(".env")) return false;
      if (filePath.endsWith(".env.example")) return true;
      return true;
    });

    await runStart("/repo", "feature", { json: true });

    expect(mockedCopyFile).toHaveBeenCalledWith(
      expect.stringContaining(".env.example"),
      expect.stringContaining(".env"),
    );
  });

  test("does not overwrite an existing .env", async () => {
    mockedExistsSync.mockReturnValue(true);
    await runStart("/repo", "feature", { json: true });
    expect(mockedCopyFile).not.toHaveBeenCalled();
  });
});

// --- shared stack ---

describe("shared stack", () => {
  test("skips shared stack when not configured", async () => {
    vi.mocked(resolveSharedStack).mockReturnValue(null);
    await runStart("/repo", "feature", { json: true });
    expect(vi.mocked(sharedUp)).not.toHaveBeenCalled();
  });

  test("starts shared stack when configured and not running", async () => {
    vi.mocked(loadGroveConfig).mockResolvedValue(fakeGroveConfig);
    const fakeSharedInfo = {
      projectName: "myapp-shared",
      composeFile: "compose.shared.yaml",
      composeFilePath: "/repo/compose.shared.yaml",
      exists: true,
      state: "not started" as const,
    };
    vi.mocked(resolveSharedStack).mockReturnValue(fakeSharedInfo);
    vi.mocked(getSharedStackState).mockResolvedValue("not started");
    await runStart("/repo", "feature", { json: true });
    expect(vi.mocked(sharedUp)).toHaveBeenCalledWith(fakeSharedInfo, "/repo");
  });

  test("skips sharedUp when shared stack is already running", async () => {
    vi.mocked(loadGroveConfig).mockResolvedValue(fakeGroveConfig);
    const fakeSharedInfo = {
      projectName: "myapp-shared",
      composeFile: "compose.shared.yaml",
      composeFilePath: "/repo/compose.shared.yaml",
      exists: true,
      state: "running" as const,
    };
    vi.mocked(resolveSharedStack).mockReturnValue(fakeSharedInfo);
    vi.mocked(getSharedStackState).mockResolvedValue("running");
    await runStart("/repo", "feature", { json: true });
    expect(vi.mocked(sharedUp)).not.toHaveBeenCalled();
  });

  test("skips sharedUp when compose file does not exist", async () => {
    vi.mocked(loadGroveConfig).mockResolvedValue(fakeGroveConfig);
    const fakeSharedInfo = {
      projectName: "myapp-shared",
      composeFile: "compose.shared.yaml",
      composeFilePath: "/repo/compose.shared.yaml",
      exists: false,
      state: "not started" as const,
    };
    vi.mocked(resolveSharedStack).mockReturnValue(fakeSharedInfo);
    vi.mocked(getSharedStackState).mockResolvedValue("not started");
    await runStart("/repo", "feature", { json: true });
    expect(vi.mocked(sharedUp)).not.toHaveBeenCalled();
  });
});

// --- provider discovery and return value ---

describe("provider start", () => {
  test("calls discoverProvider with worktree path and branch", async () => {
    await runStart("/repo", "feature", { json: true });
    expect(vi.mocked(discoverProvider)).toHaveBeenCalledWith(
      "/repo/.worktrees/feature",
      "feature",
    );
  });

  test("returns GroveEnvironment from provider.start()", async () => {
    const result = await runStart("/repo", "feature", { json: true });
    expect(result).toBe(fakeEnv);
  });
});
