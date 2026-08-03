import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, writeFile, rm, mkdir } from "fs/promises";
import { join } from "path";
import os from "os";

vi.mock("execa", () => ({ execa: vi.fn() }));

import { execa } from "execa";
import type { MockedFunction } from "vitest";
import { loadGroveConfig } from "./groveConfig.js";
import { getRepoId, getRepoConfigPath } from "./userConfig.js";

const mockedExeca = execa as MockedFunction<typeof execa>;

let tmpDir: string;
let groveHome: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(os.tmpdir(), "grove-config-test-"));
  groveHome = join(tmpDir, "grove-home");
  process.env.GROVE_HOME = groveHome;
  mockedExeca.mockRejectedValue(new Error("no remote"));
});

afterEach(async () => {
  delete process.env.GROVE_HOME;
  await rm(tmpDir, { recursive: true, force: true });
});

async function writeConfig(repoPath: string, data: object): Promise<void> {
  const repoId = await getRepoId(repoPath);
  const configPath = getRepoConfigPath(repoId);
  await mkdir(join(configPath, ".."), { recursive: true });
  await writeFile(configPath, JSON.stringify(data), "utf-8");
}

describe("loadGroveConfig", () => {
  test("returns null when no config exists", async () => {
    const result = await loadGroveConfig("/repo");
    expect(result).toBeNull();
  });

  test("returns null when config has enabled: false", async () => {
    await writeConfig("/repo", {
      enabled: false,
      project: "myapp",
      providers: {},
    });
    const result = await loadGroveConfig("/repo");
    expect(result).toBeNull();
  });

  test("returns parsed config when enabled: true", async () => {
    await writeConfig("/repo", {
      enabled: true,
      project: "myapp",
      providers: {},
    });
    const result = await loadGroveConfig("/repo");
    expect(result).not.toBeNull();
    expect(result!.project).toBe("myapp");
    expect(result!.enabled).toBe(true);
  });

  test("returns null when config.json is malformed JSON", async () => {
    const repoId = await getRepoId("/repo");
    const configPath = getRepoConfigPath(repoId);
    await mkdir(join(configPath, ".."), { recursive: true });
    await writeFile(configPath, "not valid json", "utf-8");
    const result = await loadGroveConfig("/repo");
    expect(result).toBeNull();
  });

  test("returns full config including providers and naming", async () => {
    const config = {
      enabled: true,
      project: "my-project",
      providers: { web: { type: "docker-compose", service: "web" } },
      naming: {
        composeProject: "${project}-${branch_safe}",
        dbSchema: "my_project_${branch_safe}",
        webPort: "auto",
      },
    };
    await writeConfig("/repo", config);
    const result = await loadGroveConfig("/repo");
    expect(result).toMatchObject(config);
  });

  test("returns null for a path with no config stored", async () => {
    await writeConfig("/repo/a", {
      enabled: true,
      project: "a",
      providers: {},
    });
    const result = await loadGroveConfig("/repo/b");
    expect(result).toBeNull();
  });
});
