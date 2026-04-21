import React from 'react';
import { Box, Text } from 'ink';
import type { Worktree } from '../types.js';

interface KeybindBarProps {
  worktree: Worktree | null;
}

interface Key {
  key: string;
  label: string;
}

export function KeybindBar({ worktree }: KeybindBarProps) {
  const keys: Key[] = [
    { key: 's', label: 'sync' },
    { key: '?', label: 'help' },
    { key: 'q', label: 'quit' },
  ];

  if (worktree) {
    keys.unshift(
      { key: 'o', label: 'open' },
    );

    if (!worktree.isMain) {
      keys.splice(-1, 0, { key: 'D', label: 'delete' });
    }

    if (worktree.docker) {
      const isRunning = worktree.docker.state === 'running';
      if (isRunning) {
        keys.splice(2, 0, { key: 'd', label: 'docker down' });
      } else {
        keys.splice(2, 0, { key: 'u', label: 'docker up' });
      }
    }

    if (worktree.changeFootprint) {
      keys.splice(-1, 0, { key: 'x', label: 'expand changes' });
    }
  }

  return (
    <Box flexWrap="wrap" paddingX={1}>
      {keys.map((k, i) => (
        <Box key={k.key} marginRight={2}>
          <Text>
            <Text color="white" bold>[ </Text>
            <Text color="cyan">{k.key}</Text>
            <Text color="white" bold> ] </Text>
            <Text color="gray">{k.label}</Text>
          </Text>
        </Box>
      ))}
    </Box>
  );
}
