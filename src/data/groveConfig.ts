import type { GroveConfig } from "../types.js";
import { loadUserRepoConfig } from "./userConfig.js";

export async function loadGroveConfig(
  basePath: string,
): Promise<GroveConfig | null> {
  return loadUserRepoConfig(basePath);
}
