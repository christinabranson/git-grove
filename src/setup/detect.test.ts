import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm, mkdir } from "fs/promises";
import { join } from "path";
import os from "os";
import { detectProject } from "./detect.js";

let tmpDir: string;
let projectDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(os.tmpdir(), "grove-detect-test-"));
  projectDir = join(tmpDir, "my-project");
  await mkdir(projectDir);
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

async function writeCompose(
  content: string,
  filename = "docker-compose.yml",
): Promise<void> {
  await writeFile(join(projectDir, filename), content, "utf-8");
}

async function writePackageJson(data: object): Promise<void> {
  await writeFile(
    join(projectDir, "package.json"),
    JSON.stringify(data),
    "utf-8",
  );
}

const basicCompose = `
services:
  web:
    image: nginx
    ports:
      - "3000:3000"
  api:
    image: node
    environment:
      - NODE_ENV=production
  postgres:
    image: postgres
  redis:
    image: redis
`.trim();

describe("detectProject — project name", () => {
  test("uses the directory basename as projectName", async () => {
    const result = await detectProject(projectDir);
    expect(result.projectName).toBe("my-project");
  });
});

describe("detectProject — docker compose detection", () => {
  test("hasDockerCompose is false when no compose file exists", async () => {
    const result = await detectProject(projectDir);
    expect(result.hasDockerCompose).toBe(false);
    expect(result.composeServices).toEqual([]);
  });

  test("detects docker-compose.yml", async () => {
    await writeCompose(basicCompose);
    const result = await detectProject(projectDir);
    expect(result.hasDockerCompose).toBe(true);
  });

  test("detects compose.yaml as alternative filename", async () => {
    await writeCompose(basicCompose, "compose.yaml");
    const result = await detectProject(projectDir);
    expect(result.hasDockerCompose).toBe(true);
  });

  test("detects docker-compose.yaml as alternative filename", async () => {
    await writeCompose(basicCompose, "docker-compose.yaml");
    const result = await detectProject(projectDir);
    expect(result.hasDockerCompose).toBe(true);
  });

  test("extracts service names at 2-space indent", async () => {
    await writeCompose(basicCompose);
    const result = await detectProject(projectDir);
    expect(result.composeServices).toContain("web");
    expect(result.composeServices).toContain("api");
    expect(result.composeServices).toContain("postgres");
    expect(result.composeServices).toContain("redis");
  });

  test("does not capture service properties as service names", async () => {
    const compose = `
services:
  web:
    image: nginx
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
`.trim();
    await writeCompose(compose);
    const result = await detectProject(projectDir);
    expect(result.composeServices).toEqual(["web"]);
    expect(result.composeServices).not.toContain("image");
    expect(result.composeServices).not.toContain("ports");
    expect(result.composeServices).not.toContain("environment");
  });

  test("does not capture services from volumes or networks sections", async () => {
    const compose = `
services:
  web:
    image: nginx
volumes:
  pgdata:
networks:
  appnet:
`.trim();
    await writeCompose(compose);
    const result = await detectProject(projectDir);
    expect(result.composeServices).toEqual(["web"]);
    expect(result.composeServices).not.toContain("pgdata");
    expect(result.composeServices).not.toContain("appnet");
  });
});

describe("detectProject — shared vs app service classification", () => {
  test("classifies postgres as a shared service", async () => {
    await writeCompose(basicCompose);
    const result = await detectProject(projectDir);
    expect(result.sharedServices).toContain("postgres");
    expect(result.appServices).not.toContain("postgres");
  });

  test("classifies redis as a shared service", async () => {
    await writeCompose(basicCompose);
    const result = await detectProject(projectDir);
    expect(result.sharedServices).toContain("redis");
  });

  test("classifies web and api as app services", async () => {
    await writeCompose(basicCompose);
    const result = await detectProject(projectDir);
    expect(result.appServices).toContain("web");
    expect(result.appServices).toContain("api");
    expect(result.sharedServices).not.toContain("web");
    expect(result.sharedServices).not.toContain("api");
  });

  test("recognizes various database service name patterns", async () => {
    const compose = `
services:
  db:
    image: postgres
  database:
    image: postgres
  mysql:
    image: mysql
  mongodb:
    image: mongo
  kafka:
    image: confluentinc/cp-kafka
  localstack:
    image: localstack/localstack
`.trim();
    await writeCompose(compose);
    const result = await detectProject(projectDir);
    expect(result.sharedServices).toContain("db");
    expect(result.sharedServices).toContain("database");
    expect(result.sharedServices).toContain("mysql");
    expect(result.sharedServices).toContain("mongodb");
    expect(result.sharedServices).toContain("kafka");
    expect(result.sharedServices).toContain("localstack");
  });

  test("handles compose with only shared services (no app services)", async () => {
    const compose = `
services:
  postgres:
    image: postgres
  redis:
    image: redis
`.trim();
    await writeCompose(compose);
    const result = await detectProject(projectDir);
    expect(result.appServices).toEqual([]);
    expect(result.sharedServices).toHaveLength(2);
  });
});

describe("detectProject — package.json detection", () => {
  test("hasPackageJson is false when no package.json exists", async () => {
    const result = await detectProject(projectDir);
    expect(result.hasPackageJson).toBe(false);
    expect(result.framework).toBeNull();
  });

  test("hasPackageJson is true when package.json exists", async () => {
    await writePackageJson({ name: "my-app" });
    const result = await detectProject(projectDir);
    expect(result.hasPackageJson).toBe(true);
  });

  test("detects vite framework", async () => {
    await writePackageJson({ devDependencies: { vite: "^5.0.0" } });
    const result = await detectProject(projectDir);
    expect(result.framework).toBe("vite");
  });

  test("detects next.js framework", async () => {
    await writePackageJson({ dependencies: { next: "^14.0.0" } });
    const result = await detectProject(projectDir);
    expect(result.framework).toBe("next");
  });

  test("detects nuxt framework", async () => {
    await writePackageJson({ dependencies: { nuxt: "^3.0.0" } });
    const result = await detectProject(projectDir);
    expect(result.framework).toBe("nuxt");
  });

  test("detects gatsby framework", async () => {
    await writePackageJson({ dependencies: { gatsby: "^5.0.0" } });
    const result = await detectProject(projectDir);
    expect(result.framework).toBe("gatsby");
  });

  test("detects remix framework via @remix-run/node", async () => {
    await writePackageJson({ dependencies: { "@remix-run/node": "^2.0.0" } });
    const result = await detectProject(projectDir);
    expect(result.framework).toBe("remix");
  });

  test("detects sveltekit framework", async () => {
    await writePackageJson({ devDependencies: { "@sveltejs/kit": "^2.0.0" } });
    const result = await detectProject(projectDir);
    expect(result.framework).toBe("sveltekit");
  });

  test("detects express as node framework", async () => {
    await writePackageJson({ dependencies: { express: "^4.0.0" } });
    const result = await detectProject(projectDir);
    expect(result.framework).toBe("node");
  });

  test("detects fastify as node framework", async () => {
    await writePackageJson({ dependencies: { fastify: "^4.0.0" } });
    const result = await detectProject(projectDir);
    expect(result.framework).toBe("node");
  });

  test("returns null framework for unknown packages", async () => {
    await writePackageJson({ dependencies: { lodash: "^4.0.0" } });
    const result = await detectProject(projectDir);
    expect(result.framework).toBeNull();
  });

  test("handles malformed package.json gracefully", async () => {
    await writeFile(join(projectDir, "package.json"), "not json", "utf-8");
    const result = await detectProject(projectDir);
    expect(result.hasPackageJson).toBe(true);
    expect(result.framework).toBeNull();
  });

  test("checks both dependencies and devDependencies", async () => {
    await writePackageJson({
      dependencies: { react: "^18.0.0" },
      devDependencies: { vite: "^5.0.0" },
    });
    const result = await detectProject(projectDir);
    expect(result.framework).toBe("vite");
  });
});
