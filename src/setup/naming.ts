import net from 'net';
import type { GroveConfig } from '../types.js';

/**
 * Make a branch name safe for use in Docker project names, schema names, etc.
 * Converts slashes to hyphens, lowercases, trims to 40 chars.
 */
export function branchSafe(branch: string): string {
  return branch
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')   // anything non-alphanumeric → hyphen
    .replace(/-+/g, '-')           // collapse consecutive hyphens
    .replace(/^-|-$/g, '')         // trim leading/trailing hyphens
    .slice(0, 40);
}

function expandTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\$\{([^}]+)\}/g, (_, key: string) => vars[key] ?? `\${${key}}`);
}

export interface ExpandedNaming {
  composeProject: string;
  sharedProject: string | null;
  dbSchema: string;
  webPort: number | 'auto';
  apiPort: number | 'auto';
}

/**
 * Expand naming templates from .grove/config.json for a specific branch.
 */
export function expandNaming(config: GroveConfig, branch: string): ExpandedNaming {
  const safe = branchSafe(branch);
  const vars: Record<string, string> = {
    branch,
    branch_safe: safe,
    project: config.project ?? 'grove',
  };

  const naming = config.naming ?? {};

  return {
    composeProject: expandTemplate(naming.composeProject ?? 'grove-${branch_safe}', vars),
    sharedProject: naming.sharedProject
      ? expandTemplate(naming.sharedProject, vars)
      : null,
    dbSchema: expandTemplate(naming.dbSchema ?? '${project}_${branch_safe}', vars),
    webPort: naming.webPort ?? 'auto',
    apiPort: naming.apiPort ?? 'auto',
  };
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => { server.close(); resolve(true); });
    server.listen(port, '127.0.0.1');
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

/**
 * Build a .env.worktree file body from expanded naming values.
 * The caller is responsible for writing it to disk.
 */
export async function buildEnvAgent(
  expanded: ExpandedNaming,
  existingWebPort?: number,
): Promise<string> {
  const webPort =
    expanded.webPort === 'auto'
      ? await findFreePort(existingWebPort ?? 8080)
      : expanded.webPort;

  const apiPort =
    expanded.apiPort === 'auto'
      ? await findFreePort(webPort + 1)
      : expanded.apiPort;

  const lines = [
    `COMPOSE_PROJECT_NAME=${expanded.composeProject}`,
    `WEB_PORT=${webPort}`,
    `API_PORT=${apiPort}`,
    `DB_SCHEMA=${expanded.dbSchema}`,
    ...(expanded.sharedProject ? [`SHARED_PROJECT_NAME=${expanded.sharedProject}`] : []),
  ];

  return lines.join('\n') + '\n';
}
