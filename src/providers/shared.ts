import { execa } from 'execa';
import { existsSync } from 'fs';
import path from 'path';
import type { GroveConfig } from '../types.js';

export const DEFAULT_SHARED_COMPOSE_FILE = 'compose.shared.yaml';

export interface SharedStackInfo {
  projectName: string;
  composeFile: string;
  composeFilePath: string;
  exists: boolean;
  state: 'running' | 'partial' | 'stopped' | 'not started';
}

/**
 * Resolve shared stack configuration.
 * Returns null if the repo has no shared stack (no sharedProject configured
 * and no compose.shared.yaml present).
 */
export function resolveSharedStack(
  repoPath: string,
  config: GroveConfig | null,
): SharedStackInfo | null {
  const projectName = config?.naming?.sharedProject;
  if (!projectName) return null;

  const composeFile = config?.sharedComposeFile ?? DEFAULT_SHARED_COMPOSE_FILE;
  const composeFilePath = path.isAbsolute(composeFile)
    ? composeFile
    : path.join(repoPath, composeFile);

  return {
    projectName,
    composeFile,
    composeFilePath,
    exists: existsSync(composeFilePath),
    state: 'not started', // populated by getSharedStackState
  };
}

export async function getSharedStackState(
  info: SharedStackInfo,
): Promise<'running' | 'partial' | 'stopped' | 'not started'> {
  if (!info.exists) return 'not started';
  try {
    const { stdout } = await execa('docker', [
      'compose', '-p', info.projectName, 'ps', '--format', 'json',
    ]);
    const containers = stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);

    if (containers.length === 0) return 'not started';
    const running = containers.filter((c: Record<string, unknown>) => c['State'] === 'running').length;
    if (running === containers.length) return 'running';
    if (running > 0) return 'partial';
    return 'stopped';
  } catch {
    return 'not started';
  }
}

export async function sharedUp(
  info: SharedStackInfo,
  repoPath: string,
): Promise<void> {
  await execa(
    'docker',
    ['compose', '-f', info.composeFile, '-p', info.projectName, 'up', '-d'],
    { cwd: repoPath },
  );
}

export async function sharedDown(
  info: SharedStackInfo,
  repoPath: string,
): Promise<void> {
  await execa(
    'docker',
    ['compose', '-f', info.composeFile, '-p', info.projectName, 'down'],
    { cwd: repoPath },
  );
}
