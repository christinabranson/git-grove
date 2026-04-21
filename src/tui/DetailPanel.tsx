import React from 'react';
import { Box, Text } from 'ink';
import type { Worktree, DockerState } from '../types.js';
import { ChangeFootprintPanel } from './ChangeFootprint.js';

const DOCKER_COLORS: Record<DockerState, string> = {
  running:       'green',
  partial:       'yellow',
  stopped:       'gray',
  'not started': 'gray',
};

function DockerSection({ worktree }: { worktree: Worktree }) {
  const docker = worktree.docker;
  if (!docker) return null;

  const color = DOCKER_COLORS[docker.state];
  const dot = docker.state === 'running' ? '●' : docker.state === 'partial' ? '◐' : '■';

  return (
    <Box flexDirection="column" marginTop={1} paddingX={1}>
      <Text bold color="gray">docker</Text>
      <Box>
        <Text color={color}>{dot} {docker.state}</Text>
      </Box>
      <Box flexDirection="column">
        {docker.webPort && (
          <Text color="cyan">  http://localhost:{docker.webPort}</Text>
        )}
        {docker.localstackPort && (
          <Text color="cyan">  http://localhost:{docker.localstackPort}</Text>
        )}
      </Box>
      {docker.dbSchema && <Text color="gray">  schema: {docker.dbSchema}</Text>}
      {docker.redisDb && <Text color="gray">  redis db: {docker.redisDb}</Text>}
    </Box>
  );
}

function PRSection({ worktree }: { worktree: Worktree }) {
  const pr = worktree.pr;
  if (!pr) return null;

  return (
    <Box flexDirection="column" marginTop={1} paddingX={1}>
      <Text bold color="gray">pull request</Text>
      <Text color="cyan">{`\x1b]8;;${pr.url}\x07PR #${pr.number}\x1b]8;;\x07`}</Text>
      <Text color="white">{pr.title}</Text>
      {pr.approvals > 0 && <Text color="green">✓ {pr.approvals} approval{pr.approvals !== 1 ? 's' : ''}</Text>}
      {pr.reviewRequested && <Text color="yellow">review requested</Text>}
    </Box>
  );
}

interface DetailPanelProps {
  worktree: Worktree | null;
  width: number;
  height: number;
  footprintExpanded: boolean;
}

export function DetailPanel({ worktree, width, height, footprintExpanded }: DetailPanelProps) {
  if (!worktree) {
    return (
      <Box
        width={width}
        height={height}
        borderStyle="single"
        borderColor="gray"
        justifyContent="center"
        alignItems="center"
      >
        <Text color="gray">select a worktree</Text>
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      borderStyle="single"
      borderColor="gray"
    >
      <Box paddingX={1} flexDirection="column">
        <Box>
          <Text bold color="cyan">{worktree.branch}</Text>
          {worktree.isMain && <Text color="gray"> (main)</Text>}
        </Box>
        {worktree.baseBranch && !worktree.isMain && (
          <Text color="gray" dimColor>  off {worktree.baseBranch}</Text>
        )}
      </Box>

      <DockerSection worktree={worktree} />
      <PRSection worktree={worktree} />

      {worktree.changeFootprint && (
        <Box flexDirection="column" marginTop={1} paddingX={1}>
          <Text bold color="gray">
            changes
            <Text color="gray" dimColor> (x to expand)</Text>
          </Text>
          <ChangeFootprintPanel
            footprint={worktree.changeFootprint}
            expanded={footprintExpanded}
            width={width - 4}
          />
        </Box>
      )}
    </Box>
  );
}
