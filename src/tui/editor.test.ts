import { vi, describe, test, expect, beforeEach, afterEach } from "vitest";
import type { MockedFunction } from "vitest";

vi.mock("execa", () => ({ execa: vi.fn() }));
vi.mock("fs", () => ({ existsSync: vi.fn() }));

import { execa } from "execa";
import { existsSync } from "fs";
import { editorDisplayName, resolveEditor, openInEditor } from "./editor.js";

const mockedExeca = execa as MockedFunction<typeof execa>;
const mockedExistsSync = existsSync as MockedFunction<typeof existsSync>;

beforeEach(() => {
  vi.clearAllMocks();
  mockedExistsSync.mockReturnValue(false);
  // Default: which finds nothing
  mockedExeca.mockRejectedValue(new Error("not found"));
  delete process.env.VISUAL;
  delete process.env.EDITOR;
});

afterEach(() => {
  delete process.env.VISUAL;
  delete process.env.EDITOR;
});

describe("editorDisplayName", () => {
  test('returns VS Code for "code"', () => {
    expect(editorDisplayName("code")).toBe("VS Code");
  });

  test('returns Cursor for "cursor"', () => {
    expect(editorDisplayName("cursor")).toBe("Cursor");
  });

  test('returns Windsurf for "windsurf"', () => {
    expect(editorDisplayName("windsurf")).toBe("Windsurf");
  });

  test('returns vim for "vim"', () => {
    expect(editorDisplayName("vim")).toBe("vim");
  });

  test('returns nano for "nano"', () => {
    expect(editorDisplayName("nano")).toBe("nano");
  });

  test("returns the bin name unchanged for unknown editors", () => {
    expect(editorDisplayName("emacs")).toBe("emacs");
    expect(editorDisplayName("helix")).toBe("helix");
  });
});

describe("resolveEditor", () => {
  test("returns null when no editor is found", async () => {
    const result = await resolveEditor();
    expect(result).toBeNull();
  });

  test("resolves editor found on PATH via which", async () => {
    mockedExeca.mockImplementation(async (_cmd: string, args: string[]) => {
      if (args[0] === "code")
        return { stdout: "/usr/local/bin/code" } as ReturnType<typeof execa>;
      throw new Error("not found");
    });

    const result = await resolveEditor();
    expect(result).toEqual({ bin: "code", path: "/usr/local/bin/code" });
  });

  test("resolves vim when it is first found on PATH", async () => {
    mockedExeca.mockImplementation(async (_cmd: string, args: string[]) => {
      if (args[0] === "vim")
        return { stdout: "/usr/bin/vim" } as ReturnType<typeof execa>;
      throw new Error("not found");
    });

    const result = await resolveEditor();
    expect(result?.bin).toBe("vim");
  });

  test("falls back to macOS bundle path when not on PATH", async () => {
    mockedExistsSync.mockImplementation((p) => {
      return typeof p === "string" && p.includes("Cursor.app");
    });

    const result = await resolveEditor();
    expect(result?.bin).toBe("cursor");
    expect(result?.path).toContain("Cursor.app");
  });

  test("prioritizes $VISUAL over other editors", async () => {
    process.env.VISUAL = "/usr/local/bin/my-editor";
    mockedExeca.mockResolvedValue({
      stdout: "/usr/local/bin/my-editor",
    } as ReturnType<typeof execa>);

    const result = await resolveEditor();
    expect(result?.bin).toBe("/usr/local/bin/my-editor");
    expect(result?.path).toBe("/usr/local/bin/my-editor");
  });

  test("uses $EDITOR when $VISUAL is not set", async () => {
    process.env.EDITOR = "nano";
    mockedExeca.mockImplementation(async (_cmd: string, args: string[]) => {
      if (args[0] === "nano")
        return { stdout: "/bin/nano" } as ReturnType<typeof execa>;
      throw new Error("not found");
    });

    const result = await resolveEditor();
    expect(result?.bin).toBe("nano");
  });

  test("uses grove config editor when provided, ignoring env vars", async () => {
    process.env.VISUAL = "vim";
    mockedExeca.mockImplementation(async (_cmd: string, args: string[]) => {
      if (args[0] === "cursor")
        return { stdout: "/usr/local/bin/cursor" } as ReturnType<typeof execa>;
      throw new Error("not found");
    });

    const result = await resolveEditor("cursor");
    expect(result?.bin).toBe("cursor");
  });

  test("returns null for grove config editor that cannot be found", async () => {
    const result = await resolveEditor("nonexistent-editor");
    expect(result).toBeNull();
  });
});

describe("openInEditor", () => {
  test("throws when no editor is found", async () => {
    await expect(openInEditor("/some/path")).rejects.toThrow("no editor found");
  });

  test("opens GUI editor with -n flag", async () => {
    mockedExeca.mockImplementation(async (_cmd: string, args: string[]) => {
      if (args[0] === "code")
        return { stdout: "/usr/local/bin/code" } as ReturnType<typeof execa>;
      return { stdout: "" } as ReturnType<typeof execa>;
    });

    const displayName = await openInEditor("/my/project");
    expect(displayName).toBe("VS Code");

    const calls = mockedExeca.mock.calls;
    const openCall = calls.find((c) => c[1]?.includes("-n"));
    expect(openCall).toBeTruthy();
    expect(openCall![1]).toContain("/my/project");
  });

  test("opens terminal editor without -n flag", async () => {
    mockedExeca.mockImplementation(async (_cmd: string, args: string[]) => {
      if (args[0] === "vim")
        return { stdout: "/usr/bin/vim" } as ReturnType<typeof execa>;
      return { stdout: "" } as ReturnType<typeof execa>;
    });

    const displayName = await openInEditor("/my/project");
    expect(displayName).toBe("vim");

    const calls = mockedExeca.mock.calls;
    const openCall = calls.at(-1);
    expect(openCall![1]).not.toContain("-n");
    expect(openCall![1]).toContain("/my/project");
  });

  test("returns display name of resolved editor", async () => {
    mockedExeca.mockImplementation(async (_cmd: string, args: string[]) => {
      if (args[0] === "cursor")
        return { stdout: "/usr/local/bin/cursor" } as ReturnType<typeof execa>;
      return { stdout: "" } as ReturnType<typeof execa>;
    });

    const displayName = await openInEditor("/my/project", "cursor");
    expect(displayName).toBe("Cursor");
  });
});
