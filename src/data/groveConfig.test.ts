import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm, mkdir } from "fs/promises";
import { join } from "path";
import os from "os";
import { loadGroveConfig } from "./groveConfig.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(os.tmpdir(), "grove-config-test-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

async function writeConfig(data: object): Promise<void> {
  const groveDir = join(tmpDir, ".grove");
  await mkdir(groveDir, { recursive: true });
  await writeFile(join(groveDir, "config.json"), JSON.stringify(data), "utf-8");
}

describe("loadGroveConfig", () => {
  test("returns null when .grove/config.json does not exist", async () => {
    const result = await loadGroveConfig(tmpDir);
    expect(result).toBeNull();
  });

  test("returns null when config has enabled: false", async () => {
    await writeConfig({ enabled: false, project: "myapp", providers: {} });
    const result = await loadGroveConfig(tmpDir);
    expect(result).toBeNull();
  });

  test("returns parsed config when enabled: true", async () => {
    await writeConfig({ enabled: true, project: "myapp", providers: {} });
    const result = await loadGroveConfig(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.project).toBe("myapp");
    expect(result!.enabled).toBe(true);
  });

  test("returns null when config.json is malformed JSON", async () => {
    const groveDir = join(tmpDir, ".grove");
    await mkdir(groveDir, { recursive: true });
    await writeFile(join(groveDir, "config.json"), "not valid json", "utf-8");
    const result = await loadGroveConfig(tmpDir);
    expect(result).toBeNull();
  });

  test("returns full config including providers and naming", async () => {
    const config = {
      enabled: true,
      project: "my-project",
      providers: {
        web: { type: "docker-compose", service: "web" },
      },
      naming: {
        composeProject: "grove-${branch_safe}",
        dbSchema: "my_project_${branch_safe}",
        webPort: "auto",
      },
    };
    await writeConfig(config);
    const result = await loadGroveConfig(tmpDir);
    expect(result).toMatchObject(config);
  });

  test("returns null when .grove directory exists but config.json is missing", async () => {
    await mkdir(join(tmpDir, ".grove"), { recursive: true });
    const result = await loadGroveConfig(tmpDir);
    expect(result).toBeNull();
  });

  test("uses basePath correctly to find .grove/config.json", async () => {
    // Write to a subdirectory to verify the path is used correctly
    const subDir = join(tmpDir, "subproject");
    await mkdir(join(subDir, ".grove"), { recursive: true });
    await writeFile(
      join(subDir, ".grove", "config.json"),
      JSON.stringify({ enabled: true, project: "subproject", providers: {} }),
      "utf-8",
    );

    const result = await loadGroveConfig(subDir);
    expect(result?.project).toBe("subproject");
  });

  test("returns null when loading from a path where no config exists at the right subpath", async () => {
    // config is at tmpDir/.grove/config.json, but we pass a different path
    await writeConfig({ enabled: true, project: "myapp", providers: {} });
    const result = await loadGroveConfig(join(tmpDir, "nonexistent"));
    expect(result).toBeNull();
  });
});
