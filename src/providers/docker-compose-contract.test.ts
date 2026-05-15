import { describe, expect, test } from "vitest";
import {
  analyzeResolvedPorts,
  buildAliasMap,
  discoverComposeContractFromText,
  extractInterpolationVars,
  formatDoctorEnvReport,
  preflightComposeEnv,
  resolveContractEnvVars,
  selectCanonicalEnvForOutput,
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

  test("does not implicitly passthrough discovered compose vars", () => {
    const contract = discoverComposeContractFromText(`
services:
  app:
    environment:
      NODE_ENV: \${NODE_ENV}
      POSTGIS_IMAGE: \${POSTGIS_IMAGE}
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
        NODE_ENV: "development",
        POSTGIS_IMAGE: "postgis/postgis:17-3.5",
      },
    );

    expect(result.values["NODE_ENV"]).toBeUndefined();
    expect(result.values["POSTGIS_IMAGE"]).toBeUndefined();
    expect(result.issues).toHaveLength(0);
  });

  test("copies passthrough vars only when explicitly configured", () => {
    const contract = discoverComposeContractFromText(`
services:
  app:
    environment:
      NODE_ENV: \${NODE_ENV}
      POSTGIS_IMAGE: \${POSTGIS_IMAGE}
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
        NODE_ENV: "development",
        POSTGIS_IMAGE: "postgis/postgis:17-3.5",
      },
      {
        passthrough: ["NODE_ENV", "POSTGIS_IMAGE"],
      },
    );

    expect(result.values["NODE_ENV"]).toBe("development");
    expect(result.values["POSTGIS_IMAGE"]).toBe("postgis/postgis:17-3.5");
    expect(result.issues).toHaveLength(0);
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

describe("selectCanonicalEnvForOutput", () => {
  test("drops DB_SCHEMA when compose/env contract do not require it", () => {
    const contract = discoverComposeContractFromText(`
services:
  app:
    ports:
      - "\${WEB_PORT}:3000"
`);

    const selected = selectCanonicalEnvForOutput(contract, {
      COMPOSE_PROJECT_NAME: "grove-foo",
      WEB_PORT: "8080",
      API_PORT: "8081",
      DB_PORT: "15432",
      DB_SCHEMA: "myapp_foo",
    });

    expect(selected["DB_SCHEMA"]).toBeUndefined();
    expect(selected["DB_PORT"]).toBe("15432");
  });

  test("keeps DB_SCHEMA when compose contract expects it", () => {
    const contract = discoverComposeContractFromText(`
services:
  app:
    environment:
      DB_SCHEMA: \${DB_SCHEMA}
`);

    const selected = selectCanonicalEnvForOutput(contract, {
      COMPOSE_PROJECT_NAME: "grove-foo",
      WEB_PORT: "8080",
      API_PORT: "8081",
      DB_PORT: "15432",
      DB_SCHEMA: "myapp_foo",
    });

    expect(selected["DB_SCHEMA"]).toBe("myapp_foo");
  });

  test("keeps DB_SCHEMA when env contract explicitly requires it", () => {
    const contract = discoverComposeContractFromText(`
services:
  app:
    ports:
      - "\${WEB_PORT}:3000"
`);

    const selected = selectCanonicalEnvForOutput(
      contract,
      {
        COMPOSE_PROJECT_NAME: "grove-foo",
        WEB_PORT: "8080",
        API_PORT: "8081",
        DB_PORT: "15432",
        DB_SCHEMA: "myapp_foo",
      },
      {
        required: ["DB_SCHEMA"],
      },
    );

    expect(selected["DB_SCHEMA"]).toBe("myapp_foo");
  });

  test("keeps canonical keys that do not have special output policies", () => {
    const contract = discoverComposeContractFromText(`
services:
  app:
    ports:
      - "\${WEB_PORT}:3000"
`);

    const selected = selectCanonicalEnvForOutput(contract, {
      COMPOSE_PROJECT_NAME: "grove-foo",
      WEB_PORT: "8080",
      API_PORT: "8081",
      DB_PORT: "15432",
      SHARED_PROJECT_NAME: "grove-shared",
    });

    expect(selected["SHARED_PROJECT_NAME"]).toBe("grove-shared");
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
