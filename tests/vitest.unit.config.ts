import { defineConfig } from "vitest/config";

// Pure unit tests — import server modules directly, no running dev server.
// (The integration suite in vitest.config.ts uses a global-setup that requires
// `npm run dev` on :3001; these must NOT depend on that.)
export default defineConfig({
  test: {
    include: ["tests/unit/**/*.unit.test.ts"],
    pool: "forks",
    testTimeout: 15_000,
  },
});
