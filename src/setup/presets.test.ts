import { describe, test, expect } from "vitest";
import { presets, recommendPreset } from "./presets.js";
import type { ProjectDetection } from "./detect.js";

function makeDetection(
  overrides: Partial<ProjectDetection> = {},
): ProjectDetection {
  return {
    projectName: "my-project",
    hasDockerCompose: false,
    composeServices: [],
    sharedServices: [],
    appServices: [],
    hasPackageJson: false,
    framework: null,
    ...overrides,
  };
}

describe("recommendPreset", () => {
  test("recommends docker when hasDockerCompose is true", () => {
    expect(recommendPreset(makeDetection({ hasDockerCompose: true }))).toBe(
      "docker",
    );
  });

  test("recommends vite when framework is vite and no docker", () => {
    expect(recommendPreset(makeDetection({ framework: "vite" }))).toBe("vite");
  });

  test("recommends node when hasPackageJson and no docker or vite", () => {
    expect(recommendPreset(makeDetection({ hasPackageJson: true }))).toBe(
      "node",
    );
  });

  test("recommends node as fallback when nothing is detected", () => {
    expect(recommendPreset(makeDetection())).toBe("node");
  });

  test("docker takes priority over vite framework", () => {
    expect(
      recommendPreset(
        makeDetection({ hasDockerCompose: true, framework: "vite" }),
      ),
    ).toBe("docker");
  });

  test("docker takes priority over packageJson", () => {
    expect(
      recommendPreset(
        makeDetection({ hasDockerCompose: true, hasPackageJson: true }),
      ),
    ).toBe("docker");
  });

  test("node wins over null framework when packageJson present", () => {
    expect(
      recommendPreset(makeDetection({ hasPackageJson: true, framework: null })),
    ).toBe("node");
  });
});

describe("presets.docker.generate", () => {
  test("creates docker-compose provider for each detected app service", () => {
    const detection = makeDetection({ appServices: ["web", "api"] });
    const config = presets.docker.generate(detection);
    expect(config.providers.web).toEqual({
      type: "docker-compose",
      service: "web",
    });
    expect(config.providers.api).toEqual({
      type: "docker-compose",
      service: "api",
    });
  });

  test("falls back to web provider when no app services detected", () => {
    const config = presets.docker.generate(makeDetection());
    expect(Object.keys(config.providers)).toEqual(["web"]);
    expect(config.providers.web).toEqual({
      type: "docker-compose",
      service: "web",
    });
  });

  test("includes shared services in shared config", () => {
    const config = presets.docker.generate(
      makeDetection({ sharedServices: ["postgres", "redis"] }),
    );
    expect(config.shared).toEqual({ postgres: true, redis: true });
  });

  test("omits shared key when no shared services found", () => {
    const config = presets.docker.generate(makeDetection());
    expect(config.shared).toBeUndefined();
  });

  test("uses detection projectName", () => {
    const config = presets.docker.generate(
      makeDetection({ projectName: "cool-project" }),
    );
    expect(config.project).toBe("cool-project");
  });

  test("is enabled", () => {
    expect(presets.docker.generate(makeDetection()).enabled).toBe(true);
  });

  test("includes naming templates", () => {
    const { naming } = presets.docker.generate(makeDetection());
    expect(naming?.composeProject).toBe("grove-${branch_safe}");
    expect(naming?.dbSchema).toBe("${project}_${branch_safe}");
    expect(naming?.ports).toMatchObject({
      WEB_PORT: "auto",
      API_PORT: "auto",
      DB_PORT: "auto",
    });
    expect(naming?.dbPort).toBe("auto");
    expect(naming?.webPort).toBe("auto");
    expect(naming?.apiPort).toBe("auto");
  });

  test("includes worktrees prefix", () => {
    expect(presets.docker.generate(makeDetection()).worktrees?.prefix).toBe(
      "grove",
    );
  });
});

describe("presets.vite.generate", () => {
  test("creates node-scripts provider with dev command", () => {
    const config = presets.vite.generate(makeDetection());
    expect(config.providers.web).toEqual({
      type: "node-scripts",
      command: "dev",
    });
  });

  test("only creates a web provider", () => {
    const config = presets.vite.generate(makeDetection());
    expect(Object.keys(config.providers)).toEqual(["web"]);
  });

  test("uses detection projectName", () => {
    const config = presets.vite.generate(
      makeDetection({ projectName: "vite-app" }),
    );
    expect(config.project).toBe("vite-app");
  });

  test("is enabled", () => {
    expect(presets.vite.generate(makeDetection()).enabled).toBe(true);
  });

  test("sets webPort to auto", () => {
    expect(presets.vite.generate(makeDetection()).naming?.webPort).toBe("auto");
  });

  test("includes worktrees prefix", () => {
    expect(presets.vite.generate(makeDetection()).worktrees?.prefix).toBe(
      "grove",
    );
  });
});

describe("presets.node.generate", () => {
  test("creates node-scripts provider with dev command", () => {
    const config = presets.node.generate(makeDetection());
    expect(config.providers.web).toEqual({
      type: "node-scripts",
      command: "dev",
    });
  });

  test("only creates a web provider", () => {
    const config = presets.node.generate(makeDetection());
    expect(Object.keys(config.providers)).toEqual(["web"]);
  });

  test("uses detection projectName", () => {
    const config = presets.node.generate(
      makeDetection({ projectName: "my-node-app" }),
    );
    expect(config.project).toBe("my-node-app");
  });

  test("is enabled", () => {
    expect(presets.node.generate(makeDetection()).enabled).toBe(true);
  });

  test("sets webPort to auto", () => {
    expect(presets.node.generate(makeDetection()).naming?.webPort).toBe("auto");
  });

  test("includes worktrees prefix", () => {
    expect(presets.node.generate(makeDetection()).worktrees?.prefix).toBe(
      "grove",
    );
  });
});

describe("preset metadata", () => {
  test("docker preset has a description", () => {
    expect(presets.docker.description).toBeTruthy();
  });

  test("vite preset has a description", () => {
    expect(presets.vite.description).toBeTruthy();
  });

  test("node preset has a description", () => {
    expect(presets.node.description).toBeTruthy();
  });

  test("preset names match their keys", () => {
    expect(presets.docker.name).toBe("docker");
    expect(presets.vite.name).toBe("vite");
    expect(presets.node.name).toBe("node");
  });
});
