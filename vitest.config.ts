import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // PDF tests start a browser each; on busy Windows runners that alone can take 10+ seconds.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Each test file starts its own browser. On the 4-core Windows CI runners, several Chrome
    // instances starting at once can stall past the timeout: run at most two files at a time.
    maxWorkers: process.platform === "win32" && process.env.CI === "true" ? 2 : undefined,
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
