import net from "net";
import { execa } from "execa";
import type { GroveConfig } from "../types.js";

/**
 * Make a branch name safe for use in Docker project names, schema names, etc.
 * Converts slashes to hyphens, lowercases, trims to 40 chars.
 */
export function branchSafe(branch: string): string {
  return branch
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-") // anything non-alphanumeric → hyphen
    .replace(/-+/g, "-") // collapse consecutive hyphens
    .replace(/^-|-$/g, "") // trim leading/trailing hyphens
    .slice(0, 40);
}

function expandTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(
    /\$\{([^}]+)\}/g,
    (_, key: string) => vars[key] ?? `\${${key}}`,
  );
}

export interface ExpandedNaming {
  composeProject: string;
  sharedProject: string | null;
  dbSchema: string;
  dbPort: number | "auto";
  webPort: number | "auto";
  apiPort: number | "auto";
  ports: Record<string, number | "auto">;
}

const DEFAULT_PORT_STARTS: Record<string, number> = {
  WEB_PORT: 8080,
  API_PORT: 8081,
  DB_PORT: 5432,
  REDIS_PORT: 6379,
  LOCALSTACK_PORT: 4566,
};

const DOCKER_PUBLISHED_PORT_RE =
  /(?:^|[\s,])(?:[^\s:,]+:)?(\d{2,5})->\d{2,5}\/(?:tcp|udp)/g;

/**
 * Expand naming templates from Grove config for a specific branch.
 */
export function expandNaming(
  config: GroveConfig,
  branch: string,
): ExpandedNaming {
  const safe = branchSafe(branch);
  const vars: Record<string, string> = {
    branch,
    branch_safe: safe,
    project: config.project ?? "grove",
  };

  const naming = config.naming ?? {};

  const dbPort = naming.dbPort ?? "auto";
  const webPort = naming.webPort ?? "auto";
  const apiPort = naming.apiPort ?? "auto";
  const effectivePorts: Record<string, number | "auto"> = {
    ...(naming.ports ?? {}),
    WEB_PORT: webPort,
    API_PORT: apiPort,
    DB_PORT: dbPort,
  };

  return {
    composeProject: expandTemplate(
      naming.composeProject ?? "${project}-${branch_safe}",
      vars,
    ),
    sharedProject: naming.sharedProject
      ? expandTemplate(naming.sharedProject, vars)
      : null,
    dbSchema: expandTemplate(
      naming.dbSchema ?? "${project}_${branch_safe}",
      vars,
    ),
    // Keep scalar fields aligned with the effective canonical map.
    dbPort: effectivePorts.DB_PORT,
    webPort: effectivePorts.WEB_PORT,
    apiPort: effectivePorts.API_PORT,
    ports: effectivePorts,
  };
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close();
      resolve(true);
    });
    server.listen(port, "127.0.0.1");
  });
}

/**
 * Find the first free TCP port at or after `start`.
 * Checks up to 200 ports before giving up.
 */
export async function findFreePort(start: number): Promise<number> {
  for (let p = start; p < start + 200; p++) {
    if (await isPortFree(p)) return p;
  }
  throw new Error(`Could not find a free port starting from ${start}`);
}

export function extractPublishedHostPorts(portsField: string): number[] {
  const discovered = new Set<number>();

  for (const match of portsField.matchAll(DOCKER_PUBLISHED_PORT_RE)) {
    const value = Number.parseInt(match[1], 10);
    if (!Number.isNaN(value)) discovered.add(value);
  }

  return [...discovered];
}

async function getDockerPublishedHostPorts(): Promise<number[]> {
  try {
    const { stdout } = await execa("docker", ["ps", "--format", "json"]);
    const ports = new Set<number>();

    for (const line of stdout.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(trimmed) as Record<string, unknown>;
      } catch {
        continue;
      }

      const field =
        typeof parsed["Ports"] === "string"
          ? parsed["Ports"]
          : typeof parsed["ports"] === "string"
            ? parsed["ports"]
            : "";

      for (const port of extractPublishedHostPorts(field)) {
        ports.add(port);
      }
    }

    return [...ports];
  } catch {
    // Docker may be unavailable or not running; fall back to socket checks only.
    return [];
  }
}

async function findFreePortWithReserved(
  start: number,
  reserved: Set<number>,
): Promise<number> {
  for (let p = start; p < start + 200; p++) {
    if (!reserved.has(p) && (await isPortFree(p))) return p;
  }
  throw new Error(`Could not find a free port starting from ${start}`);
}

function inferStartPort(
  key: string,
  resolvedPorts: Record<string, number>,
): number {
  if (key === "API_PORT" && resolvedPorts["WEB_PORT"]) {
    return resolvedPorts["WEB_PORT"] + 1;
  }
  return DEFAULT_PORT_STARTS[key] ?? 10000;
}

/**
 * Build a .env.worktree file body from expanded naming values.
 * The caller is responsible for writing it to disk.
 */
export async function buildEnvAgent(
  expanded: ExpandedNaming,
  existingWebPort?: number,
): Promise<string> {
  const envVars = await buildCanonicalEnvVars(expanded, existingWebPort);
  const lines = Object.entries(envVars)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`);

  return lines.join("\n") + "\n";
}

export async function buildCanonicalEnvVars(
  expanded: ExpandedNaming,
  existingWebPort?: number,
): Promise<Record<string, string>> {
  const portSpecs: Record<string, number | "auto"> = {
    ...expanded.ports,
    WEB_PORT: expanded.webPort,
    API_PORT: expanded.apiPort,
    DB_PORT: expanded.dbPort,
  };

  const dockerReserved = new Set<number>(await getDockerPublishedHostPorts());
  const reserved = new Set<number>(dockerReserved);
  const configuredByPort = new Map<number, string>();
  const resolvedPorts: Record<string, number> = {};

  for (const [key, value] of Object.entries(portSpecs)) {
    if (typeof value === "number") {
      const duplicateKey = configuredByPort.get(value);
      if (duplicateKey) {
        throw new Error(
          `Port ${value} is configured for both ${duplicateKey} and ${key}. Run \`grove config set naming.ports.${key} <port>\` or update naming.webPort/naming.apiPort/naming.dbPort.`,
        );
      }
      if (dockerReserved.has(value)) {
        throw new Error(
          `Port ${value} configured for ${key} is already published by a running container.`,
        );
      }
      reserved.add(value);
      configuredByPort.set(value, key);
      resolvedPorts[key] = value;
      continue;
    }

    const start =
      key === "WEB_PORT"
        ? (existingWebPort ?? DEFAULT_PORT_STARTS.WEB_PORT)
        : inferStartPort(key, resolvedPorts);
    const resolved = await findFreePortWithReserved(start, reserved);
    reserved.add(resolved);
    resolvedPorts[key] = resolved;
  }

  return {
    COMPOSE_PROJECT_NAME: expanded.composeProject,
    ...Object.fromEntries(
      Object.entries(resolvedPorts).map(([key, value]) => [key, String(value)]),
    ),
    DB_SCHEMA: expanded.dbSchema,
    ...(expanded.sharedProject
      ? { SHARED_PROJECT_NAME: expanded.sharedProject }
      : {}),
  };
}
