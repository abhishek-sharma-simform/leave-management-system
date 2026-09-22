import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // All integration tests share one Postgres DB and truncate it between
    // tests — running test files concurrently would race on the same tables.
    fileParallelism: false,
    testTimeout: 10000,
    hookTimeout: 10000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
    },
  },
});
