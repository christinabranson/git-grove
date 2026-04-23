import React from "react";
import { Box, Text } from "ink";
import type { Worktree } from "../types.js";

function PRLabel({ worktree }: { worktree: Worktree }) {
  if (!worktree.pr) return null;
  const { number, url } = worktree.pr;
  return (
    <Text color="cyan">{` \x1b]8;;${url}\x07PR #${number}\x1b]8;;\x07`}</Text>
  );
}

function ChangesLabel({ worktree }: { worktree: Worktree }) {
  if (!worktree.changeFootprint) return <Text color="gray"> clean</Text>;
  const n = worktree.changeFootprint.totalFiles;
  return <Text color="yellow"> +{n}</Text>;
}

interface WorktreeRowProps {
  worktree: Worktree;
  isSelected: boolean;
  width: number;
}

function WorktreeRow({ worktree, isSelected, width }: WorktreeRowProps) {
  const prefix = isSelected ? "▶ " : "  ";

  const displayName = worktree.isMain ? "primary" : worktree.branch;
  const displayColor = worktree.isMain ? "green" : "white";

  const maxNameLen = width - 18;
  const name =
    displayName.length > maxNameLen
      ? displayName.slice(0, maxNameLen - 1) + "…"
      : displayName.padEnd(maxNameLen);

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold={isSelected} color={isSelected ? "cyan" : undefined}>
          {prefix}
        </Text>
        <Text color={displayColor} bold={isSelected}>
          {name}
        </Text>
        <Text> </Text>
        <PRLabel worktree={worktree} />
        <ChangesLabel worktree={worktree} />
      </Box>
      {worktree.isMain && (
        <Text color="gray" dimColor>
          {"     "}
          {worktree.branch}
        </Text>
      )}
      {worktree.baseBranch && !worktree.isMain && (
        <Text color="gray" dimColor>
          {"     "}off {worktree.baseBranch}
        </Text>
      )}
    </Box>
  );
}

interface WorktreeListProps {
  worktrees: Worktree[];
  selectedIndex: number;
  width: number;
  height: number;
}

export function WorktreeList({
  worktrees,
  selectedIndex,
  width,
  height,
}: WorktreeListProps) {
  // Compute scroll window
  const visibleCount = height - 2; // account for border
  const start = Math.max(0, selectedIndex - Math.floor(visibleCount / 2));
  const end = Math.min(worktrees.length, start + visibleCount);
  const visible = worktrees.slice(start, end);

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      borderStyle="single"
      borderColor="gray"
    >
      <Box paddingX={1}>
        <Text bold color="gray">
          worktrees
        </Text>
      </Box>
      {visible.map((wt, idx) => (
        <WorktreeRow
          key={wt.path}
          worktree={wt}
          isSelected={start + idx === selectedIndex}
          width={width - 2}
        />
      ))}
    </Box>
  );
}
