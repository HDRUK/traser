import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Integration tests hit a running dev server — slow on cold start
    testTimeout: 30_000,
    // Don't mix with React Router's own vite.config or Tailwind plugin
    include: ["tests/**/*.test.ts"],
    pool: "forks",
    // Run once before any test workers start — fails fast if the server is down
    globalSetup: ["./tests/global-setup.ts"],
  },
});
