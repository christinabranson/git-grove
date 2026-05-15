import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react({ jsxRuntime: "classic" })],
  test: {
    globals: true,
    environment: "node",
    exclude: [...configDefaults.exclude, "tests/e2e/**"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/index.ts", "src/**/*.test.{ts,tsx}"],
      reporter: ["text", "html", "lcov"],
      thresholds: {
        lines: 63,
        functions: 77,
        branches: 78,
      },
    },
  },
});
