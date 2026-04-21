import React from 'react';
import { Box, Text } from 'ink';
import type { ChangeFootprint } from '../types.js';

interface ChangeFootprintProps {
  footprint: ChangeFootprint;
  expanded: boolean;
  width: number;
}

export function ChangeFootprintPanel({ footprint, expanded, width }: ChangeFootprintProps) {
  const dirs = Object.entries(footprint.byDir);

  return (
    <Box flexDirection="column" width={width}>
      {dirs.map(([dir, files]) => (
        <Box key={dir} flexDirection="column">
          <Text color="yellow">{dir}/</Text>
          {expanded
            ? files.map((f) => {
                const fileName = f.path.split('/').pop() ?? f.path;
                const additions = f.added > 0 ? <Text color="green">+{f.added}</Text> : null;
                const deletions = f.removed > 0 ? <Text color="red"> -{f.removed}</Text> : null;
                return (
                  <Box key={f.path}>
                    <Text>  {fileName.padEnd(32)}</Text>
                    {additions}
                    {deletions}
                  </Box>
                );
              })
            : (() => {
                const names = files.map((f) => f.path.split('/').pop()).join('  ');
                return (
                  <Text key={dir + '-files'} color="gray">
                    {'  '}
                    {names}
                  </Text>
                );
              })()}
        </Box>
      ))}
    </Box>
  );
}

interface CompactFootprintProps {
  footprint: ChangeFootprint;
  width: number;
}

export function CompactFootprint({ footprint, width }: CompactFootprintProps) {
  const dirs = Object.entries(footprint.byDir);

  return (
    <Box flexDirection="column" width={width} borderStyle="single" borderColor="gray">
      <Box paddingX={1}>
        <Text bold color="gray">change footprint</Text>
      </Box>
      {dirs.map(([dir, files]) => (
        <Box key={dir}>
          <Text color="yellow">{(' ' + dir + '/').padEnd(16)}</Text>
          <Text color="gray">+{files.reduce((s, f) => s + f.added, 0)}</Text>
        </Box>
      ))}
    </Box>
  );
}
