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
    vi.mocked(existsSync).mockReturnValue(false);

    const provider = new CustomShellProvider(
      "/worktree",
      "feature",
      "./bin/start.sh",
    );
    await expect(provider.start()).rejects.toThrow("Missing .env.worktree");
  });

  test("runs file-path script via bash when script starts with ./", async () => {
    vi.mocked(existsSync).mockImplementation((p) => {
      const file = String(p);
      return (
        file.endsWith("bin/start.sh") ||
        file.endsWith(".env.worktree") ||
        file.endsWith(".env") ||
        file.endsWith(".env.example")
      );
    });
    vi.mocked(readFile).mockResolvedValue(
      "COMPOSE_PROJECT_NAME=myproj-feature\nWEB_PORT=8123\n" as never,
    );

    const provider = new CustomShellProvider(
      "/worktree",
      "feature",
      "./bin/start.sh",
    );
    await provider.start();

    expect(vi.mocked(execa)).toHaveBeenCalledWith(
      "bash",
      ["/worktree/bin/start.sh"],
      expect.objectContaining({ cwd: "/worktree", stdio: "inherit" }),
    );
  });

  test("runs inline shell command via shell:true when script has no path prefix", async () => {
    vi.mocked(existsSync).mockImplementation((p) => {
      const file = String(p);
      return (
        file.endsWith(".env.worktree") ||
        file.endsWith(".env") ||
        file.endsWith(".env.example")
      );
    });
    vi.mocked(readFile).mockResolvedValue(
      "COMPOSE_PROJECT_NAME=myproj-feature\nWEB_PORT=8123\n" as never,
    );

    const provider = new CustomShellProvider(
      "/worktree",
      "feature",
      "npm run dev:up:docker",
    );
    await provider.start();

    expect(vi.mocked(execa)).toHaveBeenCalledWith(
      "npm run dev:up:docker",
      expect.objectContaining({
        shell: true,
        cwd: "/worktree",
        stdio: "inherit",
      }),
    );
  });

  test("passes GROVE_ENV_FILE and merged env to script", async () => {
    vi.mocked(existsSync).mockImplementation((p) => {
      const file = String(p);
      return (
        file.endsWith("bin/start.sh") ||
        file.endsWith(".env.worktree") ||
        file.endsWith(".env")
      );
    });
    vi.mocked(readFile).mockImplementation((p) => {
      const file = String(p);
      if (file.endsWith(".env")) return Promise.resolve("FOO=user\n") as never;
      return Promise.resolve(
        "COMPOSE_PROJECT_NAME=myproj-feature\nWEB_PORT=8123\n",
      ) as never;
    });

    const provider = new CustomShellProvider(
      "/worktree",
      "feature",
      "./bin/start.sh",
    );
    const env = await provider.start();

    expect(vi.mocked(execa)).toHaveBeenCalledWith(
      "bash",
      ["/worktree/bin/start.sh"],
      expect.objectContaining({
        env: expect.objectContaining({
          GROVE_ENV_FILE: "/worktree/.env.worktree",
          COMPOSE_PROJECT_NAME: "myproj-feature",
        }),
      }),
    );
    expect(env.web?.port).toBe(8123);
  });
});
