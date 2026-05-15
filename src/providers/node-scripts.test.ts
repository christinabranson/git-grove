import { vi, describe, test, expect, beforeEach } from "vitest";

vi.mock("execa", () => ({ execa: vi.fn() }));
vi.mock("fs", () => ({ existsSync: vi.fn() }));
vi.mock("fs/promises", () => ({ readFile: vi.fn() }));

import { execa } from "execa";
import { existsSync } from "fs";
import { readFile } from "fs/promises";
import type { MockedFunction } from "vitest";
import { NodeScriptsProvider } from "./node-scripts.js";

const mockedExeca = execa as MockedFunction<typeof execa>;
const mockedExistsSync = existsSync as MockedFunction<typeof existsSync>;
const mockedReadFile = readFile as MockedFunction<typeof readFile>;

function makePkg(scripts: Record<string, string> = { dev: "vite" }): string {
  return JSON.stringify({ scripts });
}

function mockExecaProcess(stdout = "") {
  const p = Promise.resolve({ stdout }) as ReturnType<typeof execa> & {
    unref: () => void;
  };
  (p as unknown as { unref: () => void }).unref = vi.fn();
  return p;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedExistsSync.mockReturnValue(true);
  mockedReadFile.mockResolvedValue(makePkg() as never);
  mockedExeca.mockImplementation(() => mockExecaProcess());
});

describe("NodeScriptsProvider.start()", () => {
  test("throws when neither dev nor start script exists in package.json", async () => {
    mockedReadFile.mockResolvedValue(makePkg({}) as never);
    const provider = new NodeScriptsProvider("/worktree", "feature", "dev");
    await expect(provider.start()).rejects.toThrow(
      "No 'dev' or 'start' script",
    );
  });

  test("returns environment with vite default port (5173)", async () => {
    mockedReadFile.mockResolvedValue(makePkg({ dev: "vite" }) as never);
    const provider = new NodeScriptsProvider("/worktree", "feature", "dev");
    const env = await provider.start();
    expect(env.web?.url).toBe("http://localhost:5173");
    expect(env.metadata.provider).toBe("node-scripts");
  });

  test("returns environment with next default port (3000)", async () => {
    mockedReadFile.mockResolvedValue(makePkg({ dev: "next dev" }) as never);
    const provider = new NodeScriptsProvider(
      "/worktree",
      "feature",
      "dev",
      "next",
    );
    const env = await provider.start();
    expect(env.web?.url).toBe("http://localhost:3000");
  });

  test("uses explicit --port flag over framework default", async () => {
    mockedReadFile.mockResolvedValue(
      makePkg({ dev: "vite --port 4000" }) as never,
    );
    const provider = new NodeScriptsProvider("/worktree", "feature", "dev");
    const env = await provider.start();
    expect(env.web?.port).toBe(4000);
  });

  test("uses framework hint to resolve port without script scanning", async () => {
    mockedReadFile.mockResolvedValue(
      makePkg({ dev: "some-custom-command" }) as never,
    );
    const provider = new NodeScriptsProvider(
      "/worktree",
      "feature",
      "dev",
      "vite",
    );
    const env = await provider.start();
    expect(env.web?.port).toBe(5173);
  });

  test("returns no web url when port cannot be determined", async () => {
    mockedReadFile.mockResolvedValue(
      makePkg({ dev: "ts-node server.ts" }) as never,
    );
    const provider = new NodeScriptsProvider("/worktree", "feature", "dev");
    const env = await provider.start();
    expect(env.web).toBeUndefined();
  });

  test("falls back to start script when dev is absent", async () => {
    mockedReadFile.mockResolvedValue(makePkg({ start: "vite" }) as never);
    const provider = new NodeScriptsProvider("/worktree", "feature", "dev");
    const env = await provider.start();
    expect(env.web?.port).toBe(5173);
  });
});

describe("NodeScriptsProvider.stop()", () => {
  test("attempts to kill the process on the inferred port", async () => {
    mockedReadFile.mockResolvedValue(makePkg({ dev: "vite" }) as never);
    const provider = new NodeScriptsProvider("/worktree", "feature", "dev");
    await provider.stop();
    expect(mockedExeca).toHaveBeenCalledWith(
      "bash",
      expect.arrayContaining(["-c"]),
    );
  });

  test("does not throw when kill fails (process already gone)", async () => {
    mockedReadFile.mockResolvedValue(makePkg({ dev: "vite" }) as never);
    mockedExeca.mockRejectedValue(new Error("no process"));
    const provider = new NodeScriptsProvider("/worktree", "feature", "dev");
    await expect(provider.stop()).resolves.toBeUndefined();
  });

  test("does nothing when port cannot be determined", async () => {
    mockedReadFile.mockResolvedValue(
      makePkg({ dev: "ts-node server.ts" }) as never,
    );
    const provider = new NodeScriptsProvider("/worktree", "feature", "dev");
    await provider.stop();
    expect(mockedExeca).not.toHaveBeenCalled();
  });
});

describe("NodeScriptsProvider.status()", () => {
  test("returns inferred source when process is running on port", async () => {
    mockedReadFile.mockResolvedValue(makePkg({ dev: "vite" }) as never);
    mockedExeca.mockResolvedValue({ stdout: "12345" } as ReturnType<
      typeof execa
    >);
    const provider = new NodeScriptsProvider("/worktree", "feature", "dev");
    const env = await provider.status();
    expect(env.metadata.source).toBe("inferred");
  });

  test("returns fallback source when no process is running", async () => {
    mockedReadFile.mockResolvedValue(makePkg({ dev: "vite" }) as never);
    mockedExeca.mockResolvedValue({ stdout: "" } as ReturnType<typeof execa>);
    const provider = new NodeScriptsProvider("/worktree", "feature", "dev");
    const env = await provider.status();
    expect(env.metadata.source).toBe("fallback");
  });

  test("returns fallback source when lsof check fails", async () => {
    mockedReadFile.mockResolvedValue(makePkg({ dev: "vite" }) as never);
    mockedExeca.mockRejectedValue(new Error("lsof not found"));
    const provider = new NodeScriptsProvider("/worktree", "feature", "dev");
    const env = await provider.status();
    expect(env.metadata.source).toBe("fallback");
  });

  test("returns no web url when package.json is absent", async () => {
    mockedExistsSync.mockReturnValue(false);
    const provider = new NodeScriptsProvider("/worktree", "feature", "dev");
    const env = await provider.status();
    expect(env.web).toBeUndefined();
  });
});
