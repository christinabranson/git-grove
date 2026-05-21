import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import os from "os";
import { createHash } from "crypto";
import { execa } from "execa";
import type { GroveConfig } from "../types.js";
import { validateConfigKey, validateConfigValue } from "./configSchema.js";

export function getGroveHome(): string {
  return process.env.GROVE_HOME ?? path.join(os.homedir(), ".grove");
}

function normalizeRemoteUrl(url: string): string {
  return url
    .trim()
    .replace(/\.git$/, "")
    .replace(/^https?:\/\//, "")
    .replace(/^git@/, "")
    .replace(/:/g, "-")
    .replace(/\//g, "-")
    .replace(/[^a-z0-9.-]/gi, "-")
    .toLowerCase()
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export async function getRepoId(repoPath: string): Promise<string> {
  try {
    const { stdout } = await execa("git", ["remote", "get-url", "origin"], {
      cwd: repoPath,
    });
    const normalized = normalizeRemoteUrl(stdout);
    if (normalized) return normalized;
  } catch {
    // no remote — fall through to hash
  }
  return createHash("sha256")
    .update(path.resolve(repoPath))
    .digest("hex")
    .slice(0, 16);
}

export function getRepoConfigPath(repoId: string): string {
  return path.join(getGroveHome(), "repos", repoId, "config.json");
}

export function getRepoConfigDir(repoId: string): string {
  return path.join(getGroveHome(), "repos", repoId);
}

async function readRawConfig(
  configPath: string,
): Promise<Record<string, unknown> | null> {
  if (!existsSync(configPath)) return null;
  try {
    const raw = await readFile(configPath, "utf-8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function loadUserRepoConfig(
  repoPath: string,
): Promise<GroveConfig | null> {
  const repoId = await getRepoId(repoPath);
  const configPath = getRepoConfigPath(repoId);
  const config = await readRawConfig(configPath);
  if (!config) return null;
  if (!config.enabled) return null;
  return config as unknown as GroveConfig;
}

export async function saveUserRepoConfig(
  repoPath: string,
  config: GroveConfig,
): Promise<{ repoId: string; configPath: string }> {
  const repoId = await getRepoId(repoPath);
  const configPath = getRepoConfigPath(repoId);
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
  return { repoId, configPath };
}

export function getNestedValue(
  obj: Record<string, unknown>,
  keyPath: string,
): unknown {
  const keys = keyPath.split(".");
  let current: unknown = obj;
  for (const key of keys) {
    if (
      current == null ||
      typeof current !== "object" ||
      Array.isArray(current)
    )
      return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

export function setNestedValue(
  obj: Record<string, unknown>,
  keyPath: string,
  value: unknown,
): void {
  const keys = keyPath.split(".");
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (
      current[key] == null ||
      typeof current[key] !== "object" ||
      Array.isArray(current[key])
    ) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[keys[keys.length - 1]] = value;
}

export function coerceValue(value: string): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  const num = Number(value);
  if (value !== "" && !isNaN(num)) return num;
  if (value.startsWith("[") || value.startsWith("{")) {
    try {
      return JSON.parse(value);
    } catch {}
  }
  return value;
}

export function flattenConfig(
  obj: Record<string, unknown>,
  prefix = "",
): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      entries.push(...flattenConfig(value as Record<string, unknown>, fullKey));
    } else {
      entries.push([fullKey, JSON.stringify(value)]);
    }
  }
  return entries;
}

export async function getConfigValue(
  repoPath: string,
  keyPath: string,
): Promise<unknown> {
  const repoId = await getRepoId(repoPath);
  const configPath = getRepoConfigPath(repoId);
  const config = await readRawConfig(configPath);
  if (!config) return undefined;
  return getNestedValue(config, keyPath);
}

export async function setConfigValue(
  repoPath: string,
  keyPath: string,
  rawValue: string,
): Promise<{ repoId: string; configPath: string }> {
  const keyError = validateConfigKey(keyPath);
  if (keyError) throw new Error(keyError);
  const coerced = coerceValue(rawValue);
  const valueError = validateConfigValue(keyPath, coerced);
  if (valueError) throw new Error(valueError);

  const repoId = await getRepoId(repoPath);
  const configPath = getRepoConfigPath(repoId);
  const existing = await readRawConfig(configPath);
  const config: Record<string, unknown> = existing ?? {};
  setNestedValue(config, keyPath, coerced);
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
  return { repoId, configPath };
}
