import React from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";

interface FilterBarProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onEscape: () => void;
}

export function FilterBar({ value, onChange, onSubmit }: FilterBarProps) {
  return (
    <Box paddingX={1}>
      <Text color="cyan">/ </Text>
      <TextInput
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
        placeholder="filter by branch, status..."
      />
      <Text color="gray"> (Esc to clear)</Text>
    </Box>
  );
}
