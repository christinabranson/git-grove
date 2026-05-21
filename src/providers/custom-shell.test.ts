import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("execa", () => ({ execa: vi.fn() }));
vi.mock("fs", () => ({ existsSync: vi.fn() }));
vi.mock("fs/promises", () => ({ readFile: vi.fn() }));

import { execa } from "execa";
import { existsSync } from "fs";
import { readFile } from "fs/promises";
import { CustomShellProvider } from "./custom-shell.js";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(execa).mockResolvedValue({ stdout: "" } as ReturnType<
    typeof execa
  >);
});

describe("CustomShellProvider.start()", () => {
  test("throws when .env.worktree is missing", async () => {
    vi.mocked(existsSync).mockImplementation((p) => {
      const file = String(p);
      if (file.endsWith("bin/start.sh")) return true;
      if (file.endsWith(".env.worktree")) return false;
      return false;
    });

    const provider = new CustomShellProvider(
      "/worktree",
      "feature",
      "bin/start.sh",
    );
    await expect(provider.start()).rejects.toThrow(
      "Missing .env.worktree. Run through grove start.",
    );
  });

  test("passes startup env with shell precedence and GROVE_ENV_FILE", async () => {
    const originalFoo = process.env.FOO;

    try {
      process.env.FOO = "shell";

      vi.mocked(existsSync).mockImplementation((p) => {
        const file = String(p);
        return (
          file.endsWith("bin/start.sh") ||
          file.endsWith(".env") ||
          file.endsWith(".env.example") ||
          file.endsWith(".env.worktree")
        );
      });

      vi.mocked(readFile).mockImplementation((p) => {
        const file = String(p);
        if (file.endsWith(".env.example")) {
          return Promise.resolve("FOO=example\n") as never;
        }
        if (file.endsWith(".env")) {
          return Promise.resolve("FOO=user\n") as never;
        }
        return Promise.resolve(
          "FOO=worktree\nCOMPOSE_PROJECT_NAME=myproj-feature\nWEB_PORT=8123\n",
        ) as never;
      });

      const provider = new CustomShellProvider(
        "/worktree",
        "feature",
        "bin/start.sh",
      );
      const env = await provider.start();

      expect(vi.mocked(execa)).toHaveBeenCalledWith(
        "bash",
        ["/worktree/bin/start.sh"],
        expect.objectContaining({
          cwd: "/worktree",
          env: expect.objectContaining({
            FOO: "shell",
            GROVE_ENV_FILE: "/worktree/.env.worktree",
            COMPOSE_PROJECT_NAME: "myproj-feature",
          }),
          stdio: "inherit",
        }),
      );
      expect(env.web?.port).toBe(8123);
    } finally {
      if (originalFoo === undefined) delete process.env.FOO;
      else process.env.FOO = originalFoo;
    }
  });
});
