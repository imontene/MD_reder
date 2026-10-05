import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // PDF tests start a browser each; on busy Windows runners that alone can take 10+ seconds.
    testTimeout: 60_000,
    hookTimeout: 60_000,
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
