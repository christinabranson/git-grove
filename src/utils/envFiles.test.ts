import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("fs", () => ({ existsSync: vi.fn() }));
vi.mock("fs/promises", () => ({ readFile: vi.fn(), copyFile: vi.fn() }));

import { existsSync } from "fs";
import { copyFile, readFile } from "fs/promises";
import { bootstrapUserEnvFile, buildStartupEnvironment } from "./envFiles.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("bootstrapUserEnvFile", () => {
  test("copies .env.example to .env when .env is missing", async () => {
    vi.mocked(existsSync).mockImplementation((p) => {
      const filePath = String(p);
      if (filePath.endsWith(".env")) return false;
      if (filePath.endsWith(".env.example")) return true;
      return false;
    });

    vi.mocked(copyFile).mockResolvedValue(undefined);

    const created = await bootstrapUserEnvFile("/worktree");

    expect(created).toBe(true);
    expect(vi.mocked(copyFile)).toHaveBeenCalledWith(
      "/worktree/.env.example",
      "/worktree/.env",
    );
  });

  test("never overwrites an existing .env", async () => {
    vi.mocked(existsSync).mockImplementation((p) =>
      String(p).endsWith(".env") ? true : false,
    );

    const created = await bootstrapUserEnvFile("/worktree");

    expect(created).toBe(false);
    expect(vi.mocked(copyFile)).not.toHaveBeenCalled();
  });
});

describe("buildStartupEnvironment", () => {
  test("merges files with precedence: shell > .env.worktree > .env > .env.example", async () => {
    vi.mocked(existsSync).mockImplementation((p) => {
      const filePath = String(p);
      return (
        filePath.endsWith(".env") ||
        filePath.endsWith(".env.example") ||
        filePath.endsWith(".env.worktree")
      );
    });

    vi.mocked(readFile).mockImplementation((p) => {
      const filePath = String(p);
      if (filePath.endsWith(".env.example")) {
        return Promise.resolve("FOO=example\nEXAMPLE_ONLY=yes\n") as never;
      }
      if (filePath.endsWith(".env.worktree")) {
        return Promise.resolve("FOO=worktree\nWORKTREE_ONLY=yes\n") as never;
      }
      return Promise.resolve("FOO=user\nUSER_ONLY=yes\n") as never;
    });

    const result = await buildStartupEnvironment("/worktree", {
      FOO: "shell",
      SHELL_ONLY: "yes",
    });

    expect(result.merged["FOO"]).toBe("shell");
    expect(result.merged["EXAMPLE_ONLY"]).toBe("yes");
    expect(result.merged["USER_ONLY"]).toBe("yes");
    expect(result.merged["WORKTREE_ONLY"]).toBe("yes");
    expect(result.merged["SHELL_ONLY"]).toBe("yes");
  });
});
