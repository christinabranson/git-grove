import { vi, describe, test, expect, beforeEach } from "vitest";

vi.mock("execa", () => ({ execa: vi.fn() }));
vi.mock("fs", () => ({ existsSync: vi.fn() }));

import { execa } from "execa";
import { existsSync } from "fs";
import type { MockedFunction } from "vitest";
import {
  resolveSharedStack,
  getSharedStackState,
  sharedUp,
  sharedDown,
  DEFAULT_SHARED_COMPOSE_FILE,
} from "./shared.js";
import type { GroveConfig } from "../types.js";

const mockedExeca = execa as MockedFunction<typeof execa>;
const mockedExistsSync = existsSync as MockedFunction<typeof existsSync>;

function makeConfig(overrides: Partial<GroveConfig> = {}): GroveConfig {
  return {
    enabled: true,
    project: "myapp",
    providers: {},
    naming: { sharedProject: "myapp-shared" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedExistsSync.mockReturnValue(true);
  mockedExeca.mockResolvedValue({ stdout: "" } as ReturnType<typeof execa>);
});

// --- resolveSharedStack ---

describe("resolveSharedStack", () => {
  test("returns null when config has no sharedProject", () => {
    const config = makeConfig({ naming: {} });
    expect(resolveSharedStack("/repo", config)).toBeNull();
  });

  test("returns null when config is null", () => {
    expect(resolveSharedStack("/repo", null)).toBeNull();
  });

  test("returns SharedStackInfo when sharedProject is configured", () => {
    const info = resolveSharedStack("/repo", makeConfig());
    expect(info).not.toBeNull();
    expect(info!.projectName).toBe("myapp-shared");
  });

  test("uses DEFAULT_SHARED_COMPOSE_FILE when no sharedComposeFile is set", () => {
    const info = resolveSharedStack("/repo", makeConfig());
    expect(info!.composeFile).toBe(DEFAULT_SHARED_COMPOSE_FILE);
    expect(info!.composeFilePath).toBe(`/repo/${DEFAULT_SHARED_COMPOSE_FILE}`);
  });

  test("uses custom sharedComposeFile from config", () => {
    const config = makeConfig({ sharedComposeFile: "docker/shared.yaml" });
    const info = resolveSharedStack("/repo", config);
    expect(info!.composeFile).toBe("docker/shared.yaml");
    expect(info!.composeFilePath).toBe("/repo/docker/shared.yaml");
  });

  test("uses absolute sharedComposeFile path directly without joining", () => {
    const config = makeConfig({ sharedComposeFile: "/absolute/shared.yaml" });
    const info = resolveSharedStack("/repo", config);
    expect(info!.composeFilePath).toBe("/absolute/shared.yaml");
  });

  test("sets exists=true when compose file is present", () => {
    mockedExistsSync.mockReturnValue(true);
    const info = resolveSharedStack("/repo", makeConfig());
    expect(info!.exists).toBe(true);
  });

  test("sets exists=false when compose file is absent", () => {
    mockedExistsSync.mockReturnValue(false);
    const info = resolveSharedStack("/repo", makeConfig());
    expect(info!.exists).toBe(false);
  });
});

// --- getSharedStackState ---

describe("getSharedStackState", () => {
  const baseInfo = {
    projectName: "myapp-shared",
    composeFile: "compose.shared.yaml",
    composeFilePath: "/repo/compose.shared.yaml",
    exists: true,
    state: "not started" as const,
  };

  test("returns not started when compose file does not exist", async () => {
    const info = { ...baseInfo, exists: false };
    expect(await getSharedStackState(info)).toBe("not started");
    expect(mockedExeca).not.toHaveBeenCalled();
  });

  test("returns not started when docker ps returns no containers", async () => {
    mockedExeca.mockResolvedValue({ stdout: "" } as ReturnType<typeof execa>);
    expect(await getSharedStackState(baseInfo)).toBe("not started");
  });

  test("returns running when all containers are running", async () => {
    mockedExeca.mockResolvedValue({
      stdout: [
        JSON.stringify({ State: "running" }),
        JSON.stringify({ State: "running" }),
      ].join("\n"),
    } as ReturnType<typeof execa>);
    expect(await getSharedStackState(baseInfo)).toBe("running");
  });

  test("returns partial when some containers are running", async () => {
    mockedExeca.mockResolvedValue({
      stdout: [
        JSON.stringify({ State: "running" }),
        JSON.stringify({ State: "exited" }),
      ].join("\n"),
    } as ReturnType<typeof execa>);
    expect(await getSharedStackState(baseInfo)).toBe("partial");
  });

  test("returns stopped when containers exist but none are running", async () => {
    mockedExeca.mockResolvedValue({
      stdout: JSON.stringify({ State: "exited" }),
    } as ReturnType<typeof execa>);
    expect(await getSharedStackState(baseInfo)).toBe("stopped");
  });

  test("returns not started when docker command fails", async () => {
    mockedExeca.mockRejectedValue(new Error("docker not running"));
    expect(await getSharedStackState(baseInfo)).toBe("not started");
  });
});

// --- sharedUp / sharedDown ---

describe("sharedUp", () => {
  test("runs docker compose up with the shared project and compose file", async () => {
    const info = {
      projectName: "myapp-shared",
      composeFile: "compose.shared.yaml",
      composeFilePath: "/repo/compose.shared.yaml",
      exists: true,
      state: "not started" as const,
    };
    await sharedUp(info, "/repo");
    expect(mockedExeca).toHaveBeenCalledWith(
      "docker",
      [
        "compose",
        "-f",
        "compose.shared.yaml",
        "-p",
        "myapp-shared",
        "up",
        "-d",
      ],
      { cwd: "/repo" },
    );
  });
});

describe("sharedDown", () => {
  test("runs docker compose down with the shared project and compose file", async () => {
    const info = {
      projectName: "myapp-shared",
      composeFile: "compose.shared.yaml",
      composeFilePath: "/repo/compose.shared.yaml",
      exists: true,
      state: "running" as const,
    };
    await sharedDown(info, "/repo");
    expect(mockedExeca).toHaveBeenCalledWith(
      "docker",
      ["compose", "-f", "compose.shared.yaml", "-p", "myapp-shared", "down"],
      { cwd: "/repo" },
    );
  });
});
