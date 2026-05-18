import { vi, describe, test, expect, beforeEach } from "vitest";

vi.mock("execa", () => ({ execa: vi.fn() }));
vi.mock("fs", () => ({ existsSync: vi.fn() }));
vi.mock("fs/promises", () => ({ writeFile: vi.fn(), mkdir: vi.fn() }));
vi.mock("readline", () => ({
  default: { createInterface: vi.fn() },
  createInterface: vi.fn(),
}));
vi.mock("../setup/detect.js");
vi.mock("../setup/presets.js");
vi.mock("../setup/naming.js");
vi.mock("../data/worktrees.js");
vi.mock("../data/groveConfig.js");
vi.mock("../providers/docker-compose-contract.js");
vi.mock("../providers/shared.js", () => ({
  DEFAULT_SHARED_COMPOSE_FILE: "compose.shared.yaml",
}));
vi.mock("../utils/hardcodedPortsCheck.js");

import { execa } from "execa";
import { existsSync } from "fs";
import { writeFile, mkdir } from "fs/promises";
import * as readline from "readline";
import type { MockedFunction } from "vitest";
import { detectProject } from "../setup/detect.js";
import { recommendPreset, presets } from "../setup/presets.js";
import { expandNaming, buildCanonicalEnvVars } from "../setup/naming.js";
import { detectDefaultBranch } from "../data/worktrees.js";
import { loadGroveConfig } from "../data/groveConfig.js";
import {
  discoverComposeContract,
  readEnvFile,
  readSourceEnvFiles,
  resolveContractEnvVars,
  selectCanonicalEnvForOutput,
  renderEnvContent,
} from "../providers/docker-compose-contract.js";
import { warnIfHardcodedComposePorts } from "../utils/hardcodedPortsCheck.js";
import { runSetup } from "./setup.js";
import type { GroveConfig } from "../types.js";

const mockedExeca = execa as MockedFunction<typeof execa>;
const mockedExistsSync = existsSync as MockedFunction<typeof existsSync>;
const mockedWriteFile = writeFile as MockedFunction<typeof writeFile>;
const mockedMkdir = mkdir as MockedFunction<typeof mkdir>;

const fakeConfig: GroveConfig = {
  enabled: true,
  project: "myapp",
  providers: { type: "docker-compose" },
  naming: {
    composeProject: "myapp-${branchSafe}",
  },
};

const fakeDetection = {
  hasDockerCompose: true,
  hasPackageJson: false,
  composeServices: ["web", "db"],
  appServices: ["web"],
  sharedServices: ["db"],
  framework: null,
};

const fakeContract = {
  expectedVars: [],
  portRefs: [],
  dbNameRefs: [],
  projectNameVars: [],
  warnings: [],
};

function makeReadlineInterface(answer: string) {
  return {
    question: vi.fn((_: string, cb: (a: string) => void) => cb(answer)),
    close: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  mockedExistsSync.mockReturnValue(false);
  mockedWriteFile.mockResolvedValue(undefined);
  mockedMkdir.mockResolvedValue(undefined as never);
  mockedExeca.mockResolvedValue({ stdout: "main" } as ReturnType<typeof execa>);

  vi.mocked(detectProject).mockResolvedValue(fakeDetection as never);
  vi.mocked(recommendPreset).mockReturnValue("docker-compose" as never);
  vi.mocked(presets as Record<string, { generate: ReturnType<typeof vi.fn> }>)[
    "docker-compose"
  ] = { generate: vi.fn().mockReturnValue({ ...fakeConfig }) };
  vi.mocked(detectDefaultBranch).mockResolvedValue("main");
  vi.mocked(loadGroveConfig).mockResolvedValue(null);
  vi.mocked(warnIfHardcodedComposePorts).mockResolvedValue(undefined);

  vi.mocked(expandNaming).mockReturnValue({} as never);
  vi.mocked(buildCanonicalEnvVars).mockResolvedValue({} as never);
  vi.mocked(discoverComposeContract).mockResolvedValue(fakeContract as never);
  vi.mocked(readEnvFile).mockResolvedValue({});
  vi.mocked(readSourceEnvFiles).mockResolvedValue({});
  vi.mocked(resolveContractEnvVars).mockReturnValue({
    issues: [],
    values: {},
  } as never);
  vi.mocked(selectCanonicalEnvForOutput).mockReturnValue({} as never);
  vi.mocked(renderEnvContent).mockReturnValue("WEB_PORT=3001\n");

  vi.mocked(readline.createInterface).mockReturnValue(
    makeReadlineInterface("y") as never,
  );
});

// --- existing config guard ---

describe("existing config guard", () => {
  test("returns early without writing when config exists and no --reset or --refreshEnv", async () => {
    mockedExistsSync.mockReturnValue(true);
    await runSetup("/repo", {});
    expect(mockedWriteFile).not.toHaveBeenCalled();
    expect(vi.mocked(detectProject)).not.toHaveBeenCalled();
  });

  test("proceeds when config exists and --reset is set", async () => {
    mockedExistsSync.mockReturnValue(false); // config doesn't exist for the guard
    await runSetup("/repo", { yes: true, reset: true });
    expect(vi.mocked(detectProject)).toHaveBeenCalled();
  });

  test("regenerates .env.worktree when config exists and --refreshEnv is set", async () => {
    mockedExistsSync.mockImplementation((p) =>
      String(p).endsWith("config.json"),
    );
    vi.mocked(loadGroveConfig).mockResolvedValue(fakeConfig);
    await runSetup("/repo", { refreshEnv: true });
    expect(mockedWriteFile).toHaveBeenCalledWith(
      expect.stringContaining(".env.worktree"),
      "WEB_PORT=3001\n",
      "utf-8",
    );
    expect(vi.mocked(detectProject)).not.toHaveBeenCalled();
  });

  test("returns early with warning when --refreshEnv but loadGroveConfig returns null", async () => {
    mockedExistsSync.mockImplementation((p) =>
      String(p).endsWith("config.json"),
    );
    vi.mocked(loadGroveConfig).mockResolvedValue(null);
    await runSetup("/repo", { refreshEnv: true });
    expect(mockedWriteFile).not.toHaveBeenCalled();
  });
});

// --- dry run ---

describe("--dry-run", () => {
  test("does not write config file in dry-run mode", async () => {
    await runSetup("/repo", { dryRun: true });
    expect(mockedWriteFile).not.toHaveBeenCalled();
  });

  test("still calls detectProject in dry-run mode", async () => {
    await runSetup("/repo", { dryRun: true });
    expect(vi.mocked(detectProject)).toHaveBeenCalledWith("/repo");
  });
});

// --- preset selection ---

describe("preset selection", () => {
  test("uses recommendPreset when no preset option is given", async () => {
    vi.mocked(recommendPreset).mockReturnValue("docker-compose" as never);
    await runSetup("/repo", { yes: true });
    expect(vi.mocked(recommendPreset)).toHaveBeenCalledWith(fakeDetection);
  });

  test("uses explicit preset from opts without calling recommendPreset", async () => {
    vi.mocked(
      presets as Record<string, { generate: ReturnType<typeof vi.fn> }>,
    )["node-scripts"] = {
      generate: vi.fn().mockReturnValue({ ...fakeConfig }),
    };
    await runSetup("/repo", { yes: true, preset: "node-scripts" as never });
    expect(vi.mocked(recommendPreset)).not.toHaveBeenCalled();
  });

  test("calls process.exit(1) for unknown preset", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit(1)");
    });
    await expect(
      runSetup("/repo", { yes: true, preset: "nonexistent" as never }),
    ).rejects.toThrow("process.exit(1)");
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });
});

// --- config writing ---

describe("config writing", () => {
  test("writes .grove/config.json when confirmed with --yes", async () => {
    await runSetup("/repo", { yes: true });
    expect(mockedWriteFile).toHaveBeenCalledWith(
      expect.stringContaining("config.json"),
      expect.stringContaining('"project"'),
      "utf-8",
    );
  });

  test("creates .grove directory when it does not exist", async () => {
    mockedExistsSync.mockReturnValue(false);
    await runSetup("/repo", { yes: true });
    expect(mockedMkdir).toHaveBeenCalledWith(
      expect.stringContaining(".grove"),
      { recursive: true },
    );
  });

  test("skips mkdir when .grove directory already exists", async () => {
    mockedExistsSync.mockImplementation((p) => String(p).endsWith(".grove"));
    await runSetup("/repo", { yes: true });
    expect(mockedMkdir).not.toHaveBeenCalled();
  });

  test("sets defaultBaseBranch from detectDefaultBranch in written config", async () => {
    vi.mocked(detectDefaultBranch).mockResolvedValue("develop");
    await runSetup("/repo", { yes: true });
    const call = mockedWriteFile.mock.calls.find((c) =>
      String(c[0]).endsWith("config.json"),
    );
    expect(call).toBeDefined();
    const written = JSON.parse(call![1] as string);
    expect(written.worktrees?.defaultBaseBranch).toBe("develop");
  });
});

// --- confirmation prompt ---

describe("confirmation prompt", () => {
  test("cancels without writing when user answers 'n'", async () => {
    vi.mocked(readline.createInterface).mockReturnValue(
      makeReadlineInterface("n") as never,
    );
    await runSetup("/repo", {});
    expect(mockedWriteFile).not.toHaveBeenCalled();
  });

  test("writes config when user answers 'y'", async () => {
    vi.mocked(readline.createInterface).mockReturnValue(
      makeReadlineInterface("y") as never,
    );
    await runSetup("/repo", {});
    expect(mockedWriteFile).toHaveBeenCalledWith(
      expect.stringContaining("config.json"),
      expect.any(String),
      "utf-8",
    );
  });
});

// --- post-write env regeneration ---

describe("post-write --refreshEnv", () => {
  test("regenerates .env.worktree after writing config when --refreshEnv and --yes", async () => {
    await runSetup("/repo", { yes: true, refreshEnv: true });
    const envCall = mockedWriteFile.mock.calls.find((c) =>
      String(c[0]).endsWith(".env.worktree"),
    );
    expect(envCall).toBeDefined();
  });

  test("throws when env contract resolution fails during post-write regeneration", async () => {
    vi.mocked(resolveContractEnvVars).mockReturnValue({
      issues: [{ severity: "error", message: "Missing required var" }],
      values: {},
    } as never);
    await expect(
      runSetup("/repo", { yes: true, refreshEnv: true }),
    ).rejects.toThrow("Env contract resolution failed");
  });
});
