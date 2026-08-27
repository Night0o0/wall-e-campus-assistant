import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],

    // Backstop against the suite reaching a real service. See the file header:
    // this exists because unit tests once created live Supabase identities.
    setupFiles: ["tests/setup/no-network.ts"],
    // The suite is deliberately database-free: the repositories are replaced by
    // in-memory doubles that subclass the real ones, so a method the doubles
    // forget to override fails loudly instead of quietly hitting Postgres.
    globals: false,

    // Hermetic by default. The suite reads src/config/env.ts, which loads the
    // developer's .env — so before this was pinned, flipping AUTH_PROVIDER to
    // "supabase" locally made unit tests provision REAL identities against the
    // live Supabase project. dotenv does not overwrite an existing process.env
    // value, so setting it here wins over .env.
    //
    // A test that wants the Supabase branch must opt in explicitly AND mock the
    // admin client - see tests/campus-accounts.service.test.ts.
    env: {
      AUTH_PROVIDER: "legacy",
    },
  },
});
