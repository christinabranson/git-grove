import { execa } from 'execa';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import type { GroveProvider } from './types.js';
import type { GroveEnvironment } from '../types.js';
import type { Framework } from '../setup/detect.js';

interface PackageJson {
  scripts?: Record<string, string>;
}

async function readPackageJson(worktreePath: string): Promise<PackageJson | null> {
  const pkgPath = path.join(worktreePath, 'package.json');
  if (!existsSync(pkgPath)) return null;
  try {
    const raw = await readFile(pkgPath, 'utf-8');
    return JSON.parse(raw) as PackageJson;
  } catch {
    return null;
  }
}

// Known default ports by framework — sourced from detectProject's dependency graph
const FRAMEWORK_DEFAULT_PORTS: Partial<Record<NonNullable<Framework>, number>> = {
  vite: 5173,
  next: 3000,
  nuxt: 3000,
  gatsby: 8000,
  remix: 3000,
  sveltekit: 5173,
  node: 3000,
};

/**
 * Resolve port for a Node project.
 * Prefers an explicit framework hint (from detectProject) over script-content scanning
 * since the dependency graph is more reliable than heuristic string matching.
 */
function inferPort(
  scripts: Record<string, string>,
  framework?: Framework,
): number | undefined {
  // Explicit port flag in the script always wins
  const devScript = scripts['dev'] ?? scripts['start'] ?? '';
  const portMatch = devScript.match(/--port[= ](\d+)|-p[= ](\d+)|PORT=(\d+)/);
  if (portMatch) return parseInt(portMatch[1] ?? portMatch[2] ?? portMatch[3], 10);

  // Use pre-resolved framework from dependency analysis
  if (framework) return FRAMEWORK_DEFAULT_PORTS[framework];

  // Fallback: scan script string for framework names (legacy path, no detected framework)
  if (devScript.includes('vite')) return 5173;
  if (devScript.includes('next')) return 3000;
  if (devScript.includes('react-scripts')) return 3000;
  if (devScript.includes('nuxt')) return 3000;
  if (devScript.includes('gatsby')) return 8000;

  return undefined;
}

export class NodeScriptsProvider implements GroveProvider {
  readonly name = 'node-scripts';

  constructor(
    private readonly worktreePath: string,
    private readonly envName: string,
    private readonly scriptName: string = 'dev',
    private readonly framework?: Framework,
  ) {}

  async start(): Promise<GroveEnvironment> {
    const pkg = await readPackageJson(this.worktreePath);
    const scripts = pkg?.scripts ?? {};

    const script = scripts[this.scriptName] ?? scripts['start'];
    if (!script) {
      throw new Error(`No '${this.scriptName}' or 'start' script found in package.json`);
    }

    // Run in background — the caller is responsible for detaching/tracking
    execa('npm', ['run', this.scriptName], {
      cwd: this.worktreePath,
      detached: true,
      stdio: 'ignore',
    }).unref();

    const port = inferPort(scripts, this.framework);
    return this._buildEnv(port, 'inferred');
  }

  async stop(): Promise<void> {
    // Best-effort: kill the node process listening on the detected port
    const pkg = await readPackageJson(this.worktreePath);
    const port = pkg?.scripts ? inferPort(pkg.scripts, this.framework) : undefined;
    if (port) {
      try {
        await execa('bash', ['-c', `lsof -ti:${port} | xargs kill -9`]);
      } catch {
        // process may already be gone
      }
    }
  }

  async status(): Promise<GroveEnvironment> {
    const pkg = await readPackageJson(this.worktreePath);
    const scripts = pkg?.scripts ?? {};
    const port = inferPort(scripts, this.framework);

    let running = false;
    if (port) {
      try {
        const { stdout } = await execa('bash', ['-c', `lsof -ti:${port}`]);
        running = stdout.trim().length > 0;
      } catch {
        running = false;
      }
    }

    return this._buildEnv(port, running ? 'inferred' : 'fallback');
  }

  private _buildEnv(port: number | undefined, source: 'inferred' | 'fallback'): GroveEnvironment {
    const env: GroveEnvironment = {
      name: this.envName,
      worktreePath: this.worktreePath,
      metadata: { source, provider: 'node-scripts' },
    };
    if (port) {
      env.web = { url: `http://localhost:${port}`, port };
    }
    return env;
  }
}
