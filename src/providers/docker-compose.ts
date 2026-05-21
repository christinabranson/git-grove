import { execa } from "execa";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import type { GroveProvider } from "./types.js";
import type { GroveEnvironment } from "../types.js";
import { loadGroveConfig } from "../data/groveConfig.js";
import {
  discoverComposeContract,
  preflightComposeEnv,
  readEnvFile,
} from "./docker-compose-contract.js";
import { buildStartupEnvironment } from "../utils/envFiles.js";

interface EnvAgentVars {
  projectName: string;
  webPort?: number;
  localstackPort?: number;
  redisDb?: string;
  dbSchema?: string;
}

async function parseEnvAgentAsync(
  worktreePath: string,
): Promise<EnvAgentVars | null> {
  const envPath = path.join(worktreePath, ".env.worktree");
  if (!existsSync(envPath)) return null;

  const raw = await readFile(envPath, "utf-8");
  const env: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match) env[match[1]] = match[2];
  }

  return {
    projectName: env["COMPOSE_PROJECT_NAME"] || path.basename(worktreePath),
    webPort: env["WEB_PORT"] ? parseInt(env["WEB_PORT"], 10) : undefined,
    localstackPort: env["LOCALSTACK_PORT"]
      ? parseInt(env["LOCALSTACK_PORT"], 10)
      : undefined,
    redisDb: env["REDIS_DB"],
    dbSchema: env["DB_SCHEMA"],
  };
}

async function getDockerState(
  projectName: string,
): Promise<"running" | "partial" | "stopped" | "not started"> {
  try {
    const { stdout } = await execa("docker", [
      "compose",
      "-p",
      projectName,
      "ps",
      "--format",
      "json",
    ]);
    const containers = stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    if (containers.length === 0) return "not started";
    const running = containers.filter(
      (c: Record<string, unknown>) => c["State"] === "running",
    ).length;
    if (running === containers.length) return "running";
    if (running > 0) return "partial";
    return "stopped";
  } catch {
    return "not started";
  }
}

export class DockerComposeProvider implements GroveProvider {
  readonly name = "docker-compose";

  constructor(
    private readonly worktreePath: string,
    private readonly envName: string,
    private readonly serviceOverride?: string,
  ) {}

  async start(): Promise<GroveEnvironment> {
    const vars = await parseEnvAgentAsync(this.worktreePath);
    const projectName = vars?.projectName ?? path.basename(this.worktreePath);
    const config = await loadGroveConfig(this.worktreePath);
    const startupEnv = await buildStartupEnvironment(this.worktreePath);

    const contract = await discoverComposeContract(this.worktreePath);
    const envVars = await readEnvFile(this.worktreePath);
    const preflight = await preflightComposeEnv(
      this.worktreePath,
      contract,
      envVars,
      config?.envContract,
      startupEnv.merged,
    );
    if (!preflight.ok) {
      const lines = ["Compose env preflight failed:"];
      for (const issue of preflight.issues) {
        lines.push(`- ${issue.message}`);
        if (issue.details) lines.push(`  ${issue.details}`);
        if (issue.suggestion) lines.push(`  fix: ${issue.suggestion}`);
      }
      throw new Error(lines.join("\n"));
    }

    for (const issue of preflight.issues.filter(
      (i) => i.severity === "warning",
    )) {
      console.warn(`warning: ${issue.message}`);
      if (issue.details) console.warn(`  ${issue.details}`);
    }

    await execa(
      "docker",
      [
        "compose",
        "-p",
        projectName,
        "--env-file",
        ".env.worktree",
        "up",
        "-d",
        "--build",
      ],
      { cwd: this.worktreePath, env: startupEnv.merged },
    );

    return this._buildEnv(vars, "running");
  }

  async stop(): Promise<void> {
    const vars = await parseEnvAgentAsync(this.worktreePath);
    const projectName = vars?.projectName ?? path.basename(this.worktreePath);
    const startupEnv = await buildStartupEnvironment(this.worktreePath);
    await execa(
      "docker",
      ["compose", "-p", projectName, "--env-file", ".env.worktree", "down"],
      { cwd: this.worktreePath, env: startupEnv.merged },
    );
  }

  async status(): Promise<GroveEnvironment> {
    const vars = await parseEnvAgentAsync(this.worktreePath);
    const projectName = vars?.projectName ?? path.basename(this.worktreePath);
    const state = await getDockerState(projectName);
    return this._buildEnv(vars, state);
  }

  private _buildEnv(
    vars: EnvAgentVars | null,
    _state: string,
  ): GroveEnvironment {
    const env: GroveEnvironment = {
      name: this.envName,
      worktreePath: this.worktreePath,
      metadata: { source: "grove", provider: "docker-compose" },
    };

    if (vars?.webPort) {
      env.web = { url: `http://localhost:${vars.webPort}`, port: vars.webPort };
    }
    if (vars?.localstackPort) {
      env.api = {
        url: `http://localhost:${vars.localstackPort}`,
        port: vars.localstackPort,
      };
    }
    if (vars?.dbSchema) {
      env.db = { mode: "local" };
    }

    return env;
  }
}
