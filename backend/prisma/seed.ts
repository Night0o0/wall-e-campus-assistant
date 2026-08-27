/**
 * CLI entry for the development seed: `npm run db:seed`.
 *
 * Everything the seed actually does lives in ./seed-campus.ts, which takes its
 * Prisma client and its identity provider as parameters. This file is the only
 * place that builds the real ones.
 *
 * The split is not decoration. It means the seed's database half can be run
 * against a scratch Postgres with a fake identity provider — no Supabase
 * project, no network, no credentials — which is how it is verified before
 * anyone points it at a real project. Importing seed-campus.ts seeds nothing by
 * itself; only running this file does.
 */
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { supabaseIdentityAdmin, type IdentityAdmin } from "../src/utils/seed-identity.js";
import { seedCampus } from "./seed-campus.js";

/**
 * Builds the identity admin, or explains precisely what is missing.
 *
 * The service-role key is required and is backend-only. Without it the seed
 * cannot create identities at all, and failing here with a clear message beats
 * failing later with a 401 from Supabase.
 */
const identityAdmin = (): IdentityAdmin => {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const missing = [
    !url && "SUPABASE_URL",
    !serviceRoleKey && "SUPABASE_SERVICE_ROLE_KEY",
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(
      `Cannot seed: ${missing.join(" and ")} not set. Seed accounts are created ` +
        "through the Supabase Admin API, so the seed needs the project URL and " +
        "the service-role key. The service-role key is backend-only and must " +
        "never be given to web or mobile."
    );
  }

  return supabaseIdentityAdmin(
    createClient(url!, serviceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  );
};

const prisma = new PrismaClient();

seedCampus({ prisma, admin: identityAdmin() })
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("\nSeed failed:\n", error);
    await prisma.$disconnect();
    process.exit(1);
  });
