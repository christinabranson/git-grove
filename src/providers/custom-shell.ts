import { execa } from "execa";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import type { GroveProvider } from "./types.js";
import type { GroveEnvironment } from "../types.js";

interface EnvWorktreeVars {
  projectName: string;
  webPort?: number;
  apiPort?: number;
}

async function parseEnvWorktree(
  worktreePath: string,
): Promise<{ raw: Record<string, string>; typed: EnvWorktreeVars }> {
  const envPath = path.join(worktreePath, ".env.worktree");
  const raw: Record<string, string> = {};

  if (existsSync(envPath)) {
    const text = await readFile(envPath, "utf-8");
    for (const line of text.split("\n")) {
      const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (match) raw[match[1]] = match[2];
    }
  }

  return {
    raw,
    typed: {
      projectName: raw["COMPOSE_PROJECT_NAME"] ?? path.basename(worktreePath),
      webPort: raw["WEB_PORT"] ? parseInt(raw["WEB_PORT"], 10) : undefined,
      apiPort: raw["API_PORT"] ? parseInt(raw["API_PORT"], 10) : undefined,
    },
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

export class CustomShellProvider implements GroveProvider {
  readonly name = "custom-shell";

  constructor(
    private readonly worktreePath: string,
    private readonly envName: string,
    private readonly script: string,
    private readonly stopScript?: string,
    private readonly serviceOverride?: string,
  ) {}

  private resolveScript(script: string, label: string): string {
    const resolved = path.resolve(this.worktreePath, script);
    if (
      !resolved.startsWith(this.worktreePath + path.sep) &&
      resolved !== this.worktreePath
    ) {
      throw new Error(`${label} path escapes the worktree root: ${script}`);
    }
    return resolved;
  }

  async start(): Promise<GroveEnvironment> {
    const scriptPath = this.resolveScript(this.script, "script");
    if (!existsSync(scriptPath)) {
      throw new Error(`Custom start script not found: ${scriptPath}`);
    }

    const { raw, typed } = await parseEnvWorktree(this.worktreePath);

    // Make the .env.worktree path available so the script can pass it to
    // docker compose (e.g. docker compose --env-file "$GROVE_ENV_FILE" up)
    const envForScript: Record<string, string> = {
      ...(process.env as Record<string, string>),
      ...raw,
      GROVE_ENV_FILE: path.join(this.worktreePath, ".env.worktree"),
    };

    await execa("bash", [scriptPath], {
      cwd: this.worktreePath,
      env: envForScript,
      stdio: "inherit",
    });

    return this._buildEnv(typed, "running");
  }

  async stop(): Promise<void> {
    const { raw, typed } = await parseEnvWorktree(this.worktreePath);

    if (this.stopScript) {
      const stopPath = this.resolveScript(this.stopScript, "stopScript");
      if (!existsSync(stopPath)) {
        throw new Error(`Custom stop script not found: ${stopPath}`);
      }

      const envForScript: Record<string, string> = {
        ...(process.env as Record<string, string>),
        ...raw,
        GROVE_ENV_FILE: path.join(this.worktreePath, ".env.worktree"),
      };

      await execa("bash", [stopPath], {
        cwd: this.worktreePath,
        env: envForScript,
        stdio: "inherit",
      });
      return;
    }

    // Fallback: stop via docker compose if a compose file is present.
    // Matches the same filename list used by docker-compose-contract.ts.
    const composeFiles = [
      "compose.yaml",
      "compose.yml",
      "docker-compose.yml",
      "docker-compose.yaml",
    ];
    const hasCompose = composeFiles.some((f) =>
      existsSync(path.join(this.worktreePath, f)),
    );

    if (hasCompose) {
      await execa(
        "docker",
        [
          "compose",
          "-p",
          typed.projectName,
          "--env-file",
          ".env.worktree",
          "down",
        ],
        { cwd: this.worktreePath },
      );
    }
  }

  async status(): Promise<GroveEnvironment> {
    const { typed } = await parseEnvWorktree(this.worktreePath);
    const state = await getDockerState(typed.projectName);
    return this._buildEnv(typed, state);
  }

  private _buildEnv(vars: EnvWorktreeVars, _state: string): GroveEnvironment {
    const env: GroveEnvironment = {
      name: this.envName,
      worktreePath: this.worktreePath,
      metadata: { source: "grove", provider: "custom-shell" },
    };

    if (vars.webPort) {
      env.web = { url: `http://localhost:${vars.webPort}`, port: vars.webPort };
    }
    if (vars.apiPort) {
      env.api = {
        url: `http://localhost:${vars.apiPort}`,
        port: vars.apiPort,
      };
    }

    return env;
  }
}
