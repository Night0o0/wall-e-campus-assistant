import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // The suite is deliberately database-free: the repositories are replaced by
    // in-memory doubles that subclass the real ones, so a method the doubles
    // forget to override fails loudly instead of quietly hitting Postgres.
    globals: false,
  },
});
