import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export type Framework = 'vite' | 'next' | 'nuxt' | 'gatsby' | 'remix' | 'sveltekit' | 'node' | null;

export interface ProjectDetection {
  projectName: string;
  hasDockerCompose: boolean;
  /** All services found in docker-compose.yml */
  composeServices: string[];
  /** Services that look like shared infrastructure (db, redis, etc.) */
  sharedServices: string[];
  /** Services that are per-worktree app services */
  appServices: string[];
  hasPackageJson: boolean;
  framework: Framework;
}

// Service names that indicate shared infrastructure — not started per worktree
const SHARED_SERVICE_PATTERNS = [
  /^db$/i, /^database$/i,
  /^postgres(ql)?$/i, /^pg$/i,
  /^mysql$/i, /^mariadb$/i,
  /^mongo(db)?$/i,
  /^redis$/i,
  /^clickhouse$/i,
  /^kafka$/i, /^zookeeper$/i,
  /^rabbitmq$/i,
  /^elasticsearch$/i, /^opensearch$/i,
  /^localstack$/i,
  /^datadog.*$/i, /^dd-agent$/i,
  /^jaeger$/i, /^zipkin$/i,
];

function isSharedService(name: string): boolean {
  return SHARED_SERVICE_PATTERNS.some((p) => p.test(name));
}

/**
 * Minimal line-based parser to extract service names from docker-compose.yml.
 * Avoids adding a YAML library dependency. Handles standard indentation (2 spaces).
 */
function parseComposeServices(content: string): string[] {
  const services: string[] = [];
  let inServices = false;

  for (const line of content.split('\n')) {
    // Top-level key (no leading whitespace) toggles section tracking
    if (/^[a-zA-Z]/.test(line)) {
      inServices = /^services\s*:/.test(line);
      continue;
    }

    if (!inServices) continue;

    // Service name: exactly 2-space indent, word chars + hyphens, followed by colon
    // Must NOT be 3+ spaces (which would be a service property, not a name)
    if (/^  [a-z][a-z0-9_-]*:/i.test(line) && line[2] !== ' ') {
      const match = line.match(/^  ([a-z][a-z0-9_-]*):/i);
      if (match) services.push(match[1]);
    }
  }

  return services;
}

function detectFramework(
  dependencies: Record<string, string>,
  devDependencies: Record<string, string>,
): Framework {
  const all = { ...dependencies, ...devDependencies };

  if ('vite' in all) return 'vite';
  if ('next' in all) return 'next';
  if ('nuxt' in all || 'nuxt3' in all) return 'nuxt';
  if ('gatsby' in all) return 'gatsby';
  if ('@remix-run/node' in all || '@remix-run/react' in all) return 'remix';
  if ('@sveltejs/kit' in all) return 'sveltekit';
  if ('express' in all || 'fastify' in all || 'koa' in all || 'hapi' in all) return 'node';

  return null;
}

export async function detectProject(repoPath: string): Promise<ProjectDetection> {
  const projectName = path.basename(repoPath);

  // --- Docker Compose ---
  const composePaths = [
    path.join(repoPath, 'docker-compose.yml'),
    path.join(repoPath, 'compose.yaml'),
    path.join(repoPath, 'docker-compose.yaml'),
  ];
  const composePath = composePaths.find(existsSync);
  let composeServices: string[] = [];

  if (composePath) {
    try {
      const content = await readFile(composePath, 'utf-8');
      composeServices = parseComposeServices(content);
    } catch {
      // unreadable compose file — just continue
    }
  }

  const sharedServices = composeServices.filter(isSharedService);
  const appServices = composeServices.filter((s) => !isSharedService(s));

  // --- Node / package.json ---
  const pkgPath = path.join(repoPath, 'package.json');
  let hasPackageJson = false;
  let framework: Framework = null;

  if (existsSync(pkgPath)) {
    hasPackageJson = true;
    try {
      const raw = await readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(raw) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      framework = detectFramework(pkg.dependencies ?? {}, pkg.devDependencies ?? {});
    } catch {
      // package.json unreadable
    }
  }

  return {
    projectName,
    hasDockerCompose: !!composePath,
    composeServices,
    sharedServices,
    appServices,
    hasPackageJson,
    framework,
  };
}
