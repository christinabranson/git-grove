import { vi, describe, test, expect, beforeEach } from "vitest";

vi.mock("execa", () => ({ execa: vi.fn() }));
vi.mock("fs", () => ({ existsSync: vi.fn() }));
vi.mock("fs/promises", () => ({ readFile: vi.fn() }));
vi.mock("../data/groveConfig.js");
vi.mock("./docker-compose-contract.js");

import { execa } from "execa";
import { existsSync } from "fs";
import { readFile } from "fs/promises";
import type { MockedFunction } from "vitest";
import { loadGroveConfig } from "../data/groveConfig.js";
import {
  discoverComposeContract,
  preflightComposeEnv,
  readEnvFile,
} from "./docker-compose-contract.js";
import { DockerComposeProvider } from "./docker-compose.js";

const mockedExeca = execa as MockedFunction<typeof execa>;
const mockedExistsSync = existsSync as MockedFunction<typeof existsSync>;
const mockedReadFile = readFile as MockedFunction<typeof readFile>;

const fakeContract = {
  expectedVars: [],
  portRefs: [],
  dbNameRefs: [],
  warnings: [],
};

const envFileContent = [
  "COMPOSE_PROJECT_NAME=myapp-feature",
  "WEB_PORT=3001",
  "DB_SCHEMA=myapp_feature",
].join("\n");

beforeEach(() => {
  vi.clearAllMocks();
  mockedExistsSync.mockReturnValue(true);
  mockedReadFile.mockResolvedValue(envFileContent as never);
  mockedExeca.mockResolvedValue({ stdout: "" } as ReturnType<typeof execa>);
  vi.mocked(loadGroveConfig).mockResolvedValue(null);
  vi.mocked(discoverComposeContract).mockResolvedValue(fakeContract as never);
  vi.mocked(readEnvFile).mockResolvedValue({
    COMPOSE_PROJECT_NAME: "myapp-feature",
    WEB_PORT: "3001",
  });
  vi.mocked(preflightComposeEnv).mockResolvedValue({
    ok: true,
    issues: [],
  } as never);
});

describe("DockerComposeProvider.start()", () => {
  test("runs docker compose up with the project name from .env.worktree", async () => {
    const provider = new DockerComposeProvider("/worktree/feature", "feature");
    await provider.start();
    expect(mockedExeca).toHaveBeenCalledWith(
      "docker",
      expect.arrayContaining(["compose", "-p", "myapp-feature", "up"]),
      expect.objectContaining({
        cwd: "/worktree/feature",
        env: expect.any(Object),
      }),
    );
  });

  test("uses worktree dir name as project name when .env.worktree is absent", async () => {
    mockedExistsSync.mockReturnValue(false);
    const provider = new DockerComposeProvider("/worktree/feature", "feature");
    await provider.start();
    expect(mockedExeca).toHaveBeenCalledWith(
      "docker",
      expect.arrayContaining(["-p", "feature"]),
      expect.anything(),
    );
  });

  test("throws when preflight check fails", async () => {
    vi.mocked(preflightComposeEnv).mockResolvedValue({
      ok: false,
      issues: [{ severity: "error", message: "WEB_PORT is not set" }],
    } as never);
    const provider = new DockerComposeProvider("/worktree/feature", "feature");
    await expect(provider.start()).rejects.toThrow(
      "Compose env preflight failed",
    );
  });

  test("returns GroveEnvironment with web url when WEB_PORT is set", async () => {
    const provider = new DockerComposeProvider("/worktree/feature", "feature");
    const env = await provider.start();
    expect(env.web?.url).toBe("http://localhost:3001");
    expect(env.metadata.provider).toBe("docker-compose");
    expect(env.metadata.source).toBe("grove");
  });

  test("returns GroveEnvironment without web when WEB_PORT is absent", async () => {
    mockedReadFile.mockResolvedValue(
      "COMPOSE_PROJECT_NAME=myapp-feature\n" as never,
    );
    const provider = new DockerComposeProvider("/worktree/feature", "feature");
    const env = await provider.start();
    expect(env.web).toBeUndefined();
  });
});

describe("DockerComposeProvider.stop()", () => {
  test("runs docker compose down with the project name from .env.worktree", async () => {
    const provider = new DockerComposeProvider("/worktree/feature", "feature");
    await provider.stop();
    expect(mockedExeca).toHaveBeenCalledWith(
      "docker",
      expect.arrayContaining(["compose", "-p", "myapp-feature", "down"]),
      expect.objectContaining({
        cwd: "/worktree/feature",
        env: expect.any(Object),
      }),
    );
  });
});

describe("DockerComposeProvider.status()", () => {
  test("returns running state when all containers are running", async () => {
    mockedExeca.mockResolvedValue({
      stdout: JSON.stringify({ State: "running" }),
    } as ReturnType<typeof execa>);
    const provider = new DockerComposeProvider("/worktree/feature", "feature");
    const env = await provider.status();
    expect(env.metadata.provider).toBe("docker-compose");
    expect(env.web?.url).toBe("http://localhost:3001");
  });

  test("returns environment with no web when .env.worktree is absent", async () => {
    mockedExistsSync.mockReturnValue(false);
    const provider = new DockerComposeProvider("/worktree/feature", "feature");
    const env = await provider.status();
    expect(env.web).toBeUndefined();
  });

  test("returns not-started state gracefully when docker fails", async () => {
    mockedExeca.mockRejectedValue(new Error("docker not running"));
    const provider = new DockerComposeProvider("/worktree/feature", "feature");
    const env = await provider.status();
    expect(env.metadata.provider).toBe("docker-compose");
  });
});
