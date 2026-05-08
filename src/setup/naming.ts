import net from "net";
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

/**
 * Expand naming templates from .grove/config.json for a specific branch.
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

  return {
    composeProject: expandTemplate(
      naming.composeProject ?? "grove-${branch_safe}",
      vars,
    ),
    sharedProject: naming.sharedProject
      ? expandTemplate(naming.sharedProject, vars)
      : null,
    dbSchema: expandTemplate(
      naming.dbSchema ?? "${project}_${branch_safe}",
      vars,
    ),
    dbPort,
    webPort,
    apiPort,
    ports: {
      WEB_PORT: webPort,
      API_PORT: apiPort,
      DB_PORT: dbPort,
      ...(naming.ports ?? {}),
    },
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
  const portSpecs: Record<string, number | "auto"> = {
    WEB_PORT: expanded.webPort,
    API_PORT: expanded.apiPort,
    DB_PORT: expanded.dbPort,
    ...expanded.ports,
  };

  const reserved = new Set<number>();
  const resolvedPorts: Record<string, number> = {};

  for (const [key, value] of Object.entries(portSpecs)) {
    if (typeof value === "number") {
      if (reserved.has(value)) {
        throw new Error(`Duplicate port configured: ${value}`);
      }
      reserved.add(value);
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

  const portLines = Object.entries(resolvedPorts).map(
    ([key, value]) => `${key}=${value}`,
  );

  const lines = [
    `COMPOSE_PROJECT_NAME=${expanded.composeProject}`,
    ...portLines,
    `DB_SCHEMA=${expanded.dbSchema}`,
    ...(expanded.sharedProject
      ? [`SHARED_PROJECT_NAME=${expanded.sharedProject}`]
      : []),
  ];

  return lines.join("\n") + "\n";
}
