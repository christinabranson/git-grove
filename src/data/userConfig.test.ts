import { vi, describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "fs/promises";
import path from "path";
import os from "os";

// Set GROVE_HOME before importing so the module picks it up
let groveHome: string;
let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "grove-userconfig-test-"));
  groveHome = path.join(tmpDir, "grove-home");
  process.env.GROVE_HOME = groveHome;
});

afterEach(async () => {
  delete process.env.GROVE_HOME;
  await rm(tmpDir, { recursive: true, force: true });
});

vi.mock("execa", () => ({ execa: vi.fn() }));

import { execa } from "execa";
import type { MockedFunction } from "vitest";
import {
  getGroveHome,
  getRepoId,
  getRepoConfigPath,
  getRepoConfigDir,
  loadUserRepoConfig,
  saveUserRepoConfig,
  getNestedValue,
  setNestedValue,
  coerceValue,
  flattenConfig,
  getConfigValue,
  setConfigValue,
} from "./userConfig.js";
import type { GroveConfig } from "../types.js";

const mockedExeca = execa as MockedFunction<typeof execa>;

const fakeConfig: GroveConfig = {
  enabled: true,
  project: "my-app",
  providers: { web: { type: "docker-compose", service: "web" } },
};

// --- getGroveHome ---

describe("getGroveHome", () => {
  test("returns GROVE_HOME when set", () => {
    expect(getGroveHome()).toBe(groveHome);
  });

  test("returns ~/.grove when GROVE_HOME is not set", () => {
    delete process.env.GROVE_HOME;
    expect(getGroveHome()).toBe(path.join(os.homedir(), ".grove"));
  });
});

// --- getRepoId ---

describe("getRepoId", () => {
  test("returns normalized remote URL when origin exists", async () => {
    mockedExeca.mockResolvedValue({
      stdout: "https://github.com/user/my-app.git",
    } as ReturnType<typeof execa>);
    const id = await getRepoId("/repo");
    expect(id).toBe("github.com-user-my-app");
  });

  test("strips .git suffix", async () => {
    mockedExeca.mockResolvedValue({
      stdout: "git@github.com:user/my-app.git",
    } as ReturnType<typeof execa>);
    const id = await getRepoId("/repo");
    expect(id).toBe("github.com-user-my-app");
  });

  test("falls back to path hash when no remote", async () => {
    mockedExeca.mockRejectedValue(new Error("no remote"));
    const id = await getRepoId("/repo");
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  test("produces same hash for same path", async () => {
    mockedExeca.mockRejectedValue(new Error("no remote"));
    const id1 = await getRepoId("/some/repo");
    const id2 = await getRepoId("/some/repo");
    expect(id1).toBe(id2);
  });

  test("produces different hashes for different paths", async () => {
    mockedExeca.mockRejectedValue(new Error("no remote"));
    const id1 = await getRepoId("/repo/a");
    const id2 = await getRepoId("/repo/b");
    expect(id1).not.toBe(id2);
  });

  test("falls back to hash when remote returns empty string", async () => {
    mockedExeca.mockResolvedValue({ stdout: "   " } as ReturnType<
      typeof execa
    >);
    const id = await getRepoId("/repo");
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });
});

// --- getRepoConfigPath / getRepoConfigDir ---

describe("getRepoConfigPath", () => {
  test("returns path under GROVE_HOME", () => {
    const p = getRepoConfigPath("my-repo-id");
    expect(p).toBe(path.join(groveHome, "repos", "my-repo-id", "config.json"));
  });
});

describe("getRepoConfigDir", () => {
  test("returns dir under GROVE_HOME", () => {
    const d = getRepoConfigDir("my-repo-id");
    expect(d).toBe(path.join(groveHome, "repos", "my-repo-id"));
  });
});

// --- loadUserRepoConfig ---

describe("loadUserRepoConfig", () => {
  beforeEach(() => {
    mockedExeca.mockRejectedValue(new Error("no remote"));
  });

  test("returns null when config file does not exist", async () => {
    const result = await loadUserRepoConfig("/repo");
    expect(result).toBeNull();
  });

  test("returns null when config has enabled: false", async () => {
    const repoId = await getRepoId("/repo");
    const configPath = getRepoConfigPath(repoId);
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(
      configPath,
      JSON.stringify({ enabled: false, project: "x", providers: {} }),
    );
    const result = await loadUserRepoConfig("/repo");
    expect(result).toBeNull();
  });

  test("returns config when enabled: true", async () => {
    const repoId = await getRepoId("/repo");
    const configPath = getRepoConfigPath(repoId);
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, JSON.stringify(fakeConfig));
    const result = await loadUserRepoConfig("/repo");
    expect(result?.project).toBe("my-app");
    expect(result?.enabled).toBe(true);
  });

  test("returns null for malformed JSON", async () => {
    const repoId = await getRepoId("/repo");
    const configPath = getRepoConfigPath(repoId);
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, "not json");
    const result = await loadUserRepoConfig("/repo");
    expect(result).toBeNull();
  });
});

// --- saveUserRepoConfig ---

describe("saveUserRepoConfig", () => {
  test("writes config file and returns path info", async () => {
    mockedExeca.mockRejectedValue(new Error("no remote"));
    const { repoId, configPath } = await saveUserRepoConfig(
      "/repo",
      fakeConfig,
    );
    expect(repoId).toMatch(/^[0-9a-f]{16}$/);
    const raw = await readFile(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.project).toBe("my-app");
    expect(parsed.enabled).toBe(true);
  });

  test("creates parent directories if needed", async () => {
    mockedExeca.mockRejectedValue(new Error("no remote"));
    await saveUserRepoConfig("/repo", fakeConfig);
    const repoId = await getRepoId("/repo");
    const dir = path.join(groveHome, "repos", repoId);
    const { existsSync } = await import("fs");
    expect(existsSync(dir)).toBe(true);
  });
});

// --- getNestedValue ---

describe("getNestedValue", () => {
  const obj = { a: { b: { c: 42 } }, x: "hello" };

  test("returns top-level value", () => {
    expect(getNestedValue(obj as never, "x")).toBe("hello");
  });

  test("returns deeply nested value", () => {
    expect(getNestedValue(obj as never, "a.b.c")).toBe(42);
  });

  test("returns undefined for missing key", () => {
    expect(getNestedValue(obj as never, "a.z")).toBeUndefined();
  });

  test("returns undefined when path traverses non-object", () => {
    expect(getNestedValue(obj as never, "x.foo")).toBeUndefined();
  });
});

// --- setNestedValue ---

describe("setNestedValue", () => {
  test("sets a top-level key", () => {
    const obj: Record<string, unknown> = {};
    setNestedValue(obj, "project", "myapp");
    expect(obj.project).toBe("myapp");
  });

  test("creates intermediate objects", () => {
    const obj: Record<string, unknown> = {};
    setNestedValue(obj, "providers.web.type", "docker-compose");
    expect(obj.providers as Record<string, unknown>).toMatchObject({
      web: { type: "docker-compose" },
    });
  });

  test("overwrites existing value", () => {
    const obj: Record<string, unknown> = { project: "old" };
    setNestedValue(obj, "project", "new");
    expect(obj.project).toBe("new");
  });

  test("replaces non-object intermediate with object", () => {
    const obj: Record<string, unknown> = { a: "string" };
    setNestedValue(obj, "a.b", "value");
    expect((obj.a as Record<string, unknown>).b).toBe("value");
  });
});

// --- coerceValue ---

describe("coerceValue", () => {
  test("coerces 'true' to boolean true", () => {
    expect(coerceValue("true")).toBe(true);
  });

  test("coerces 'false' to boolean false", () => {
    expect(coerceValue("false")).toBe(false);
  });

  test("coerces numeric strings to numbers", () => {
    expect(coerceValue("42")).toBe(42);
    expect(coerceValue("3.14")).toBe(3.14);
  });

  test("keeps plain strings as strings", () => {
    expect(coerceValue("my-app")).toBe("my-app");
    expect(coerceValue("${project}-${branch_safe}")).toBe(
      "${project}-${branch_safe}",
    );
  });

  test("keeps empty string as string", () => {
    expect(coerceValue("")).toBe("");
  });
});

// --- flattenConfig ---

describe("flattenConfig", () => {
  test("flattens nested object to dot-path entries", () => {
    const result = flattenConfig({ a: { b: 1 }, c: "x" });
    expect(result).toContainEqual(["a.b", "1"]);
    expect(result).toContainEqual(["c", '"x"']);
  });

  test("handles arrays as leaf values", () => {
    const result = flattenConfig({ files: [".env", ".env.example"] });
    expect(result).toContainEqual(["files", '[".env",".env.example"]']);
  });

  test("handles null as leaf value", () => {
    const result = flattenConfig({ x: null });
    expect(result).toContainEqual(["x", "null"]);
  });

  test("produces no entries for empty object", () => {
    expect(flattenConfig({})).toEqual([]);
  });
});

// --- getConfigValue / setConfigValue ---

describe("getConfigValue / setConfigValue", () => {
  beforeEach(() => {
    mockedExeca.mockRejectedValue(new Error("no remote"));
  });

  test("set then get returns the value", async () => {
    await setConfigValue("/repo", "project", "my-app");
    const value = await getConfigValue("/repo", "project");
    expect(value).toBe("my-app");
  });

  test("set coerces booleans", async () => {
    await setConfigValue("/repo", "enabled", "true");
    const value = await getConfigValue("/repo", "enabled");
    expect(value).toBe(true);
  });

  test("set creates nested paths", async () => {
    await setConfigValue("/repo", "providers.web.type", "custom-shell");
    const value = await getConfigValue("/repo", "providers.web.type");
    expect(value).toBe("custom-shell");
  });

  test("getConfigValue returns undefined when no config exists", async () => {
    const value = await getConfigValue("/no-config", "project");
    expect(value).toBeUndefined();
  });

  test("setConfigValue returns repoId and configPath", async () => {
    const { repoId, configPath } = await setConfigValue(
      "/repo",
      "project",
      "my-app",
    );
    expect(repoId).toMatch(/^[0-9a-f]{16}$/);
    expect(configPath).toContain("config.json");
  });

  test("multiple sets accumulate without overwriting unrelated keys", async () => {
    await setConfigValue("/repo", "project", "my-app");
    await setConfigValue("/repo", "enabled", "true");
    expect(await getConfigValue("/repo", "project")).toBe("my-app");
    expect(await getConfigValue("/repo", "enabled")).toBe(true);
  });
});
