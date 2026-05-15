import { vi, describe, test, expect, beforeEach } from "vitest";

vi.mock("../data/groveConfig.js");
vi.mock("../providers/shared.js");
vi.mock("../utils/hardcodedPortsCheck.js");

import { loadGroveConfig } from "../data/groveConfig.js";
import {
  resolveSharedStack,
  getSharedStackState,
  sharedUp,
  sharedDown,
} from "../providers/shared.js";
import { warnIfHardcodedComposePorts } from "../utils/hardcodedPortsCheck.js";
import { runSharedUp, runSharedDown, runSharedStatus } from "./shared.js";

function makeSharedInfo(overrides = {}) {
  return {
    projectName: "myapp-shared",
    composeFile: "compose.shared.yaml",
    composeFilePath: "/repo/compose.shared.yaml",
    exists: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadGroveConfig).mockResolvedValue(null);
  vi.mocked(warnIfHardcodedComposePorts).mockResolvedValue(undefined);
  vi.mocked(sharedUp).mockResolvedValue(undefined);
  vi.mocked(sharedDown).mockResolvedValue(undefined);
});

// --- runSharedUp ---

describe("runSharedUp", () => {
  test("throws when no shared stack is configured", async () => {
    vi.mocked(resolveSharedStack).mockReturnValue(null);
    await expect(runSharedUp("/repo")).rejects.toThrow(
      "No shared stack configured",
    );
  });

  test("throws when compose file does not exist", async () => {
    vi.mocked(resolveSharedStack).mockReturnValue(
      makeSharedInfo({
        exists: false,
        composeFilePath: "/repo/compose.shared.yaml",
      }) as never,
    );
    await expect(runSharedUp("/repo")).rejects.toThrow(
      "Shared compose file not found",
    );
  });

  test("skips starting when stack is already running", async () => {
    vi.mocked(resolveSharedStack).mockReturnValue(makeSharedInfo() as never);
    vi.mocked(getSharedStackState).mockResolvedValue("running");
    await runSharedUp("/repo");
    expect(vi.mocked(sharedUp)).not.toHaveBeenCalled();
  });

  test("starts the stack when it is not running", async () => {
    vi.mocked(resolveSharedStack).mockReturnValue(makeSharedInfo() as never);
    vi.mocked(getSharedStackState).mockResolvedValue("not started");
    await runSharedUp("/repo");
    expect(vi.mocked(sharedUp)).toHaveBeenCalled();
  });
});

// --- runSharedDown ---

describe("runSharedDown", () => {
  test("throws when no shared stack is configured", async () => {
    vi.mocked(resolveSharedStack).mockReturnValue(null);
    await expect(runSharedDown("/repo")).rejects.toThrow(
      "No shared stack configured",
    );
  });

  test("skips stopping when stack is already stopped", async () => {
    vi.mocked(resolveSharedStack).mockReturnValue(makeSharedInfo() as never);
    vi.mocked(getSharedStackState).mockResolvedValue("stopped");
    await runSharedDown("/repo");
    expect(vi.mocked(sharedDown)).not.toHaveBeenCalled();
  });

  test("skips stopping when stack is not started", async () => {
    vi.mocked(resolveSharedStack).mockReturnValue(makeSharedInfo() as never);
    vi.mocked(getSharedStackState).mockResolvedValue("not started");
    await runSharedDown("/repo");
    expect(vi.mocked(sharedDown)).not.toHaveBeenCalled();
  });

  test("stops the stack when it is running", async () => {
    vi.mocked(resolveSharedStack).mockReturnValue(makeSharedInfo() as never);
    vi.mocked(getSharedStackState).mockResolvedValue("running");
    await runSharedDown("/repo");
    expect(vi.mocked(sharedDown)).toHaveBeenCalled();
  });
});

// --- runSharedStatus ---

describe("runSharedStatus", () => {
  test("prints no config message when no shared stack is configured", async () => {
    vi.mocked(resolveSharedStack).mockReturnValue(null);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runSharedStatus("/repo");
    expect(logSpy.mock.calls.flat().join("\n")).toContain(
      "No shared stack configured",
    );
    logSpy.mockRestore();
  });

  test("prints running state when stack is running", async () => {
    vi.mocked(resolveSharedStack).mockReturnValue(makeSharedInfo() as never);
    vi.mocked(getSharedStackState).mockResolvedValue("running");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runSharedStatus("/repo");
    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("myapp-shared");
    expect(output).toContain("running");
    logSpy.mockRestore();
  });

  test("prints stopped state when stack is stopped", async () => {
    vi.mocked(resolveSharedStack).mockReturnValue(makeSharedInfo() as never);
    vi.mocked(getSharedStackState).mockResolvedValue("stopped");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runSharedStatus("/repo");
    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("stopped");
    logSpy.mockRestore();
  });
});
