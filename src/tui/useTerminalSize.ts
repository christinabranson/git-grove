import { useState, useEffect } from 'react';

interface Size {
  columns: number;
  rows: number;
}

export function useTerminalSize(): Size {
  const [size, setSize] = useState<Size>({
    columns: process.stdout.columns ?? 120,
    rows: process.stdout.rows ?? 40,
  });

  useEffect(() => {
    const handler = () => {
      setSize({
        columns: process.stdout.columns ?? 120,
        rows: process.stdout.rows ?? 40,
      });
    };
    process.stdout.on('resize', handler);
    return () => {
      process.stdout.off('resize', handler);
    };
  }, []);

  return size;
}
