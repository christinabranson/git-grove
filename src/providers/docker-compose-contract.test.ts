import { describe, expect, test } from "vitest";
import {
  analyzeResolvedPorts,
  buildAliasMap,
  discoverComposeContractFromText,
  extractInterpolationVars,
  formatDoctorEnvReport,
  preflightComposeEnv,
  resolveContractEnvVars,
  renderEnvContent,
} from "./docker-compose-contract.js";

describe("extractInterpolationVars", () => {
  test("extracts nested fallback variables", () => {
    const vars = extractInterpolationVars("${APP_PORT:-${API_PORT:-3000}}");
    expect(vars).toEqual(expect.arrayContaining(["APP_PORT", "API_PORT"]));
  });
});

describe("discoverComposeContractFromText", () => {
  test("discovers APP/POSTGRES vars from compose fixture", () => {
    const compose = `
services:
  app:
    image: node:20
    ports:
      - "\${APP_PORT:-3000}:3000"
    environment:
      DATABASE_URL: postgres://postgres:dev@db:\${POSTGRES_PORT:-5432}/\${POSTGRES_DB:-app}
  db:
    image: postgres:16
    ports:
      - "\${POSTGRES_PORT:-5432}:5432"
    environment:
      POSTGRES_DB: \${POSTGRES_DB:-app}
`;

    const contract = discoverComposeContractFromText(compose);

    expect(contract.expectedVars).toEqual(
      expect.arrayContaining(["APP_PORT", "POSTGRES_PORT", "POSTGRES_DB"]),
    );

    expect(contract.portRefs.map((r) => r.variable)).toEqual(
      expect.arrayContaining(["APP_PORT", "POSTGRES_PORT"]),
    );

    expect(contract.dbNameRefs.map((r) => r.variable)).toEqual(
      expect.arrayContaining(["POSTGRES_DB"]),
    );
  });

  test("supports service indentation variants", () => {
    const compose = `
services:
    app:
      image: node:20
      ports:
        - "\${APP_PORT:-3000}:3000"
      environment:
        POSTGRES_DB: \${POSTGRES_DB:-app}
`;

    const contract = discoverComposeContractFromText(compose);

    expect(contract.expectedVars).toEqual(
      expect.arrayContaining(["APP_PORT", "POSTGRES_DB"]),
    );
    expect(contract.portRefs.map((r) => r.variable)).toEqual(
      expect.arrayContaining(["APP_PORT"]),
    );
    expect(contract.dbNameRefs.map((r) => r.variable)).toEqual(
      expect.arrayContaining(["POSTGRES_DB"]),
    );
  });

  test("discovers canonical grove vars from compose fixture", () => {
    const compose = `
services:
  web:
    image: app
    ports:
      - "\${WEB_PORT}:3000"
    environment:
      DB_SCHEMA: \${DB_SCHEMA}
  db:
    image: postgres
    ports:
      - "\${DB_PORT}:5432"
`;

    const contract = discoverComposeContractFromText(compose);

    expect(contract.expectedVars).toEqual(
      expect.arrayContaining(["WEB_PORT", "DB_PORT", "DB_SCHEMA"]),
    );
  });
});

describe("buildAliasMap", () => {
  test("maps discovered port aliases to canonical values", () => {
    const contract = discoverComposeContractFromText(`
services:
  app:
    ports:
      - "\${APP_PORT:-3000}:3000"
  db:
    ports:
      - "\${POSTGRES_PORT:-5432}:5432"
    environment:
      POSTGRES_DB: \${POSTGRES_DB:-app}
`);

    const canonical = {
      COMPOSE_PROJECT_NAME: "grove-branch",
      WEB_PORT: "8088",
      API_PORT: "8089",
      DB_PORT: "15432",
      DB_SCHEMA: "myapp_branch",
    };

    const aliases = buildAliasMap(contract, canonical);

    expect(aliases["APP_PORT"]).toBe("8088");
    expect(aliases["POSTGRES_PORT"]).toBe("15432");
    expect(aliases["POSTGRES_DB"]).toBeUndefined();
  });

  test("does not map unknown port aliases to WEB_PORT", () => {
    const contract = discoverComposeContractFromText(`
services:
  cache:
    ports:
      - "\${CACHE_PORT:-6379}:6379"
`);

    const canonical = {
      COMPOSE_PROJECT_NAME: "grove-branch",
      WEB_PORT: "8088",
      API_PORT: "8089",
      DB_PORT: "15432",
      DB_SCHEMA: "myapp_branch",
    };

    const aliases = buildAliasMap(contract, canonical);

    expect(aliases["CACHE_PORT"]).toBeUndefined();
  });
});

describe("resolveContractEnvVars", () => {
  test("supports derived and passthrough vars from explicit env contract", () => {
    const contract = discoverComposeContractFromText(`
services:
  app:
    environment:
      DATABASE_URL: \${DATABASE_URL}
      FEATURE_FLAG: \${FEATURE_FLAG}
`);

    const result = resolveContractEnvVars(
      contract,
      {
        COMPOSE_PROJECT_NAME: "grove-branch",
        WEB_PORT: "8088",
        API_PORT: "8089",
        DB_PORT: "15432",
        DB_SCHEMA: "myapp_branch",
      },
      {
        POSTGRES_USER: "postgres",
        POSTGRES_PASSWORD: "dev",
        POSTGRES_DB: "app",
        FEATURE_FLAG: "on",
      },
      {
        derived: {
          DATABASE_URL:
            "postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@cooh-db:5432/${POSTGRES_DB}?schema=${DB_SCHEMA}",
        },
        passthrough: ["FEATURE_FLAG"],
      },
    );

    expect(result.values["DATABASE_URL"]).toContain("schema=myapp_branch");
    expect(result.values["FEATURE_FLAG"]).toBe("on");
    expect(result.issues).toHaveLength(0);
  });

  test("in strict mode unresolved expected vars are errors", () => {
    const contract = discoverComposeContractFromText(`
services:
  app:
    environment:
      DATABASE_URL: \${DATABASE_URL}
`);

    const result = resolveContractEnvVars(
      contract,
      {
        COMPOSE_PROJECT_NAME: "grove-branch",
        WEB_PORT: "8088",
        API_PORT: "8089",
        DB_PORT: "15432",
        DB_SCHEMA: "myapp_branch",
      },
      {},
      {
        strict: true,
      },
    );

    expect(result.issues.some((issue) => issue.severity === "error")).toBe(
      true,
    );
    expect(result.values["DATABASE_URL"]).toBeUndefined();
  });

  test("does not implicitly passthrough expected vars when envContract is explicit", () => {
    const contract = discoverComposeContractFromText(`
services:
  app:
    environment:
      FEATURE_FLAG: \${FEATURE_FLAG}
`);

    const result = resolveContractEnvVars(
      contract,
      {
        COMPOSE_PROJECT_NAME: "grove-branch",
        WEB_PORT: "8088",
        API_PORT: "8089",
        DB_PORT: "15432",
        DB_SCHEMA: "myapp_branch",
      },
      {
        FEATURE_FLAG: "on",
      },
      {
        passthrough: [],
      },
    );

    expect(result.values["FEATURE_FLAG"]).toBeUndefined();
  });
});

describe("renderEnvContent", () => {
  test("keeps canonical keys and appends aliases deterministically", () => {
    const content = renderEnvContent(
      {
        COMPOSE_PROJECT_NAME: "grove-foo",
        WEB_PORT: "8080",
        API_PORT: "8081",
        DB_PORT: "15432",
        DB_SCHEMA: "myapp_foo",
      },
      {
        APP_PORT: "8080",
        POSTGRES_DB: "myapp_foo",
        POSTGRES_PORT: "15432",
      },
    );

    const lines = content.trim().split("\n");
    expect(lines[0]).toBe("COMPOSE_PROJECT_NAME=grove-foo");
    expect(lines).toContain("APP_PORT=8080");
    expect(lines).toContain("POSTGRES_PORT=15432");
    expect(lines).toContain("POSTGRES_DB=myapp_foo");
  });
});

describe("analyzeResolvedPorts", () => {
  test("flags collisions and default fallback mismatches", () => {
    const issues = analyzeResolvedPorts(
      [
        { service: "app", hostPort: 3000, targetPort: 3000 },
        { service: "db", hostPort: 15432, targetPort: 5432 },
      ],
      {
        WEB_PORT: "8088",
        API_PORT: "8089",
        DB_PORT: "15432",
      },
      new Set([15432]),
    );

    expect(issues.some((i) => i.message.includes("collision"))).toBe(true);
    expect(
      issues.some((i) => i.message.includes("default-looking host port 3000")),
    ).toBe(true);
  });
});

describe("preflightComposeEnv", () => {
  test("requires expectedVars in strict mode", async () => {
    const result = await preflightComposeEnv(
      process.cwd(),
      {
        expectedVars: ["FEATURE_FLAG"],
        portRefs: [],
        dbNameRefs: [],
        projectNameVars: [],
        warnings: [],
      },
      {},
      { strict: true },
    );

    expect(
      result.issues.some((issue) =>
        issue.message.includes(
          "Missing required compose variable: FEATURE_FLAG",
        ),
      ),
    ).toBe(true);
  });

  test("treats empty-string env values as present", async () => {
    const result = await preflightComposeEnv(
      process.cwd(),
      {
        expectedVars: ["FEATURE_FLAG"],
        portRefs: [],
        dbNameRefs: [],
        projectNameVars: [],
        warnings: [],
      },
      { FEATURE_FLAG: "" },
    );

    expect(
      result.issues.some((issue) =>
        issue.message.includes(
          "Missing required compose variable: FEATURE_FLAG",
        ),
      ),
    ).toBe(false);
  });
});

describe("formatDoctorEnvReport", () => {
  test("does not list empty-string expected vars as missing", () => {
    const report = formatDoctorEnvReport(
      {
        expectedVars: ["FEATURE_FLAG"],
        portRefs: [],
        dbNameRefs: [],
        projectNameVars: [],
        warnings: [],
      },
      { FEATURE_FLAG: "" },
      {
        ok: true,
        issues: [],
        resolvedPublishedPorts: [],
      },
    );

    expect(report).toContain("Missing vars:\n  (none)");
  });
});
