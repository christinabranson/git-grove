import { execa } from "execa";
import { readFile, mkdir, writeFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import type { Worktree, ChangeFootprint, GitChange, PRInfo } from "../types.js";

interface RawWorktree {
  path: string;
  head: string;
  branch: string;
  isBare: boolean;
}

async function parseWorktreeList(repoPath: string): Promise<RawWorktree[]> {
  const { stdout } = await execa("git", ["worktree", "list", "--porcelain"], {
    cwd: repoPath,
  });

  const worktrees: RawWorktree[] = [];
  const blocks = stdout.trim().split("\n\n");

  for (const block of blocks) {
    if (!block.trim()) continue;
    const lines = block.trim().split("\n");
    const wt: Partial<RawWorktree> = { isBare: false };

    for (const line of lines) {
      if (line.startsWith("worktree ")) wt.path = line.slice(9);
      else if (line.startsWith("HEAD ")) wt.head = line.slice(5);
      else if (line.startsWith("branch "))
        wt.branch = line.slice(7).replace("refs/heads/", "");
      else if (line === "bare") wt.isBare = true;
      else if (line === "detached") wt.branch = "(detached)";
    }

    if (wt.path && !wt.isBare) {
      worktrees.push(wt as RawWorktree);
    }
  }

  return worktrees;
}

async function readChangeFootprint(
  worktreePath: string,
): Promise<ChangeFootprint | null> {
  try {
    const { stdout: statOut } = await execa("git", ["diff", "--stat", "HEAD"], {
      cwd: worktreePath,
    });

    const { stdout: statusOut } = await execa("git", ["status", "--short"], {
      cwd: worktreePath,
    });

    if (!statOut.trim() && !statusOut.trim()) return null;

    // Parse stat output: lines like "  src/auth/AuthService.ts | 42 +++++---"
    const changeMap = new Map<string, GitChange>();

    for (const line of statOut.split("\n")) {
      const match = line.match(/^\s+(.+?)\s+\|\s+(\d+)\s+([+\-]+)?/);
      if (!match) continue;
      const filePath = match[1].trim();
      const total = parseInt(match[2], 10);
      const markers = match[3] || "";
      const plusCount = markers.split("+").length - 1;
      const minusCount = markers.split("-").length - 1;
      const totalMarkers = plusCount + minusCount || 1;
      const added = Math.round((plusCount / totalMarkers) * total);
      const removed = total - added;

      changeMap.set(filePath, { path: filePath, added, removed });
    }

    // Also include untracked/new files from git status
    for (const line of statusOut.split("\n")) {
      if (!line.trim()) continue;
      const status = line.slice(0, 2).trim();
      const filePath = line.slice(3).trim();
      if ((status === "??" || status === "A") && !changeMap.has(filePath)) {
        changeMap.set(filePath, { path: filePath, added: 0, removed: 0 });
      }
    }

    // Group by directory
    const byDir: Record<string, GitChange[]> = {};
    for (const change of changeMap.values()) {
      const dir = path.dirname(change.path);
      const key = dir === "." ? "(root)" : dir;
      if (!byDir[key]) byDir[key] = [];
      byDir[key].push(change);
    }

    return { byDir, totalFiles: changeMap.size };
  } catch {
    return null;
  }
}

async function readBaseBranch(
  worktreePath: string,
  branch: string,
): Promise<string | null> {
  // 1. Grove-written metadata (set when worktree was created with --base)
  const metaPath = path.join(worktreePath, ".grove", "meta.json");
  if (existsSync(metaPath)) {
    try {
      const raw = await readFile(metaPath, "utf-8");
      const meta = JSON.parse(raw) as { baseBranch?: string };
      if (meta.baseBranch) return meta.baseBranch;
    } catch {
      // malformed, fall through
    }
  }

  // 2. Git upstream tracking branch (strips remote prefix, e.g. "origin/main" → "main")
  try {
    const { stdout } = await execa(
      "git",
      ["rev-parse", "--abbrev-ref", `${branch}@{upstream}`],
      {
        cwd: worktreePath,
      },
    );
    const upstream = stdout.trim();
    if (upstream) return upstream.replace(/^[^/]+\//, "");
  } catch {
    // no upstream set
  }

  return null;
}

async function readDockerInfo(worktreePath: string) {
  const envPath = path.join(worktreePath, ".env.worktree");
  if (!existsSync(envPath)) return null;

  const hasCompose =
    existsSync(path.join(worktreePath, "docker-compose.yml")) ||
    existsSync(path.join(worktreePath, "compose.yaml"));

  if (!hasCompose) return null;

  const raw = await readFile(envPath, "utf-8");
  const env: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match) env[match[1]] = match[2];
  }

  const projectName =
    env["COMPOSE_PROJECT_NAME"] || path.basename(worktreePath);
  const webPort = env["WEB_PORT"] ? parseInt(env["WEB_PORT"], 10) : undefined;
  const localstackPort = env["LOCALSTACK_PORT"]
    ? parseInt(env["LOCALSTACK_PORT"], 10)
    : undefined;

  // Check docker compose ps
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

    let state: "running" | "partial" | "stopped" | "not started" =
      "not started";
    if (containers.length > 0) {
      const running = containers.filter(
        (c: Record<string, unknown>) => c["State"] === "running",
      ).length;
      if (running === containers.length) state = "running";
      else if (running > 0) state = "partial";
      else state = "stopped";
    }

    return {
      state,
      projectName,
      webPort,
      localstackPort,
      redisDb: env["REDIS_DB"],
      dbSchema: env["DB_SCHEMA"],
    };
  } catch {
    return {
      state: "not started" as const,
      projectName,
      webPort,
      localstackPort,
      redisDb: env["REDIS_DB"],
      dbSchema: env["DB_SCHEMA"],
    };
  }
}

interface GhPRJson {
  number: number;
  title: string;
  url: string;
  state: string;
  headRefName: string;
  author: { login: string };
  reviews: Array<{ state: string; author: { login: string } }>;
  reviewRequests: Array<unknown>;
}

async function fetchPRsByBranch(
  repoPath: string,
): Promise<{ prs: Map<string, PRInfo> | null; warning: string | null }> {
  try {
    await execa("gh", ["auth", "status"], { cwd: repoPath });
  } catch (err) {
    const isNotFound = (err as { code?: string }).code === "ENOENT";
    if (isNotFound) {
      return {
        prs: null,
        warning: "GitHub CLI (gh) not found — install it to see PR data",
      };
    }
    return {
      prs: null,
      warning: "gh not authenticated — run gh auth login to see PR data",
    };
  }

  let currentUser: string | null = null;
  try {
    const { stdout } = await execa("gh", ["api", "user", "--jq", ".login"], {
      cwd: repoPath,
    });
    currentUser = stdout.trim() || null;
  } catch {
    // non-fatal, isAuthor/youCommented will be false
  }

  try {
    const { stdout } = await execa(
      "gh",
      [
        "pr",
        "list",
        "--json",
        "number,title,url,state,headRefName,author,reviews,reviewRequests",
        "--limit",
        "100",
      ],
      { cwd: repoPath },
    );

    const raw: GhPRJson[] = JSON.parse(stdout);
    const stateMap: Record<string, PRInfo["state"]> = {
      OPEN: "open",
      CLOSED: "closed",
      MERGED: "merged",
    };
    const map = new Map<string, PRInfo>();

    for (const pr of raw) {
      map.set(pr.headRefName, {
        number: pr.number,
        title: pr.title,
        url: pr.url,
        state: stateMap[pr.state] ?? "open",
        approvals: pr.reviews.filter((r) => r.state === "APPROVED").length,
        reviewRequested: pr.reviewRequests.length > 0,
        isAuthor: currentUser != null && pr.author.login === currentUser,
        youCommented:
          currentUser != null &&
          pr.reviews.some((r) => r.author.login === currentUser),
      });
    }

    return { prs: map, warning: null };
  } catch {
    return { prs: null, warning: "gh pr list failed — PR data unavailable" };
  }
}

export interface LoadWorktreesResult {
  worktrees: Worktree[];
  ghWarning: string | null;
}

export async function loadWorktrees(
  repoPath: string,
): Promise<LoadWorktreesResult> {
  const [raw, { prs, warning: ghWarning }] = await Promise.all([
    parseWorktreeList(repoPath),
    fetchPRsByBranch(repoPath),
  ]);

  const worktrees = await Promise.all(
    raw.map(async (wt, idx) => {
      const branch = wt.branch || "(unknown)";
      const [changeFootprint, docker, baseBranch] = await Promise.all([
        readChangeFootprint(wt.path),
        readDockerInfo(wt.path),
        readBaseBranch(wt.path, branch),
      ]);

      return {
        path: wt.path,
        branch,
        baseBranch,
        isMain: idx === 0,
        isCurrent: false,
        head: wt.head || "",
        docker,
        changeFootprint,
        pr: prs?.get(branch) ?? null,
      } satisfies Worktree;
    }),
  );

  return { worktrees, ghWarning };
}

/**
 * Resolve the directory where worktrees are placed.
 *
 * Priority:
 *   1. $GROVE_WORKTREE_ROOT environment variable
 *   2. worktrees.root in .grove/config.json
 *   3. Default: <repo-parent>/<repo-name>-worktrees
 */
export function resolveWorktreeRoot(
  repoPath: string,
  configRoot?: string,
): string {
  if (process.env.GROVE_WORKTREE_ROOT) return process.env.GROVE_WORKTREE_ROOT;
  if (configRoot) return configRoot;
  return path.join(
    path.dirname(repoPath),
    `${path.basename(repoPath)}-worktrees`,
  );
}

export async function detectRepoRoot(): Promise<string> {
  try {
    const { stdout } = await execa("git", ["rev-parse", "--show-toplevel"]);
    return stdout.trim();
  } catch {
    throw new Error("Not inside a git repository");
  }
}

export async function detectDefaultBranch(repoPath: string): Promise<string> {
  try {
    const { stdout } = await execa(
      "git",
      ["symbolic-ref", "refs/remotes/origin/HEAD", "--short"],
      { cwd: repoPath },
    );
    const ref = stdout.trim();
    if (ref) return ref.replace(/^[^/]+\//, "");
  } catch {
    // remote HEAD not configured
  }

  for (const candidate of ["main", "master"]) {
    for (const ref of [candidate, `origin/${candidate}`]) {
      try {
        await execa("git", ["rev-parse", "--verify", ref], { cwd: repoPath });
        return candidate;
      } catch {
        // ref doesn't exist, try next
      }
    }
  }

  return "main";
}

export async function createWorktreeWithBase(
  repoPath: string,
  branch: string,
  worktreePath: string,
  base: string,
): Promise<void> {
  await execa(
    "git",
    ["worktree", "add", "-b", branch, worktreePath, base],
    { cwd: repoPath },
  );
  const groveMetaDir = path.join(worktreePath, ".grove");
  await mkdir(groveMetaDir, { recursive: true });
  await writeFile(
    path.join(groveMetaDir, "meta.json"),
    JSON.stringify({ baseBranch: base }, null, 2),
  );
}
