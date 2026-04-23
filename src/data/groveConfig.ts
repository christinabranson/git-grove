import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import type { GroveConfig } from "../types.js";

/**
 * Load .grove/config.json from a worktree or repo root.
 * Returns null if the file does not exist or cannot be parsed.
 * Projects must function normally without this file present.
 */
export async function loadGroveConfig(
  basePath: string,
): Promise<GroveConfig | null> {
  const configPath = path.join(basePath, ".grove", "config.json");
  if (!existsSync(configPath)) return null;

  try {
    const raw = await readFile(configPath, "utf-8");
    const config = JSON.parse(raw) as GroveConfig;
    if (!config.enabled) return null;
    return config;
  } catch {
    return null;
  }
}
