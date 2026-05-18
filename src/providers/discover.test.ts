import { vi, describe, test, expect, beforeEach } from "vitest";

vi.mock("../data/groveConfig.js");
vi.mock("../setup/detect.js");

import { loadGroveConfig } from "../data/groveConfig.js";
import { detectProject } from "../setup/detect.js";
import { discoverProvider } from "./index.js";
import type { GroveConfig } from "../types.js";

const noDetection = {
  hasDockerCompose: false,
  hasPackageJson: false,
  appServices: [],
  sharedServices: [],
  framework: null,
  scripts: {},
};

function makeConfig(overrides: Partial<GroveConfig> = {}): GroveConfig {
  return {
    enabled: true,
    project: "myapp",
    providers: {},
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadGroveConfig).mockResolvedValue(null);
  vi.mocked(detectProject).mockResolvedValue(noDetection as never);
});

describe("discoverProvider — fallback", () => {
  test("returns a provider named fallback when nothing is detected", async () => {
    const provider = await discoverProvider("/worktree", "feature");
    expect(provider.name).toBe("fallback");
  });

  test("fallback start() returns metadata source=fallback", async () => {
    const provider = await discoverProvider("/worktree", "feature");
    const env = await provider.start();
    expect(env.metadata.source).toBe("fallback");
    expect(env.metadata.provider).toBe("fallback");
  });

  test("fallback stop() resolves without error", async () => {
    const provider = await discoverProvider("/worktree", "feature");
    await expect(provider.stop()).resolves.toBeUndefined();
  });
});

describe("discoverProvider — auto-detection (no config)", () => {
  test("returns docker-compose provider when docker compose is detected", async () => {
    vi.mocked(detectProject).mockResolvedValue({
      ...noDetection,
      hasDockerCompose: true,
      appServices: ["web"],
    } as never);
    const provider = await discoverProvider("/worktree", "feature");
    expect(provider.name).toBe("docker-compose");
  });

  test("returns node-scripts provider when package.json is detected", async () => {
    vi.mocked(detectProject).mockResolvedValue({
      ...noDetection,
      hasPackageJson: true,
    } as never);
    const provider = await discoverProvider("/worktree", "feature");
    expect(provider.name).toBe("node-scripts");
  });

  test("docker-compose takes precedence over package.json", async () => {
    vi.mocked(detectProject).mockResolvedValue({
      ...noDetection,
      hasDockerCompose: true,
      hasPackageJson: true,
    } as never);
    const provider = await discoverProvider("/worktree", "feature");
    expect(provider.name).toBe("docker-compose");
  });
});

describe("discoverProvider — explicit config", () => {
  test("returns docker-compose provider from config", async () => {
    vi.mocked(loadGroveConfig).mockResolvedValue(
      makeConfig({
        providers: { web: { type: "docker-compose", service: "web" } },
      }),
    );
    const provider = await discoverProvider("/worktree", "feature");
    expect(provider.name).toBe("docker-compose");
  });

  test("returns node-scripts provider from config", async () => {
    vi.mocked(loadGroveConfig).mockResolvedValue(
      makeConfig({
        providers: { web: { type: "node-scripts", command: "dev" } },
      }),
    );
    const provider = await discoverProvider("/worktree", "feature");
    expect(provider.name).toBe("node-scripts");
  });

  test("returns custom-shell provider from config", async () => {
    vi.mocked(loadGroveConfig).mockResolvedValue(
      makeConfig({
        providers: {
          web: { type: "custom-shell", script: "bin/start.sh" },
        },
      }),
    );
    const provider = await discoverProvider("/worktree", "feature");
    expect(provider.name).toBe("custom-shell");
  });

  test("throws when custom-shell config is missing script field", async () => {
    vi.mocked(loadGroveConfig).mockResolvedValue(
      makeConfig({
        providers: { web: { type: "custom-shell" } },
      }),
    );
    await expect(discoverProvider("/worktree", "feature")).rejects.toThrow(
      '"script" field',
    );
  });

  test("returns fallback when config has no providers", async () => {
    vi.mocked(loadGroveConfig).mockResolvedValue(makeConfig({ providers: {} }));
    const provider = await discoverProvider("/worktree", "feature");
    expect(provider.name).toBe("fallback");
  });

  test("config takes precedence over auto-detection", async () => {
    vi.mocked(detectProject).mockResolvedValue({
      ...noDetection,
      hasDockerCompose: true,
    } as never);
    vi.mocked(loadGroveConfig).mockResolvedValue(
      makeConfig({
        providers: { web: { type: "node-scripts", command: "dev" } },
      }),
    );
    const provider = await discoverProvider("/worktree", "feature");
    expect(provider.name).toBe("node-scripts");
  });
});
