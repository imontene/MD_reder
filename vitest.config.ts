import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 20_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // Entry point and type declarations have no logic to cover.
      exclude: ["src/bin.ts", "src/index.ts", "src/types/**"],
      reporter: ["text-summary", "text", "html"],
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 70 },
    },
  },
});
