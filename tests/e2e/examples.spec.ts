import { describe, test, expect, afterEach, beforeAll } from "vitest";
import { existsSync } from "fs";
import path from "path";
import {
  CLI_BIN,
  createTempExampleRepo,
  readExpectedFile,
  readGeneratedFile,
  runGroveDoctor,
  runGroveSetup,
  type TempRepo,
} from "./helpers.js";

beforeAll(() => {
  if (!existsSync(CLI_BIN)) {
    throw new Error(
      `CLI binary not found at ${CLI_BIN}.\nRun \`npm run build\` before running e2e tests.`,
    );
  }
});

// ---------------------------------------------------------------------------
// node-basic
// ---------------------------------------------------------------------------

describe("node-basic example", () => {
  let repo: TempRepo | undefined;

  afterEach(async () => {
    await repo?.cleanup();
    repo = undefined;
  });

  test("grove setup exits 0 and creates .grove/config.json", async () => {
    repo = await createTempExampleRepo("node-basic");

    const setup = await runGroveSetup(repo.repoPath);
    expect(setup.exitCode).toBe(0);
    expect(existsSync(path.join(repo.repoPath, ".grove", "config.json"))).toBe(
      true,
    );
  });

  test("generated config has correct project and provider shape", async () => {
    repo = await createTempExampleRepo("node-basic");
    await runGroveSetup(repo.repoPath);

    const raw = await readGeneratedFile(repo.repoPath, ".grove/config.json");
    const config = JSON.parse(raw);

    expect(config.enabled).toBe(true);
    expect(config.project).toBe("node-basic");
    expect(config.providers.web.type).toBe("node-scripts");
    expect(config.providers.web.command).toBe("dev");
  });

  test("generated config matches expected snapshot", async () => {
    repo = await createTempExampleRepo("node-basic");
    await runGroveSetup(repo.repoPath);

    const generated = JSON.parse(
      await readGeneratedFile(repo.repoPath, ".grove/config.json"),
    );
    const expected = JSON.parse(
      await readExpectedFile("node-basic", "grove.config.json"),
    );

    expect(generated).toEqual(expected);
  });

  test("grove doctor passes after setup", async () => {
    repo = await createTempExampleRepo("node-basic");
    await runGroveSetup(repo.repoPath);

    const doctor = await runGroveDoctor(repo.repoPath);
    expect(doctor.exitCode).toBe(0);
    expect(doctor.stdout).toContain("Git repository detected");
    expect(doctor.stdout).toContain(".grove directory exists");
    expect(doctor.stdout).toContain("config.json exists");
  });

  test("grove doctor --json returns structured success output", async () => {
    repo = await createTempExampleRepo("node-basic");
    await runGroveSetup(repo.repoPath);

    const doctor = await runGroveDoctor(repo.repoPath, ["--json"]);
    expect(doctor.exitCode).toBe(0);

    const result = JSON.parse(doctor.stdout) as {
      ok: boolean;
      checks: { name: string; ok: boolean }[];
    };

    expect(result.ok).toBe(true);
    expect(Array.isArray(result.checks)).toBe(true);

    const byName = Object.fromEntries(result.checks.map((c) => [c.name, c.ok]));
    expect(byName["Git repository detected"]).toBe(true);
    expect(byName[".grove directory exists"]).toBe(true);
    expect(byName["config.json exists"]).toBe(true);
    expect(byName["Git worktree state is valid"]).toBe(true);
  });

  test("grove doctor fails when grove is not set up", async () => {
    repo = await createTempExampleRepo("node-basic");

    // No `grove setup` — doctor should detect missing config
    const doctor = await runGroveDoctor(repo.repoPath);
    expect(doctor.exitCode).toBe(1);
    expect(doctor.stdout).toContain("Git repository detected");
    expect(doctor.stdout).toContain("config.json exists");
  });

  test("grove setup --refresh-env generates .env.worktree", async () => {
    repo = await createTempExampleRepo("node-basic");
    await runGroveSetup(repo.repoPath, ["--refresh-env"]);

    expect(existsSync(path.join(repo.repoPath, ".env.worktree"))).toBe(true);
  });

  test(".env.worktree contains stable variables for node-basic on main", async () => {
    repo = await createTempExampleRepo("node-basic");
    await runGroveSetup(repo.repoPath, ["--refresh-env"]);

    const env = await readGeneratedFile(repo.repoPath, ".env.worktree");

    // Project name is deterministic: ${project}-${branch_safe}
    expect(env).toContain("COMPOSE_PROJECT_NAME=node-basic-main");

    // Port keys must be present; values are auto-allocated integers
    expect(env).toMatch(/^WEB_PORT=\d+$/m);
    expect(env).toMatch(/^API_PORT=\d+$/m);
    expect(env).toMatch(/^DB_PORT=\d+$/m);
  });

  test("grove doctor reports .env.worktree present after --refresh-env", async () => {
    repo = await createTempExampleRepo("node-basic");
    await runGroveSetup(repo.repoPath, ["--refresh-env"]);

    const doctor = await runGroveDoctor(repo.repoPath, ["--json"]);
    expect(doctor.exitCode).toBe(0);

    const result = JSON.parse(doctor.stdout) as {
      ok: boolean;
      checks: { name: string; ok: boolean }[];
    };
    const envCheck = result.checks.find(
      (c) => c.name === ".env.worktree exists",
    );
    expect(envCheck?.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// docker-basic
// ---------------------------------------------------------------------------

describe("docker-basic example", () => {
  let repo: TempRepo | undefined;

  afterEach(async () => {
    await repo?.cleanup();
    repo = undefined;
  });

  test("grove setup exits 0 and creates .grove/config.json", async () => {
    repo = await createTempExampleRepo("docker-basic");

    const setup = await runGroveSetup(repo.repoPath);
    expect(setup.exitCode).toBe(0);
    expect(existsSync(path.join(repo.repoPath, ".grove", "config.json"))).toBe(
      true,
    );
  });

  test("generated config selects docker preset with web service", async () => {
    repo = await createTempExampleRepo("docker-basic");
    await runGroveSetup(repo.repoPath);

    const raw = await readGeneratedFile(repo.repoPath, ".grove/config.json");
    const config = JSON.parse(raw);

    expect(config.enabled).toBe(true);
    expect(config.project).toBe("docker-basic");
    expect(config.providers.web.type).toBe("docker-compose");
    expect(config.providers.web.service).toBe("web");
    expect(config.naming).toBeDefined();
    expect(config.naming.composeProject).toBe("${project}-${branch_safe}");
  });

  test("generated config matches expected snapshot", async () => {
    repo = await createTempExampleRepo("docker-basic");
    await runGroveSetup(repo.repoPath);

    const generated = JSON.parse(
      await readGeneratedFile(repo.repoPath, ".grove/config.json"),
    );
    const expected = JSON.parse(
      await readExpectedFile("docker-basic", "grove.config.json"),
    );

    expect(generated).toEqual(expected);
  });

  test("grove doctor passes after setup", async () => {
    repo = await createTempExampleRepo("docker-basic");
    await runGroveSetup(repo.repoPath);

    const doctor = await runGroveDoctor(repo.repoPath);
    expect(doctor.exitCode).toBe(0);
    expect(doctor.stdout).toContain("Git repository detected");
    expect(doctor.stdout).toContain(".grove directory exists");
    expect(doctor.stdout).toContain("config.json exists");
  });

  test("grove doctor --json returns structured success output", async () => {
    repo = await createTempExampleRepo("docker-basic");
    await runGroveSetup(repo.repoPath);

    const doctor = await runGroveDoctor(repo.repoPath, ["--json"]);
    expect(doctor.exitCode).toBe(0);

    const result = JSON.parse(doctor.stdout) as {
      ok: boolean;
      checks: { name: string; ok: boolean }[];
    };

    expect(result.ok).toBe(true);
    const byName = Object.fromEntries(result.checks.map((c) => [c.name, c.ok]));
    expect(byName["Git repository detected"]).toBe(true);
    expect(byName[".grove directory exists"]).toBe(true);
    expect(byName["config.json exists"]).toBe(true);
  });

  test("grove setup --refresh-env generates .env.worktree", async () => {
    repo = await createTempExampleRepo("docker-basic");
    await runGroveSetup(repo.repoPath, ["--refresh-env"]);

    expect(existsSync(path.join(repo.repoPath, ".env.worktree"))).toBe(true);
  });

  test(".env.worktree contains stable variables for docker-basic on main", async () => {
    repo = await createTempExampleRepo("docker-basic");
    await runGroveSetup(repo.repoPath, ["--refresh-env"]);

    const env = await readGeneratedFile(repo.repoPath, ".env.worktree");

    // Project name and schema are deterministic: ${project}-${branch_safe}
    expect(env).toContain("COMPOSE_PROJECT_NAME=docker-basic-main");
    expect(env).toContain("DB_SCHEMA=docker-basic_main");

    // Port keys must be present; values are auto-allocated integers
    expect(env).toMatch(/^WEB_PORT=\d+$/m);
    expect(env).toMatch(/^API_PORT=\d+$/m);
    expect(env).toMatch(/^DB_PORT=\d+$/m);
  });

  test("grove doctor reports .env.worktree present after --refresh-env", async () => {
    repo = await createTempExampleRepo("docker-basic");
    await runGroveSetup(repo.repoPath, ["--refresh-env"]);

    const doctor = await runGroveDoctor(repo.repoPath, ["--json"]);
    expect(doctor.exitCode).toBe(0);

    const result = JSON.parse(doctor.stdout) as {
      ok: boolean;
      checks: { name: string; ok: boolean }[];
    };
    const envCheck = result.checks.find(
      (c) => c.name === ".env.worktree exists",
    );
    expect(envCheck?.ok).toBe(true);
  });
});
