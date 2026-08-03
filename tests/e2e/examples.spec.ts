import { describe, test, expect, afterEach, beforeAll } from "vitest";
import { existsSync } from "fs";
import path from "path";
import {
  CLI_BIN,
  createTempExampleRepo,
  readExpectedFile,
  readGeneratedFile,
  readGroveConfigJson,
  runGroveConfig,
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

  test("grove setup exits 0 and config is readable via grove config get", async () => {
    repo = await createTempExampleRepo("node-basic");

    const setup = await runGroveSetup(repo);
    expect(setup.exitCode).toBe(0);

    const project = await runGroveConfig(repo, ["get", "project"]);
    expect(project.exitCode).toBe(0);
    expect(project.stdout).toBe("node-basic");
  });

  test("generated config has correct project and provider shape", async () => {
    repo = await createTempExampleRepo("node-basic");
    await runGroveSetup(repo);

    const enabled = await runGroveConfig(repo, ["get", "enabled"]);
    expect(enabled.stdout).toBe("true");

    const project = await runGroveConfig(repo, ["get", "project"]);
    expect(project.stdout).toBe("node-basic");

    const type = await runGroveConfig(repo, ["get", "providers.web.type"]);
    expect(type.stdout).toBe("node-scripts");

    const command = await runGroveConfig(repo, [
      "get",
      "providers.web.command",
    ]);
    expect(command.stdout).toBe("dev");
  });

  test("generated config matches expected snapshot", async () => {
    repo = await createTempExampleRepo("node-basic");
    await runGroveSetup(repo);

    const generated = await readGroveConfigJson(repo);
    const expected = JSON.parse(
      await readExpectedFile("node-basic", "grove.config.json"),
    );

    expect(generated).toEqual(expected);
  });

  test("grove setup is idempotent — second run without --reset warns and exits 0", async () => {
    repo = await createTempExampleRepo("node-basic");
    await runGroveSetup(repo);

    const second = await runGroveSetup(repo);
    expect(second.exitCode).toBe(0);
    expect(second.stdout).toContain("already configured");
  });

  test("grove setup --reset replaces config and clears custom values", async () => {
    repo = await createTempExampleRepo("node-basic");
    await runGroveSetup(repo);

    await runGroveConfig(repo, ["set", "editor", "cursor"]);
    const before = await runGroveConfig(repo, ["get", "editor"]);
    expect(before.stdout).toBe("cursor");

    await runGroveSetup(repo, ["--reset"]);

    const after = await runGroveConfig(repo, ["get", "editor"]);
    expect(after.exitCode).toBe(1); // key no longer present
  });

  test("grove config set updates a value and grove config get reflects it", async () => {
    repo = await createTempExampleRepo("node-basic");
    await runGroveSetup(repo);

    await runGroveConfig(repo, ["set", "editor", "cursor"]);
    const editor = await runGroveConfig(repo, ["get", "editor"]);
    expect(editor.stdout).toBe("cursor");
  });

  test("grove config get exits 1 for a key that does not exist", async () => {
    repo = await createTempExampleRepo("node-basic");
    await runGroveSetup(repo);

    const result = await runGroveConfig(repo, ["get", "editor"]);
    expect(result.exitCode).toBe(1);
  });

  test("grove config list includes all configured keys", async () => {
    repo = await createTempExampleRepo("node-basic");
    await runGroveSetup(repo);
    await runGroveConfig(repo, ["set", "editor", "cursor"]);

    const list = await runGroveConfig(repo, ["list"]);
    expect(list.exitCode).toBe(0);
    expect(list.stdout).toContain("project");
    expect(list.stdout).toContain("node-basic");
    expect(list.stdout).toContain("editor");
    expect(list.stdout).toContain("cursor");
  });

  test("grove config set rejects unknown keys", async () => {
    repo = await createTempExampleRepo("node-basic");
    await runGroveSetup(repo);

    const result = await runGroveConfig(repo, ["set", "bogus.key", "value"]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("bogus.key");
  });

  test("grove config set rejects invalid boolean value", async () => {
    repo = await createTempExampleRepo("node-basic");
    await runGroveSetup(repo);

    const result = await runGroveConfig(repo, ["set", "enabled", "notabool"]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("enabled");
  });

  test("grove config set rejects invalid enum value for provider type", async () => {
    repo = await createTempExampleRepo("node-basic");
    await runGroveSetup(repo);

    const result = await runGroveConfig(repo, [
      "set",
      "providers.web.type",
      "made-up-type",
    ]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("docker-compose");
  });

  test("grove doctor passes after setup", async () => {
    repo = await createTempExampleRepo("node-basic");
    await runGroveSetup(repo);

    const doctor = await runGroveDoctor(repo);
    expect(doctor.exitCode).toBe(0);
    expect(doctor.stdout).toContain("Git repository detected");
    expect(doctor.stdout).toContain("Grove config exists");
  });

  test("grove doctor --json returns structured success output", async () => {
    repo = await createTempExampleRepo("node-basic");
    await runGroveSetup(repo);

    const doctor = await runGroveDoctor(repo, ["--json"]);
    expect(doctor.exitCode).toBe(0);

    const result = JSON.parse(doctor.stdout) as {
      ok: boolean;
      checks: { name: string; ok: boolean }[];
    };

    expect(result.ok).toBe(true);
    expect(Array.isArray(result.checks)).toBe(true);

    const byName = Object.fromEntries(result.checks.map((c) => [c.name, c.ok]));
    expect(byName["Git repository detected"]).toBe(true);
    expect(byName["Grove config exists"]).toBe(true);
    expect(byName["Git worktree state is valid"]).toBe(true);
  });

  test("grove doctor fails when grove is not set up", async () => {
    repo = await createTempExampleRepo("node-basic");

    const doctor = await runGroveDoctor(repo);
    expect(doctor.exitCode).toBe(1);
    expect(doctor.stdout).toContain("Grove config exists");
  });

  test("grove setup --refresh-env generates .env.worktree", async () => {
    repo = await createTempExampleRepo("node-basic");
    await runGroveSetup(repo, ["--refresh-env"]);

    expect(existsSync(path.join(repo.repoPath, ".env.worktree"))).toBe(true);
  });

  test(".env.worktree contains stable variables for node-basic on main", async () => {
    repo = await createTempExampleRepo("node-basic");
    await runGroveSetup(repo, ["--refresh-env"]);

    const env = await readGeneratedFile(repo.repoPath, ".env.worktree");

    expect(env).toContain("COMPOSE_PROJECT_NAME=node-basic-main");
    expect(env).toMatch(/^WEB_PORT=\d+$/m);
    expect(env).toMatch(/^API_PORT=\d+$/m);
    expect(env).toMatch(/^DB_PORT=\d+$/m);
  });

  test("grove doctor reports .env.worktree present after --refresh-env", async () => {
    repo = await createTempExampleRepo("node-basic");
    await runGroveSetup(repo, ["--refresh-env"]);

    const doctor = await runGroveDoctor(repo, ["--json"]);
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

  test("grove setup exits 0 and config is readable via grove config get", async () => {
    repo = await createTempExampleRepo("docker-basic");

    const setup = await runGroveSetup(repo);
    expect(setup.exitCode).toBe(0);

    const project = await runGroveConfig(repo, ["get", "project"]);
    expect(project.exitCode).toBe(0);
    expect(project.stdout).toBe("docker-basic");
  });

  test("generated config selects docker preset with web service", async () => {
    repo = await createTempExampleRepo("docker-basic");
    await runGroveSetup(repo);

    const enabled = await runGroveConfig(repo, ["get", "enabled"]);
    expect(enabled.stdout).toBe("true");

    const project = await runGroveConfig(repo, ["get", "project"]);
    expect(project.stdout).toBe("docker-basic");

    const type = await runGroveConfig(repo, ["get", "providers.web.type"]);
    expect(type.stdout).toBe("docker-compose");

    const service = await runGroveConfig(repo, [
      "get",
      "providers.web.service",
    ]);
    expect(service.stdout).toBe("web");

    const composeProject = await runGroveConfig(repo, [
      "get",
      "naming.composeProject",
    ]);
    expect(composeProject.stdout).toBe("${project}-${branch_safe}");
  });

  test("generated config matches expected snapshot", async () => {
    repo = await createTempExampleRepo("docker-basic");
    await runGroveSetup(repo);

    const generated = await readGroveConfigJson(repo);
    const expected = JSON.parse(
      await readExpectedFile("docker-basic", "grove.config.json"),
    );

    expect(generated).toEqual(expected);
  });

  test("fixed webPort flows through to WEB_PORT in .env.worktree", async () => {
    repo = await createTempExampleRepo("docker-basic");
    await runGroveSetup(repo, ["--refresh-env"]);

    await runGroveConfig(repo, ["set", "naming.webPort", "9871"]);
    await runGroveSetup(repo, ["--refresh-env"]);

    const env = await readGeneratedFile(repo.repoPath, ".env.worktree");
    expect(env).toMatch(/^WEB_PORT=9871$/m);
  });

  test("custom naming.composeProject template flows through to COMPOSE_PROJECT_NAME", async () => {
    repo = await createTempExampleRepo("docker-basic");
    await runGroveSetup(repo, ["--refresh-env"]);

    await runGroveConfig(repo, [
      "set",
      "naming.composeProject",
      "myco-${branch_safe}",
    ]);
    await runGroveSetup(repo, ["--refresh-env"]);

    const env = await readGeneratedFile(repo.repoPath, ".env.worktree");
    expect(env).toContain("COMPOSE_PROJECT_NAME=myco-main");
  });

  test("grove doctor passes after setup", async () => {
    repo = await createTempExampleRepo("docker-basic");
    await runGroveSetup(repo);

    const doctor = await runGroveDoctor(repo);
    expect(doctor.exitCode).toBe(0);
    expect(doctor.stdout).toContain("Git repository detected");
    expect(doctor.stdout).toContain("Grove config exists");
  });

  test("grove doctor --json returns structured success output", async () => {
    repo = await createTempExampleRepo("docker-basic");
    await runGroveSetup(repo);

    const doctor = await runGroveDoctor(repo, ["--json"]);
    expect(doctor.exitCode).toBe(0);

    const result = JSON.parse(doctor.stdout) as {
      ok: boolean;
      checks: { name: string; ok: boolean }[];
    };

    expect(result.ok).toBe(true);
    const byName = Object.fromEntries(result.checks.map((c) => [c.name, c.ok]));
    expect(byName["Git repository detected"]).toBe(true);
    expect(byName["Grove config exists"]).toBe(true);
  });

  test("grove setup --refresh-env generates .env.worktree", async () => {
    repo = await createTempExampleRepo("docker-basic");
    await runGroveSetup(repo, ["--refresh-env"]);

    expect(existsSync(path.join(repo.repoPath, ".env.worktree"))).toBe(true);
  });

  test(".env.worktree contains stable variables for docker-basic on main", async () => {
    repo = await createTempExampleRepo("docker-basic");
    await runGroveSetup(repo, ["--refresh-env"]);

    const env = await readGeneratedFile(repo.repoPath, ".env.worktree");

    expect(env).toContain("COMPOSE_PROJECT_NAME=docker-basic-main");
    expect(env).toContain("DB_SCHEMA=docker-basic_main");
    expect(env).toMatch(/^WEB_PORT=\d+$/m);
    expect(env).toMatch(/^API_PORT=\d+$/m);
    expect(env).toMatch(/^DB_PORT=\d+$/m);
  });

  test("grove doctor reports .env.worktree present after --refresh-env", async () => {
    repo = await createTempExampleRepo("docker-basic");
    await runGroveSetup(repo, ["--refresh-env"]);

    const doctor = await runGroveDoctor(repo, ["--json"]);
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
