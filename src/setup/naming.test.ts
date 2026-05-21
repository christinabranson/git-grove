import { describe, test, expect } from "vitest";
import {
  branchSafe,
  expandNaming,
  buildEnvAgent,
  buildCanonicalEnvVars,
  extractPortsFromEnv,
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

  test("scalar naming.webPort/apiPort/dbPort take precedence over naming.ports map", () => {
    const config: GroveConfig = {
      ...baseConfig,
      naming: {
        webPort: 62000,
        apiPort: 62001,
        dbPort: 62002,
        ports: {
          WEB_PORT: 63000,
          API_PORT: 63001,
          DB_PORT: 63002,
        },
      },
    };
    const result = expandNaming(config, "main");
    expect(result.webPort).toBe(62000);
    expect(result.apiPort).toBe(62001);
    expect(result.dbPort).toBe(62002);
    expect(result.ports).toMatchObject({
      WEB_PORT: 62000,
      API_PORT: 62001,
      DB_PORT: 62002,
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

  test("preserves locked port values from existingPorts", async () => {
    const autoExpanded: ExpandedNaming = {
      ...explicitExpanded,
      webPort: "auto",
      apiPort: "auto",
      ports: { WEB_PORT: "auto", API_PORT: "auto", DB_PORT: 62044 },
    };
    const result = await buildCanonicalEnvVars(autoExpanded, {
      WEB_PORT: 62010,
      API_PORT: 62011,
    });
    expect(result["WEB_PORT"]).toBe("62010");
    expect(result["API_PORT"]).toBe("62011");
    expect(result["DB_PORT"]).toBe("62044"); // explicit config value
  });

  test("throws a clear error when two env keys configure the same port", async () => {
    const expanded: ExpandedNaming = {
      ...explicitExpanded,
      dbPort: 64001,
      webPort: 64001,
      apiPort: 64002,
      ports: {
        WEB_PORT: 64001,
        API_PORT: 64002,
        DB_PORT: 64001,
      },
    };

    await expect(buildCanonicalEnvVars(expanded)).rejects.toThrow(
      "WEB_PORT and DB_PORT",
    );
  });
});

describe("extractPortsFromEnv", () => {
  test("extracts _PORT keys with numeric values", () => {
    const result = extractPortsFromEnv({
      WEB_PORT: "3001",
      API_PORT: "3002",
      DB_PORT: "5432",
      COMPOSE_PROJECT_NAME: "myapp-main",
      DB_SCHEMA: "myapp_main",
    });
    expect(result).toEqual({ WEB_PORT: 3001, API_PORT: 3002, DB_PORT: 5432 });
  });

  test("ignores non-numeric _PORT values", () => {
    const result = extractPortsFromEnv({ WEB_PORT: "auto", API_PORT: "3002" });
    expect(result).toEqual({ API_PORT: 3002 });
  });

  test("ignores keys that don't end in _PORT", () => {
    const result = extractPortsFromEnv({
      COMPOSE_PROJECT_NAME: "app",
      WEB_PORT: "3001",
    });
    expect(result).toEqual({ WEB_PORT: 3001 });
  });

  test("returns empty object for empty env", () => {
    expect(extractPortsFromEnv({})).toEqual({});
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
