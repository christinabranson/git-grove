import type { GroveConfig } from "../types.js";
import type { ProjectDetection } from "./detect.js";

export type PresetName = "docker" | "vite" | "node";

export interface Preset {
  name: PresetName;
  description: string;
  /**
   * Generate a Grove config from a preset.
   * Detection results are passed in so the preset can tailor provider entries
   * to the actual services found (e.g. only include "api" if compose has an api service).
   */
  generate(detection: ProjectDetection): GroveConfig;
}

export const presets: Record<PresetName, Preset> = {
  docker: {
    name: "docker",
    description:
      "Docker Compose project with per-worktree stacks and optional shared infrastructure",
    generate(detection): GroveConfig {
      // Build provider entries for each non-shared app service found.
      // Fall back to a generic "web" entry if nothing was detected.
      const appServices =
        detection.appServices.length > 0 ? detection.appServices : ["web"];

      const providers: GroveConfig["providers"] = {};
      for (const svc of appServices) {
        providers[svc] = { type: "docker-compose", service: svc };
      }

      const shared: Record<string, boolean> = {};
      for (const svc of detection.sharedServices) {
        shared[svc] = true;
      }

      return {
        enabled: true,
        project: detection.projectName,
        providers,
        ...(Object.keys(shared).length > 0 ? { shared } : {}),
        naming: {
          composeProject: "grove-${branch_safe}",
          dbSchema: "${project}_${branch_safe}",
          ports: {
            WEB_PORT: "auto",
            API_PORT: "auto",
            DB_PORT: "auto",
          },
          dbPort: "auto",
          webPort: "auto",
          apiPort: "auto",
        },
        worktrees: { prefix: "grove" },
      };
    },
  },

  vite: {
    name: "vite",
    description:
      "Vite-based frontend project (Vue, React, Svelte, etc.) — npm run dev per worktree",
    generate(detection): GroveConfig {
      return {
        enabled: true,
        project: detection.projectName,
        providers: {
          web: { type: "node-scripts", command: "dev" },
        },
        naming: {
          webPort: "auto",
        },
        worktrees: { prefix: "grove" },
      };
    },
  },

  node: {
    name: "node",
    description: "Node.js project — runs npm run dev or npm start per worktree",
    generate(detection): GroveConfig {
      return {
        enabled: true,
        project: detection.projectName,
        providers: {
          web: { type: "node-scripts", command: "dev" },
        },
        naming: {
          webPort: "auto",
        },
        worktrees: { prefix: "grove" },
      };
    },
  },
};

/**
 * Choose the most appropriate preset for a detected project.
 * This is the auto-detect path used when --preset is not specified.
 */
export function recommendPreset(detection: ProjectDetection): PresetName {
  if (detection.hasDockerCompose) return "docker";
  if (detection.framework === "vite") return "vite";
  if (detection.hasPackageJson) return "node";
  return "node"; // least invasive fallback
}
