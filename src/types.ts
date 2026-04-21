export type DockerState = 'running' | 'partial' | 'stopped' | 'not started';

export interface DockerInfo {
  state: DockerState;
  projectName: string;
  webPort?: number;
  localstackPort?: number;
  redisDb?: string;
  dbSchema?: string;
}

export interface GitChange {
  path: string;
  added: number;
  removed: number;
}

export interface ChangeFootprint {
  byDir: Record<string, GitChange[]>;
  totalFiles: number;
}

export interface PRInfo {
  number: number;
  title: string;
  url: string;
  state: 'open' | 'closed' | 'merged';
  approvals: number;
  reviewRequested: boolean;
  youCommented: boolean;
  isAuthor: boolean;
}

export interface Worktree {
  path: string;
  branch: string;
  baseBranch: string | null;
  isMain: boolean;
  isCurrent: boolean;
  head: string;
  docker: DockerInfo | null;
  changeFootprint: ChangeFootprint | null;
  pr: PRInfo | null;
}

// --- Environment orchestration types ---

export interface GroveEnvironment {
  name: string;
  worktreePath: string;
  web?: {
    url: string;
    port?: number;
  };
  api?: {
    url: string;
    port?: number;
  };
  db?: {
    mode: 'shared' | 'local' | 'unknown';
  };
  metadata: {
    source: 'grove' | 'inferred' | 'fallback';
    provider: string;
  };
}

export interface GroveConfigProvider {
  type: 'docker-compose' | 'node-scripts' | 'custom-shell';
  service?: string;
  command?: string;
}

/**
 * Naming templates for per-worktree resource naming.
 * Templates are expanded at spin time, not stored as literal values.
 *
 * Available variables:
 *   ${branch}       — branch name as-is (e.g. feat/auth-refresh)
 *   ${branch_safe}  — branch with / → -, lowercased, max 40 chars (e.g. feat-auth-refresh)
 *   ${project}      — project name from this config
 */
export interface GroveConfigNaming {
  /** docker compose -p value. Default: "grove-${branch_safe}" */
  composeProject?: string;
  /** docker compose -p value for the shared infrastructure stack. Required to use shared stack features. */
  sharedProject?: string;
  /** DB schema name. Default: "${project}_${branch_safe}" */
  dbSchema?: string;
  /** Web port. "auto" finds a free port at spin time. Default: "auto" */
  webPort?: number | 'auto';
  /** API / secondary service port. Default: "auto" */
  apiPort?: number | 'auto';
}

export interface GroveConfig {
  enabled: boolean;
  project: string;
  editor?: string;
  /** Path to the shared infrastructure compose file. Default: "compose.shared.yaml" */
  sharedComposeFile?: string;
  providers: Record<string, GroveConfigProvider>;
  shared?: Record<string, boolean>;
  naming?: GroveConfigNaming;
  worktrees?: {
    prefix?: string;
    /** Absolute path to place new worktrees. Overrides the default <repo-parent>/<repo-name>-worktrees. */
    root?: string;
  };
}
