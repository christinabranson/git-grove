import { execa } from "execa";
import { existsSync } from "fs";
import { readFile } from "fs/promises";
import path from "path";

const COMPOSE_FILES = [
  "compose.yaml",
  "compose.yml",
  "docker-compose.yml",
  "docker-compose.yaml",
];

const INTERPOLATION_RE = /\$\{([A-Z][A-Z0-9_]*)/g;
const PUBLISHED_PORT_RE =
  /(?:^|[\s,])(?:[^\s:,]+:)?(\d{2,5})->\d{2,5}\/(?:tcp|udp)/g;

export interface ComposePortRef {
  variable: string;
  service?: string;
  source: "ports" | "variables" | "text-scan";
}

export interface ComposeDbNameRef {
  variable: string;
  service?: string;
  source: "environment" | "variables" | "text-scan";
}

export interface ComposeContract {
  expectedVars: string[];
  portRefs: ComposePortRef[];
  dbNameRefs: ComposeDbNameRef[];
  projectNameVars: string[];
  warnings: string[];
}

export interface PreflightIssue {
  severity: "error" | "warning";
  message: string;
  details?: string;
  suggestion?: string;
}

export interface PreflightResult {
  ok: boolean;
  issues: PreflightIssue[];
  resolvedPublishedPorts: Array<{
    service: string;
    hostPort: number;
    targetPort?: number;
  }>;
}

function uniqSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

export function extractInterpolationVars(input: string): string[] {
  const vars = new Set<string>();
  for (const match of input.matchAll(INTERPOLATION_RE)) {
    vars.add(match[1]);
  }
  return [...vars];
}

function isDbLikeVar(variable: string): boolean {
  return /(DB|DATABASE|POSTGRES|PG|SCHEMA)/i.test(variable);
}

function isDbNameLikeVar(variable: string): boolean {
  if (!isDbLikeVar(variable)) return false;
  if (/(PASSWORD|PASS|USER|USERNAME|URL|HOST|PORT)/i.test(variable)) {
    return false;
  }
  return true;
}

function isPortLikeVar(variable: string): boolean {
  return /PORT/i.test(variable);
}

function pushPortRef(
  refs: ComposePortRef[],
  variable: string,
  service: string | undefined,
  source: ComposePortRef["source"],
): void {
  refs.push({ variable, service, source });
}

function pushDbRef(
  refs: ComposeDbNameRef[],
  variable: string,
  service: string | undefined,
  source: ComposeDbNameRef["source"],
): void {
  refs.push({ variable, service, source });
}

function mergeContract(parts: ComposeContract[]): ComposeContract {
  const expectedVars = new Set<string>();
  const projectNameVars = new Set<string>();
  const warnings: string[] = [];
  const portRefs: ComposePortRef[] = [];
  const dbNameRefs: ComposeDbNameRef[] = [];

  for (const part of parts) {
    for (const variable of part.expectedVars) expectedVars.add(variable);
    for (const variable of part.projectNameVars) projectNameVars.add(variable);
    portRefs.push(...part.portRefs);
    dbNameRefs.push(...part.dbNameRefs);
    warnings.push(...part.warnings);
  }

  const dedupeKey = (v: {
    variable: string;
    service?: string;
    source: string;
  }) => `${v.variable}|${v.service ?? ""}|${v.source}`;

  return {
    expectedVars: uniqSorted(expectedVars),
    projectNameVars: uniqSorted(projectNameVars),
    portRefs: Object.values(
      Object.fromEntries(portRefs.map((ref) => [dedupeKey(ref), ref])),
    ),
    dbNameRefs: Object.values(
      Object.fromEntries(dbNameRefs.map((ref) => [dedupeKey(ref), ref])),
    ),
    warnings,
  };
}

export function discoverComposeContractFromText(raw: string): ComposeContract {
  const expectedVars = new Set<string>();
  const projectNameVars = new Set<string>();
  const portRefs: ComposePortRef[] = [];
  const dbNameRefs: ComposeDbNameRef[] = [];

  let currentService: string | undefined;
  let inPorts = false;
  let inEnvironment = false;

  const lines = raw.split("\n");

  for (const line of lines) {
    const serviceMatch = line.match(/^\s{2}([a-zA-Z0-9_.-]+):\s*$/);
    if (serviceMatch) {
      currentService = serviceMatch[1];
      inPorts = false;
      inEnvironment = false;
      continue;
    }

    if (/^\s{4}ports:\s*$/.test(line)) {
      inPorts = true;
      inEnvironment = false;
      continue;
    }

    if (/^\s{4}environment:\s*$/.test(line)) {
      inEnvironment = true;
      inPorts = false;
      continue;
    }

    if (/^\s{0,3}\S/.test(line)) {
      inPorts = false;
      inEnvironment = false;
    }

    const vars = extractInterpolationVars(line);
    for (const variable of vars) {
      expectedVars.add(variable);
      if (variable === "COMPOSE_PROJECT_NAME") {
        projectNameVars.add(variable);
      }
      if (inPorts || isPortLikeVar(variable)) {
        pushPortRef(portRefs, variable, currentService, "text-scan");
      }
      if (inEnvironment && isDbLikeVar(variable)) {
        pushDbRef(dbNameRefs, variable, currentService, "text-scan");
      }
      if (inEnvironment && isDbNameLikeVar(variable)) {
        pushDbRef(dbNameRefs, variable, currentService, "text-scan");
      }
    }

    if (inEnvironment) {
      const envKeyMatch = line.match(
        /^\s*(?:-\s*)?([A-Z][A-Z0-9_]+)\s*(?:=|:)/,
      );
      if (envKeyMatch && isDbNameLikeVar(envKeyMatch[1])) {
        expectedVars.add(envKeyMatch[1]);
        pushDbRef(dbNameRefs, envKeyMatch[1], currentService, "text-scan");
      }
    }

    if (/^\s*name:\s*\$\{/.test(line)) {
      for (const variable of vars) {
        if (variable === "COMPOSE_PROJECT_NAME") {
          projectNameVars.add(variable);
        }
      }
    }
  }

  return {
    expectedVars: uniqSorted(expectedVars),
    projectNameVars: uniqSorted(projectNameVars),
    portRefs,
    dbNameRefs,
    warnings: [],
  };
}

function discoverContractFromComposeModel(model: unknown): ComposeContract {
  const expectedVars = new Set<string>();
  const projectNameVars = new Set<string>();
  const portRefs: ComposePortRef[] = [];
  const dbNameRefs: ComposeDbNameRef[] = [];

  const typed = model as Record<string, unknown>;

  const maybeName = typed["name"];
  if (typeof maybeName === "string") {
    for (const variable of extractInterpolationVars(maybeName)) {
      expectedVars.add(variable);
      if (variable === "COMPOSE_PROJECT_NAME") projectNameVars.add(variable);
    }
  }

  const services = typed["services"] as Record<string, unknown> | undefined;
  if (!services || typeof services !== "object") {
    return {
      expectedVars: uniqSorted(expectedVars),
      portRefs,
      dbNameRefs,
      projectNameVars: uniqSorted(projectNameVars),
      warnings: [],
    };
  }

  for (const [serviceName, serviceConfigUnknown] of Object.entries(services)) {
    const serviceConfig = serviceConfigUnknown as Record<string, unknown>;

    const ports = serviceConfig["ports"] as unknown[] | undefined;
    if (Array.isArray(ports)) {
      for (const entry of ports) {
        if (typeof entry === "string") {
          for (const variable of extractInterpolationVars(entry)) {
            expectedVars.add(variable);
            pushPortRef(portRefs, variable, serviceName, "ports");
          }
        } else if (entry && typeof entry === "object") {
          const published = (entry as Record<string, unknown>)["published"];
          if (typeof published === "string") {
            for (const variable of extractInterpolationVars(published)) {
              expectedVars.add(variable);
              pushPortRef(portRefs, variable, serviceName, "ports");
            }
          }
        }
      }
    }

    const environment = serviceConfig["environment"];
    if (Array.isArray(environment)) {
      for (const item of environment) {
        if (typeof item !== "string") continue;
        const [key, ...rest] = item.split("=");
        const value = rest.join("=");
        if (key && isDbNameLikeVar(key)) {
          expectedVars.add(key);
          pushDbRef(dbNameRefs, key, serviceName, "environment");
        }
        for (const variable of extractInterpolationVars(value)) {
          expectedVars.add(variable);
          if (isDbNameLikeVar(variable) || isDbNameLikeVar(key)) {
            pushDbRef(dbNameRefs, variable, serviceName, "environment");
          }
        }
      }
    } else if (environment && typeof environment === "object") {
      for (const [key, value] of Object.entries(
        environment as Record<string, unknown>,
      )) {
        if (isDbNameLikeVar(key)) {
          expectedVars.add(key);
          pushDbRef(dbNameRefs, key, serviceName, "environment");
        }
        if (typeof value === "string") {
          for (const variable of extractInterpolationVars(value)) {
            expectedVars.add(variable);
            if (isDbNameLikeVar(variable) || isDbNameLikeVar(key)) {
              pushDbRef(dbNameRefs, variable, serviceName, "environment");
            }
          }
        }
      }
    }
  }

  return {
    expectedVars: uniqSorted(expectedVars),
    portRefs,
    dbNameRefs,
    projectNameVars: uniqSorted(projectNameVars),
    warnings: [],
  };
}

function parseVariablesOutput(raw: string): string[] {
  const vars = new Set<string>();
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^([A-Z][A-Z0-9_]+)/);
    if (match) vars.add(match[1]);
  }
  return [...vars];
}

async function runComposeConfigNoInterpolate(
  worktreePath: string,
): Promise<{ contract?: ComposeContract; warning?: string }> {
  try {
    const { stdout } = await execa(
      "docker",
      ["compose", "config", "--no-interpolate", "--format", "json"],
      {
        cwd: worktreePath,
      },
    );

    const parsed = JSON.parse(stdout) as unknown;
    return { contract: discoverContractFromComposeModel(parsed) };
  } catch (error) {
    return {
      warning: `docker compose config --no-interpolate unavailable: ${(error as Error).message}`,
    };
  }
}

async function runComposeVariables(
  worktreePath: string,
): Promise<{ expectedVars?: string[]; warning?: string }> {
  try {
    const { stdout } = await execa(
      "docker",
      ["compose", "config", "--variables"],
      {
        cwd: worktreePath,
      },
    );
    return { expectedVars: parseVariablesOutput(stdout) };
  } catch (error) {
    return {
      warning: `docker compose config --variables unavailable: ${(error as Error).message}`,
    };
  }
}

export async function discoverComposeContract(
  worktreePath: string,
): Promise<ComposeContract> {
  const warnings: string[] = [];

  const [modelResult, varsResult] = await Promise.all([
    runComposeConfigNoInterpolate(worktreePath),
    runComposeVariables(worktreePath),
  ]);

  if (modelResult.warning) warnings.push(modelResult.warning);
  if (varsResult.warning) warnings.push(varsResult.warning);

  const fileContracts: ComposeContract[] = [];
  for (const composeFile of COMPOSE_FILES) {
    const composePath = path.join(worktreePath, composeFile);
    if (!existsSync(composePath)) continue;
    const raw = await readFile(composePath, "utf-8");
    fileContracts.push(discoverComposeContractFromText(raw));
  }

  if (fileContracts.length === 0 && !modelResult.contract) {
    warnings.push("no compose files discovered for contract detection");
  }

  const merged = mergeContract([
    ...(modelResult.contract ? [modelResult.contract] : []),
    ...fileContracts,
    {
      expectedVars: varsResult.expectedVars ?? [],
      portRefs: (varsResult.expectedVars ?? [])
        .filter((v) => isPortLikeVar(v))
        .map((variable) => ({ variable, source: "variables" as const })),
      dbNameRefs: (varsResult.expectedVars ?? [])
        .filter((v) => isDbNameLikeVar(v) && !isPortLikeVar(v))
        .map((variable) => ({ variable, source: "variables" as const })),
      projectNameVars: (varsResult.expectedVars ?? []).includes(
        "COMPOSE_PROJECT_NAME",
      )
        ? ["COMPOSE_PROJECT_NAME"]
        : [],
      warnings: [],
    },
  ]);

  merged.warnings.push(...warnings);
  return merged;
}

function parseEnvContent(content: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx);
    const value = trimmed.slice(idx + 1);
    env[key] = value;
  }
  return env;
}

export async function readEnvFile(
  worktreePath: string,
): Promise<Record<string, string>> {
  const envPath = path.join(worktreePath, ".env.worktree");
  if (!existsSync(envPath)) return {};
  const raw = await readFile(envPath, "utf-8");
  return parseEnvContent(raw);
}

function mapPortVarToCanonical(
  variable: string,
): "WEB_PORT" | "API_PORT" | "DB_PORT" {
  const upper = variable.toUpperCase();
  if (
    /(DB|DATABASE|POSTGRES|PG).*PORT|PORT.*(DB|DATABASE|POSTGRES|PG)/.test(
      upper,
    )
  ) {
    return "DB_PORT";
  }
  if (
    /(API|BACKEND|SERVER|INTERNAL).*PORT|PORT.*(API|BACKEND|SERVER|INTERNAL)/.test(
      upper,
    )
  ) {
    return "API_PORT";
  }
  return "WEB_PORT";
}

function mapDbVarToCanonical(variable: string): "DB_SCHEMA" {
  return "DB_SCHEMA";
}

export function buildAliasMap(
  contract: ComposeContract,
  canonicalValues: Record<string, string>,
): Record<string, string> {
  const aliases: Record<string, string> = {};
  const hasCanonical = (key: string): boolean =>
    Object.prototype.hasOwnProperty.call(canonicalValues, key);

  for (const ref of contract.portRefs) {
    if (hasCanonical(ref.variable)) continue;
    const canonical = mapPortVarToCanonical(ref.variable);
    if (hasCanonical(canonical))
      aliases[ref.variable] = canonicalValues[canonical];
  }

  for (const ref of contract.dbNameRefs) {
    if (hasCanonical(ref.variable)) continue;
    const canonical = mapDbVarToCanonical(ref.variable);
    if (hasCanonical(canonical))
      aliases[ref.variable] = canonicalValues[canonical];
  }

  for (const variable of contract.projectNameVars) {
    if (variable === "COMPOSE_PROJECT_NAME" && canonicalValues[variable])
      continue;
    if (canonicalValues["COMPOSE_PROJECT_NAME"]) {
      aliases[variable] = canonicalValues["COMPOSE_PROJECT_NAME"];
    }
  }

  return Object.fromEntries(
    Object.entries(aliases).sort(([a], [b]) => a.localeCompare(b)),
  );
}

export function renderEnvContent(
  canonicalValues: Record<string, string>,
  aliasValues: Record<string, string>,
): string {
  const canonicalOrder = [
    "COMPOSE_PROJECT_NAME",
    "WEB_PORT",
    "API_PORT",
    "DB_PORT",
    "DB_SCHEMA",
    "SHARED_PROJECT_NAME",
  ];

  const lines: string[] = [];

  for (const key of canonicalOrder) {
    if (canonicalValues[key] !== undefined)
      lines.push(`${key}=${canonicalValues[key]}`);
  }

  for (const key of Object.keys(canonicalValues).sort((a, b) =>
    a.localeCompare(b),
  )) {
    if (canonicalOrder.includes(key)) continue;
    lines.push(`${key}=${canonicalValues[key]}`);
  }

  for (const key of Object.keys(aliasValues).sort((a, b) =>
    a.localeCompare(b),
  )) {
    if (canonicalValues[key] !== undefined) continue;
    lines.push(`${key}=${aliasValues[key]}`);
  }

  return lines.join("\n") + "\n";
}

function extractPublishedPortsFromDockerPs(rawPortsField: string): number[] {
  const values = new Set<number>();
  for (const match of rawPortsField.matchAll(PUBLISHED_PORT_RE)) {
    const port = Number.parseInt(match[1], 10);
    if (!Number.isNaN(port)) values.add(port);
  }
  return [...values];
}

async function getRunningDockerPublishedPorts(
  excludeProject?: string,
): Promise<Set<number>> {
  try {
    const { stdout } = await execa("docker", ["ps", "--format", "json"]);
    const ports = new Set<number>();

    for (const line of stdout.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let row: Record<string, unknown>;
      try {
        row = JSON.parse(trimmed) as Record<string, unknown>;
      } catch {
        continue;
      }

      const labels =
        typeof row["Labels"] === "string"
          ? row["Labels"]
          : typeof row["labels"] === "string"
            ? row["labels"]
            : "";

      if (
        excludeProject &&
        labels.includes(`com.docker.compose.project=${excludeProject}`)
      ) {
        continue;
      }

      const portsField =
        typeof row["Ports"] === "string"
          ? row["Ports"]
          : typeof row["ports"] === "string"
            ? row["ports"]
            : "";

      for (const port of extractPublishedPortsFromDockerPs(portsField)) {
        ports.add(port);
      }
    }

    return ports;
  } catch {
    return new Set<number>();
  }
}

function toPort(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }
  return null;
}

export function analyzeResolvedPorts(
  resolvedPublishedPorts: Array<{
    service: string;
    hostPort: number;
    targetPort?: number;
  }>,
  envVars: Record<string, string>,
  takenPorts: Set<number>,
): PreflightIssue[] {
  const issues: PreflightIssue[] = [];

  for (const port of resolvedPublishedPorts) {
    if (port.hostPort < 1 || port.hostPort > 65535) {
      issues.push({
        severity: "error",
        message: `Invalid published port for service ${port.service}: ${port.hostPort}`,
      });
      continue;
    }

    if (takenPorts.has(port.hostPort)) {
      issues.push({
        severity: "error",
        message: `Published port collision detected: ${port.hostPort}`,
        details: `Service ${port.service} resolves to host port ${port.hostPort}, already used by another running container.`,
        suggestion:
          "Adjust naming.ports or ensure the alias variable used by compose resolves to a unique host port.",
      });
    }
  }

  const defaultPorts = new Set([3000, 5432]);
  const canonicalPorts = new Set<number>();
  for (const key of ["WEB_PORT", "API_PORT", "DB_PORT"]) {
    const parsed = toPort(envVars[key]);
    if (parsed !== null) canonicalPorts.add(parsed);
  }

  for (const port of resolvedPublishedPorts) {
    if (!defaultPorts.has(port.hostPort)) continue;
    if (canonicalPorts.has(port.hostPort)) continue;
    issues.push({
      severity: "error",
      message: `Service ${port.service} resolved to default-looking host port ${port.hostPort}`,
      details:
        "This often means compose interpolated a fallback default instead of Grove-generated vars.",
      suggestion:
        "Add alias variable(s) in .env.worktree or map them via .grove/config.json naming.ports.",
    });
  }

  return issues;
}

export async function preflightComposeEnv(
  worktreePath: string,
  contract: ComposeContract,
  envVars: Record<string, string>,
): Promise<PreflightResult> {
  const issues: PreflightIssue[] = [];
  const projectName = envVars["COMPOSE_PROJECT_NAME"];
  const hasEnvVar = (key: string): boolean =>
    Object.prototype.hasOwnProperty.call(envVars, key);

  const requiredVars = new Set<string>([
    ...contract.expectedVars,
    ...contract.portRefs.map((r) => r.variable),
    ...contract.dbNameRefs.map((r) => r.variable),
    ...contract.projectNameVars,
  ]);

  for (const variable of requiredVars) {
    if (!hasEnvVar(variable)) {
      issues.push({
        severity: "error",
        message: `Missing required compose variable: ${variable}`,
        suggestion:
          "Add alias in .env.worktree or update .grove/config.json naming.ports to cover this variable.",
      });
    }
  }

  let model: Record<string, unknown> | null = null;
  try {
    const args = [
      "compose",
      "--env-file",
      ".env.worktree",
      "config",
      "--format",
      "json",
    ];
    const { stdout } = await execa("docker", args, { cwd: worktreePath });
    model = JSON.parse(stdout) as Record<string, unknown>;
  } catch (error) {
    const message = (error as Error).message;
    if (/ENOENT|not found|executable file/i.test(message)) {
      issues.push({
        severity: "warning",
        message: "Compose preflight skipped because Docker CLI is unavailable",
        details: message,
      });
      return {
        ok: !issues.some((i) => i.severity === "error"),
        issues,
        resolvedPublishedPorts: [],
      };
    }

    issues.push({
      severity: "error",
      message: "Compose preflight failed while resolving config",
      details: message,
      suggestion:
        "Run `docker compose --env-file .env.worktree config` to inspect interpolation issues.",
    });
    return { ok: false, issues, resolvedPublishedPorts: [] };
  }

  const services =
    (model["services"] as Record<string, unknown> | undefined) ?? {};
  const resolvedPublishedPorts: Array<{
    service: string;
    hostPort: number;
    targetPort?: number;
  }> = [];

  for (const [serviceName, serviceCfgUnknown] of Object.entries(services)) {
    const serviceCfg = serviceCfgUnknown as Record<string, unknown>;
    const ports = serviceCfg["ports"];
    if (!Array.isArray(ports)) continue;

    for (const entry of ports) {
      if (typeof entry === "string") {
        const match = entry.match(
          /^(?:[^:]+:)?(\d{2,5}):(\d{2,5})(?:\/(?:tcp|udp))?$/,
        );
        if (!match) continue;
        const hostPort = Number.parseInt(match[1], 10);
        const targetPort = Number.parseInt(match[2], 10);
        resolvedPublishedPorts.push({
          service: serviceName,
          hostPort,
          targetPort,
        });
      } else if (entry && typeof entry === "object") {
        const published = toPort(
          (entry as Record<string, unknown>)["published"],
        );
        const target = toPort((entry as Record<string, unknown>)["target"]);
        if (published === null) continue;
        resolvedPublishedPorts.push({
          service: serviceName,
          hostPort: published,
          targetPort: target ?? undefined,
        });
      }
    }
  }

  const takenPorts = await getRunningDockerPublishedPorts(projectName);
  issues.push(
    ...analyzeResolvedPorts(resolvedPublishedPorts, envVars, takenPorts),
  );

  return {
    ok: !issues.some((i) => i.severity === "error"),
    issues,
    resolvedPublishedPorts,
  };
}

export function formatDoctorEnvReport(
  contract: ComposeContract,
  envVars: Record<string, string>,
  preflight: PreflightResult,
): string {
  const missingVars = contract.expectedVars.filter(
    (v) => !Object.prototype.hasOwnProperty.call(envVars, v),
  );

  const lines: string[] = [];
  lines.push("Compose expected vars:");
  lines.push(
    contract.expectedVars.length > 0
      ? `  ${contract.expectedVars.join(", ")}`
      : "  (none discovered)",
  );

  lines.push("Vars present in .env.worktree:");
  lines.push(
    Object.keys(envVars).length > 0
      ? `  ${Object.keys(envVars)
          .sort((a, b) => a.localeCompare(b))
          .join(", ")}`
      : "  (file missing or empty)",
  );

  lines.push("Missing vars:");
  lines.push(
    missingVars.length > 0 ? `  ${missingVars.join(", ")}` : "  (none)",
  );

  lines.push("Resolved published host ports:");
  if (preflight.resolvedPublishedPorts.length === 0) {
    lines.push("  (none)");
  } else {
    for (const item of preflight.resolvedPublishedPorts) {
      const target = item.targetPort ? ` -> ${item.targetPort}` : "";
      lines.push(`  ${item.service}: ${item.hostPort}${target}`);
    }
  }

  if (contract.warnings.length > 0) {
    lines.push("Contract warnings:");
    for (const warning of contract.warnings) {
      lines.push(`  - ${warning}`);
    }
  }

  return lines.join("\n");
}
