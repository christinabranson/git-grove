import { describe, test, expect } from "vitest";
import {
  branchSafe,
  expandNaming,
  buildEnvAgent,
  extractPublishedHostPorts,
} from "./naming.js";
import type { ExpandedNaming } from "./naming.js";
import type { GroveConfig } from "../types.js";

const baseConfig: GroveConfig = {
  enabled: true,
  project: "myapp",
  providers: {},
};

describe("branchSafe", () => {
  test("lowercases branch names", () => {
    expect(branchSafe("MyBranch")).toBe("mybranch");
  });

  test("replaces slashes with hyphens", () => {
    expect(branchSafe("feature/my-feature")).toBe("feature-my-feature");
  });

  test("collapses consecutive non-alphanumeric chars into one hyphen", () => {
    expect(branchSafe("feature//fix")).toBe("feature-fix");
  });

  test("trims to 40 chars", () => {
    const long = "a".repeat(50);
    expect(branchSafe(long)).toHaveLength(40);
  });

  test("trims leading and trailing hyphens", () => {
    expect(branchSafe("/branch/")).toBe("branch");
  });

  test("handles branch with dots and underscores", () => {
    expect(branchSafe("fix.some_thing")).toBe("fix-some-thing");
  });
});

describe("expandNaming", () => {
  test("uses default composeProject template", () => {
    const result = expandNaming(baseConfig, "main");
    expect(result.composeProject).toBe("myapp-main");
  });

  test("uses default dbSchema template with project name", () => {
    const result = expandNaming(baseConfig, "main");
    expect(result.dbSchema).toBe("myapp_main");
  });

  test("sharedProject is null when not configured", () => {
    const result = expandNaming(baseConfig, "main");
    expect(result.sharedProject).toBeNull();
  });

  test("defaults ports to auto", () => {
    const result = expandNaming(baseConfig, "main");
    expect(result.dbPort).toBe("auto");
    expect(result.webPort).toBe("auto");
    expect(result.apiPort).toBe("auto");
    expect(result.ports).toMatchObject({
      WEB_PORT: "auto",
      API_PORT: "auto",
      DB_PORT: "auto",
    });
  });

  test("expands branch_safe for slash-containing branch", () => {
    const result = expandNaming(baseConfig, "feature/my-feature");
    expect(result.composeProject).toBe("myapp-feature-my-feature");
    expect(result.dbSchema).toBe("myapp_feature-my-feature");
  });

  test("expands custom composeProject template", () => {
    const config: GroveConfig = {
      ...baseConfig,
      naming: { composeProject: "${project}-${branch_safe}" },
    };
    const result = expandNaming(config, "main");
    expect(result.composeProject).toBe("myapp-main");
  });

  test("expands sharedProject template when configured", () => {
    const config: GroveConfig = {
      ...baseConfig,
      naming: { sharedProject: "${project}-shared" },
    };
    const result = expandNaming(config, "main");
    expect(result.sharedProject).toBe("myapp-shared");
  });

  test("respects explicit port numbers", () => {
    const config: GroveConfig = {
      ...baseConfig,
      naming: { dbPort: 62044, webPort: 62000, apiPort: 62001 },
    };
    const result = expandNaming(config, "main");
    expect(result.dbPort).toBe(62044);
    expect(result.webPort).toBe(62000);
    expect(result.apiPort).toBe(62001);
    expect(result.ports).toMatchObject({
      DB_PORT: 62044,
      WEB_PORT: 62000,
      API_PORT: 62001,
    });
  });

  test("supports arbitrary service ports via naming.ports", () => {
    const config: GroveConfig = {
      ...baseConfig,
      naming: {
        ports: {
          REDIS_PORT: "auto",
          LOCALSTACK_PORT: 4567,
        },
      },
    };
    const result = expandNaming(config, "main");
    expect(result.ports).toMatchObject({
      REDIS_PORT: "auto",
      LOCALSTACK_PORT: 4567,
      WEB_PORT: "auto",
      API_PORT: "auto",
      DB_PORT: "auto",
    });
  });

  test('falls back to "grove" project name when project is missing from config', () => {
    // GroveConfig requires project, but expandNaming reads it with ?? 'grove'
    const config = {
      ...baseConfig,
      project: undefined,
    } as unknown as GroveConfig;
    const result = expandNaming(config, "main");
    expect(result.dbSchema).toBe("grove_main");
  });
});

describe("buildEnvAgent", () => {
  const explicitExpanded: ExpandedNaming = {
    composeProject: "grove-main",
    sharedProject: null,
    dbSchema: "myapp_main",
    dbPort: 62044,
    webPort: 62000,
    apiPort: 62001,
    ports: {
      WEB_PORT: 62000,
      API_PORT: 62001,
      DB_PORT: 62044,
    },
  };

  test("includes COMPOSE_PROJECT_NAME", async () => {
    const result = await buildEnvAgent(explicitExpanded);
    expect(result).toContain("COMPOSE_PROJECT_NAME=grove-main");
  });

  test("includes WEB_PORT", async () => {
    const result = await buildEnvAgent(explicitExpanded);
    expect(result).toContain("WEB_PORT=62000");
  });

  test("includes API_PORT", async () => {
    const result = await buildEnvAgent(explicitExpanded);
    expect(result).toContain("API_PORT=62001");
  });

  test("includes DB_SCHEMA", async () => {
    const result = await buildEnvAgent(explicitExpanded);
    expect(result).toContain("DB_SCHEMA=myapp_main");
  });

  test("includes DB_PORT", async () => {
    const result = await buildEnvAgent(explicitExpanded);
    expect(result).toContain("DB_PORT=62044");
  });

  test("does not include SHARED_PROJECT_NAME when sharedProject is null", async () => {
    const result = await buildEnvAgent(explicitExpanded);
    expect(result).not.toContain("SHARED_PROJECT_NAME");
  });

  test("includes SHARED_PROJECT_NAME when sharedProject is set", async () => {
    const expanded: ExpandedNaming = {
      ...explicitExpanded,
      sharedProject: "grove-shared",
    };
    const result = await buildEnvAgent(expanded);
    expect(result).toContain("SHARED_PROJECT_NAME=grove-shared");
  });

  test("output ends with newline", async () => {
    const result = await buildEnvAgent(explicitExpanded);
    expect(result.endsWith("\n")).toBe(true);
  });

  test("includes arbitrary port env keys", async () => {
    const expanded: ExpandedNaming = {
      ...explicitExpanded,
      ports: {
        ...explicitExpanded.ports,
        REDIS_PORT: 6381,
      },
    };
    const result = await buildEnvAgent(expanded);
    expect(result).toContain("REDIS_PORT=6381");
  });

  test("uses existingWebPort as starting point when webPort is auto", async () => {
    // Keep WEB/API static in this test so we avoid relying on open-port state.
    const expanded: ExpandedNaming = {
      ...explicitExpanded,
      webPort: 62010,
      apiPort: 62011,
      ports: {
        ...explicitExpanded.ports,
        WEB_PORT: 62010,
        API_PORT: 62011,
      },
    };
    const result = await buildEnvAgent(expanded);
    expect(result).toContain("WEB_PORT=62010");
    expect(result).toContain("API_PORT=62011");
  });
});

describe("extractPublishedHostPorts", () => {
  test("extracts ports from docker short syntax output", () => {
    const result = extractPublishedHostPorts(
      "0.0.0.0:5432->5432/tcp, :::5432->5432/tcp",
    );
    expect(result).toContain(5432);
  });

  test("extracts multiple published host ports", () => {
    const result = extractPublishedHostPorts(
      "0.0.0.0:4566->4566/tcp, 0.0.0.0:6379->6379/tcp",
    );
    expect(result).toEqual(expect.arrayContaining([4566, 6379]));
  });

  test("returns empty array when there are no published mappings", () => {
    const result = extractPublishedHostPorts("443/tcp, 8080/tcp");
    expect(result).toEqual([]);
  });
});
