export type DockerState = "running" | "partial" | "stopped" | "not started";

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
  state: "open" | "closed" | "merged";
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
    mode: "shared" | "local" | "unknown";
  };
  metadata: {
    source: "grove" | "inferred" | "fallback";
    provider: string;
  };
}

export interface GroveConfigProvider {
  type: "docker-compose" | "node-scripts" | "custom-shell";
  service?: string;
  command?: string;
  /** Path to the startup script (relative to worktree root). Required for custom-shell. */
  script?: string;
  /** Path to the teardown script (relative to worktree root). Falls back to docker compose down when absent and a compose file is detected. */
  stopScript?: string;
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
  /** docker compose -p value. Default: "${project}-${branch_safe}" */
  composeProject?: string;
  /** docker compose -p value for the shared infrastructure stack. Required to use shared stack features. */
  sharedProject?: string;
  /** DB schema name. Default: "${project}_${branch_safe}" */
  dbSchema?: string;
  /**
   * Generic host-port mapping to emit into .env.worktree (e.g. WEB_PORT, DB_PORT, REDIS_PORT).
   * Use "auto" to find a free host port at spin time.
   */
  ports?: Record<string, number | "auto">;
  /** DB host port. "auto" finds a free port at spin time. Default: "auto" */
  dbPort?: number | "auto";
  /** Web port. "auto" finds a free port at spin time. Default: "auto" */
  webPort?: number | "auto";
  /** API / secondary service port. Default: "auto" */
  apiPort?: number | "auto";
}

/**
 * Contract for how Grove should populate non-canonical compose variables.
 */
export interface GroveEnvContract {
  /**
   * Fail when required or strict-checked variables cannot be resolved.
   */
  strict?: boolean;
  /**
   * Explicitly managed vars. Grove only sets these when it can deterministically compute a value.
   */
  managed?: string[];
  /**
   * Copy these vars from source env files (.env and .env.example by default).
   */
  passthrough?: string[];
  /**
   * Template-derived vars, e.g. DATABASE_URL from other vars.
   */
  derived?: Record<string, string>;
  /**
   * Vars that must be present after rendering.
   */
  required?: string[];
  /**
   * Source env files for passthrough lookups. Defaults to [".env", ".env.example"].
   */
  sourceEnvFiles?: string[];
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
  envContract?: GroveEnvContract;
  worktrees?: {
    prefix?: string;
    /** Default base branch used by `grove start --new` when --base is not provided. Default: "main" */
    defaultBaseBranch?: string;
    /** Absolute path to place new worktrees. Overrides the default <repo-parent>/<repo-name>-worktrees. */
    root?: string;
  };
}
