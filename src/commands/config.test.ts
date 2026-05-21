import { vi, describe, test, expect, beforeEach, afterEach } from "vitest";

vi.mock("execa", () => ({ execa: vi.fn() }));
vi.mock("../providers/docker-compose-contract.js");

import { execa } from "execa";
import type { MockedFunction } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import path from "path";
import os from "os";
import { readEnvFile } from "../providers/docker-compose-contract.js";
import { runConfigGet, runConfigSet, runConfigList } from "./config.js";

const mockedExeca = execa as MockedFunction<typeof execa>;
const mockedReadEnvFile = readEnvFile as MockedFunction<typeof readEnvFile>;

let tmpDir: string;
let groveHome: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "grove-config-cmd-test-"));
  groveHome = path.join(tmpDir, "grove-home");
  process.env.GROVE_HOME = groveHome;
  mockedExeca.mockRejectedValue(new Error("no remote"));
  mockedReadEnvFile.mockResolvedValue({});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  delete process.env.GROVE_HOME;
  vi.restoreAllMocks();
  await rm(tmpDir, { recursive: true, force: true });
});

// --- runConfigSet ---

describe("runConfigSet", () => {
  test("writes a value and logs success", async () => {
    await runConfigSet("/repo", "project", "my-app");
    expect(vi.mocked(console.log)).toHaveBeenCalledWith(
      expect.stringContaining("project"),
    );
  });

  test("coerces boolean strings", async () => {
    await runConfigSet("/repo", "enabled", "true");
    const { getConfigValue } = await import("../data/userConfig.js");
    const value = await getConfigValue("/repo", "enabled");
    expect(value).toBe(true);
  });

  test("coerces numeric strings", async () => {
    await runConfigSet("/repo", "naming.ports.WEB_PORT", "3000");
    const { getConfigValue } = await import("../data/userConfig.js");
    const value = await getConfigValue("/repo", "naming.ports.WEB_PORT");
    expect(value).toBe(3000);
  });

  test("handles nested key paths", async () => {
    await runConfigSet("/repo", "providers.web.type", "custom-shell");
    const { getConfigValue } = await import("../data/userConfig.js");
    const value = await getConfigValue("/repo", "providers.web.type");
    expect(value).toBe("custom-shell");
  });
});

// --- runConfigGet ---

describe("runConfigGet", () => {
  test("prints value for existing key", async () => {
    await runConfigSet("/repo", "project", "my-app");
    await runConfigGet("/repo", "project");
    expect(vi.mocked(console.log)).toHaveBeenCalledWith("my-app");
  });

  test("exits 1 and logs error for missing key", async () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    await runConfigGet("/repo", "nonexistent.key");
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(vi.mocked(console.error)).toHaveBeenCalledWith(
      expect.stringContaining("nonexistent.key"),
    );
  });

  test("prints JSON for non-string values", async () => {
    await runConfigSet("/repo", "enabled", "true");
    await runConfigGet("/repo", "enabled");
    expect(vi.mocked(console.log)).toHaveBeenCalledWith("true");
  });
});

// --- runConfigList ---

describe("runConfigList", () => {
  test("shows no-config message when unconfigured", async () => {
    await runConfigList("/repo");
    expect(vi.mocked(console.log)).toHaveBeenCalledWith(
      expect.stringContaining("No config found"),
    );
  });

  test("shows repo config entries when configured", async () => {
    await runConfigSet("/repo", "project", "my-app");
    await runConfigSet("/repo", "enabled", "true");
    await runConfigList("/repo");
    const calls = vi
      .mocked(console.log)
      .mock.calls.map((c) => c.join(" "))
      .join("\n");
    expect(calls).toContain("project");
    expect(calls).toContain("my-app");
  });

  test("shows worktree env section when .env.worktree has values", async () => {
    await runConfigSet("/repo", "project", "my-app");
    await runConfigSet("/repo", "enabled", "true");
    mockedReadEnvFile.mockResolvedValue({
      COMPOSE_PROJECT_NAME: "my-app-main",
      WEB_PORT: "3001",
    });
    await runConfigList("/repo");
    const calls = vi
      .mocked(console.log)
      .mock.calls.map((c) => c.join(" "))
      .join("\n");
    expect(calls).toContain("COMPOSE_PROJECT_NAME");
    expect(calls).toContain("WEB_PORT");
  });

  test("omits worktree section when .env.worktree is empty", async () => {
    await runConfigSet("/repo", "enabled", "true");
    mockedReadEnvFile.mockResolvedValue({});
    await runConfigList("/repo");
    const calls = vi
      .mocked(console.log)
      .mock.calls.map((c) => c.join(" "))
      .join("\n");
    expect(calls).not.toContain(".env.worktree");
  });

  test("uses worktreePath for env file when provided", async () => {
    await runConfigSet("/repo", "enabled", "true");
    mockedReadEnvFile.mockResolvedValue({ WEB_PORT: "8080" });
    await runConfigList("/repo", "/repo/worktrees/feat-x");
    expect(mockedReadEnvFile).toHaveBeenCalledWith("/repo/worktrees/feat-x");
  });
});
