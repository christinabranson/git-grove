import type { GroveProvider } from "./types.js";
import type { GroveEnvironment, GroveConfig } from "../types.js";
import { DockerComposeProvider } from "./docker-compose.js";
import { NodeScriptsProvider } from "./node-scripts.js";
import { CustomShellProvider } from "./custom-shell.js";
import { loadGroveConfig } from "../data/groveConfig.js";
import { detectProject } from "../setup/detect.js";

// Minimal fallback when no environment can be started automatically
class FallbackProvider implements GroveProvider {
  readonly name = "fallback";
  constructor(
    private readonly worktreePath: string,
    private readonly envName: string,
  ) {}

  async start(): Promise<GroveEnvironment> {
    return this._env();
  }
  async stop(): Promise<void> {}
  async status(): Promise<GroveEnvironment> {
    return this._env();
  }

  private _env(): GroveEnvironment {
    return {
      name: this.envName,
      worktreePath: this.worktreePath,
      metadata: { source: "fallback", provider: "fallback" },
    };
  }
}

/**
 * Resolve provider for a worktree.
 *
 * Resolution is a three-stage pipeline:
 *   1. detectProject() — single filesystem scan, produces all capability hints
 *   2. .grove/config.json — optional explicit override
 *   3. Provider routing — pure decision logic, no additional filesystem reads
 */
export async function discoverProvider(
  worktreePath: string,
  envName: string,
): Promise<GroveProvider> {
  const [config, detection] = await Promise.all([
    loadGroveConfig(worktreePath),
    detectProject(worktreePath),
  ]);

  // 1. Explicit grove config wins
  if (config) {
    return resolveFromConfig(config, worktreePath, envName);
  }

  // 2. Docker Compose — use detection output, no redundant filesystem checks
  if (detection.hasDockerCompose) {
    // Pass the first identified app service as a hint; providers handle absent hints gracefully
    return new DockerComposeProvider(
      worktreePath,
      envName,
      detection.appServices[0],
    );
  }

  // 3. Node-based project — use detected framework for script/port resolution
  if (detection.hasPackageJson) {
    return new NodeScriptsProvider(
      worktreePath,
      envName,
      "dev",
      detection.framework ?? undefined,
    );
  }

  // 4. Terminal fallback — reports environment as unknown, takes no action
  return new FallbackProvider(worktreePath, envName);
}

function resolveFromConfig(
  config: GroveConfig,
  worktreePath: string,
  envName: string,
): GroveProvider {
  // Use the first configured provider. Multi-provider support (web + api separately)
  // can be layered on later; for now we pick the dominant service.
  const entries = Object.entries(config.providers);
  if (entries.length === 0) return new FallbackProvider(worktreePath, envName);

  const [, providerConfig] = entries[0];

  switch (providerConfig.type) {
    case "docker-compose":
      return new DockerComposeProvider(
        worktreePath,
        envName,
        providerConfig.service,
      );
    case "node-scripts":
      return new NodeScriptsProvider(
        worktreePath,
        envName,
        providerConfig.command ?? "dev",
      );
    case "custom-shell":
      if (!providerConfig.script) {
        throw new Error(
          `custom-shell provider requires a "script" field in .grove/config.json`,
        );
      }
      return new CustomShellProvider(
        worktreePath,
        envName,
        providerConfig.script,
        providerConfig.stopScript,
        providerConfig.service,
      );
    default:
      return new FallbackProvider(worktreePath, envName);
  }
}
