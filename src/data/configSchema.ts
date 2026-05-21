export type ConfigValueType =
  | "string"
  | "boolean"
  | "number"
  | "number-or-auto"
  | "json-array"
  | { enum: readonly string[] };

export interface ConfigKeyDef {
  type: ConfigValueType;
  description: string;
  default?: string;
}

export interface ConfigSection {
  label: string;
  note?: string;
  keys: Record<string, ConfigKeyDef>;
}

export const CONFIG_SECTIONS: ConfigSection[] = [
  {
    label: "Core",
    keys: {
      enabled: {
        type: "boolean",
        description: "Enable or disable Grove for this repo",
        default: "true",
      },
      project: {
        type: "string",
        description: "Project name used in naming templates",
      },
      editor: {
        type: "string",
        description:
          'Editor command for opening worktrees (e.g. "code", "cursor")',
      },
      sharedComposeFile: {
        type: "string",
        description: "Path to shared infrastructure compose file",
        default: '"compose.shared.yaml"',
      },
    },
  },
  {
    label: "providers.<name>",
    note: 'Use "web" or "api" for <name> (e.g. providers.web.type)',
    keys: {
      "providers.<name>.type": {
        type: { enum: ["docker-compose", "node-scripts", "custom-shell"] },
        description: "Provider type",
      },
      "providers.<name>.service": {
        type: "string",
        description: "Compose service name (docker-compose)",
      },
      "providers.<name>.command": {
        type: "string",
        description: "npm script to run (node-scripts)",
      },
      "providers.<name>.script": {
        type: "string",
        description:
          "Startup script path relative to worktree root (custom-shell)",
      },
      "providers.<name>.stopScript": {
        type: "string",
        description:
          "Teardown script path (custom-shell; falls back to docker compose down)",
      },
    },
  },
  {
    label: "naming",
    note: "Template variables: ${project}, ${branch}, ${branch_safe}",
    keys: {
      "naming.composeProject": {
        type: "string",
        description: "Compose -p value",
        default: '"${project}-${branch_safe}"',
      },
      "naming.sharedProject": {
        type: "string",
        description: "Shared stack compose -p value",
      },
      "naming.dbSchema": {
        type: "string",
        description: "DB schema name",
        default: '"${project}_${branch_safe}"',
      },
      "naming.webPort": {
        type: "number-or-auto",
        description: "Web host port",
        default: "auto",
      },
      "naming.apiPort": {
        type: "number-or-auto",
        description: "API host port",
        default: "auto",
      },
      "naming.dbPort": {
        type: "number-or-auto",
        description: "DB host port",
        default: "auto",
      },
      "naming.ports.<name>": {
        type: "number-or-auto",
        description:
          "Named host port emitted into .env.worktree (e.g. naming.ports.REDIS_PORT)",
      },
    },
  },
  {
    label: "worktrees",
    keys: {
      "worktrees.prefix": {
        type: "string",
        description: "Directory prefix for new worktrees",
      },
      "worktrees.defaultBaseBranch": {
        type: "string",
        description: "Base branch for `grove start --new`",
        default: '"main"',
      },
      "worktrees.root": {
        type: "string",
        description: "Absolute path override for worktree placement",
      },
    },
  },
  {
    label: "envContract",
    keys: {
      "envContract.strict": {
        type: "boolean",
        description: "Fail when required vars can't be resolved",
      },
      "envContract.required": {
        type: "json-array",
        description: "Vars that must be present after rendering",
      },
      "envContract.passthrough": {
        type: "json-array",
        description: "Vars copied from source env files",
      },
      "envContract.managed": {
        type: "json-array",
        description: "Vars Grove sets explicitly",
      },
      "envContract.sourceEnvFiles": {
        type: "json-array",
        description: "Source env files for passthrough lookups",
        default: '[".env.example", ".env"]',
      },
    },
  },
];

function patternMatches(keyPath: string, pattern: string): boolean {
  const pp = pattern.split(".");
  const kp = keyPath.split(".");
  if (pp.length !== kp.length) return false;
  return pp.every(
    (part, i) => (part.startsWith("<") && part.endsWith(">")) || part === kp[i],
  );
}

function findDef(keyPath: string): ConfigKeyDef | undefined {
  for (const section of CONFIG_SECTIONS) {
    for (const [pattern, def] of Object.entries(section.keys)) {
      if (patternMatches(keyPath, pattern)) return def;
    }
  }
  return undefined;
}

export function validateConfigKey(keyPath: string): string | null {
  if (!findDef(keyPath)) {
    return `Unknown config key: "${keyPath}"\nRun \`grove config set --help\` to see available keys.`;
  }
  return null;
}

export function validateConfigValue(
  keyPath: string,
  value: unknown,
): string | null {
  const def = findDef(keyPath);
  if (!def) return null;
  const { type } = def;

  if (type === "boolean" && typeof value !== "boolean") {
    return `"${keyPath}" must be true or false`;
  }
  if (type === "number" && typeof value !== "number") {
    return `"${keyPath}" must be a number`;
  }
  if (
    type === "number-or-auto" &&
    value !== "auto" &&
    typeof value !== "number"
  ) {
    return `"${keyPath}" must be a number or "auto"`;
  }
  if (type === "json-array" && !Array.isArray(value)) {
    return `"${keyPath}" must be a JSON array, e.g. '["a","b"]'`;
  }
  if (
    typeof type === "object" &&
    "enum" in type &&
    !type.enum.includes(value as string)
  ) {
    return `"${keyPath}" must be one of: ${type.enum.join(", ")}`;
  }
  return null;
}

export function formatConfigHelp(): string {
  const lines: string[] = ["", "Available keys:"];
  for (const section of CONFIG_SECTIONS) {
    lines.push("");
    const header = section.note
      ? `  ${section.label}  — ${section.note}`
      : `  ${section.label}`;
    lines.push(header);
    const maxLen = Math.max(...Object.keys(section.keys).map((k) => k.length));
    for (const [key, def] of Object.entries(section.keys)) {
      const typeLabel =
        typeof def.type === "object" && "enum" in def.type
          ? def.type.enum.join(" | ")
          : def.type;
      const defaultPart = def.default ? `  (default: ${def.default})` : "";
      lines.push(
        `    ${key.padEnd(maxLen + 2)}${def.description}  [${typeLabel}]${defaultPart}`,
      );
    }
  }
  lines.push("");
  return lines.join("\n");
}
