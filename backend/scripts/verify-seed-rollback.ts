/**
 * Proves the compensating delete is actually wired into the seed's write path,
 * using a REAL Prisma failure against the scratch database rather than a fake.
 *
 * `universityId` is globally unique. Pre-inserting a row that squats on the
 * first seed account's universityId under a different email makes that
 * account's upsert fail on a genuine constraint violation, after its identity
 * has already been created. The identity must be gone again afterwards.
 */
import { PrismaClient } from "@prisma/client";
import { seedCampus } from "../prisma/seed-campus.js";
import { normaliseEmail, type IdentityAdmin, type IdentityRecord } from "../src/utils/seed-identity.js";

/**
 * Loopback only, with no override.
 *
 * This script writes demo data and deletes application rows to set its cases
 * up. That is fine against a disposable scratch cluster and unacceptable
 * anywhere else, so the refusal is on the connection itself rather than on a
 * flag somebody could set. SCRATCH_DATABASE_URL exists so the port or database
 * name can differ; the host still has to be the local machine.
 */
const SCRATCH =
  process.env.SCRATCH_DATABASE_URL ??
  "postgresql://postgres:scratchpw@127.0.0.1:55432/leornian_scratch";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

const scratchHost = (() => {
  try {
    return new URL(SCRATCH).hostname.toLowerCase().replace(/^\[|\]$/g, "");
  } catch {
    return null;
  }
})();

if (scratchHost === null || !LOOPBACK.has(scratchHost)) {
  console.error(
    "\nRefusing to run: this script writes demo data and deletes application " +
      `rows, and "${scratchHost ?? SCRATCH}" is not the local machine. It is a ` +
      "scratch-database tool and has no override flag.\n"
  );
  process.exit(1);
}
process.env.DATABASE_URL = SCRATCH;
process.env.NODE_ENV = "development";

const prisma = new PrismaClient({ datasources: { db: { url: SCRATCH } } });

const store = new Map<string, IdentityRecord>();
const created: string[] = [];
const deleted: string[] = [];
let counter = 0;

const admin: IdentityAdmin = {
  async findByEmail(email) {
    return store.get(normaliseEmail(email)) ?? null;
  },
  async create({ email }) {
    const key = normaliseEmail(email);
    counter += 1;
    const record = { id: `11111111-0000-4000-8000-${String(counter).padStart(12, "0")}`, email: key };
    store.set(key, record);
    created.push(key);
    return record;
  },
  async delete(id) {
    deleted.push(id);
    for (const [k, v] of store) if (v.id === id) store.delete(k);
  },
};

const main = async () => {
  // Clean slate.
  await prisma.attendance.deleteMany();
  await prisma.session.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.assignmentCohort.deleteMany();
  await prisma.assignment.deleteMany();
  await prisma.courseMaterial.deleteMany();
  await prisma.lectureSchedule.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.teachingAssignment.deleteMany();
  await prisma.courseOfferingCohort.deleteMany();
  await prisma.courseOffering.deleteMany();
  await prisma.course.deleteMany();
  await prisma.studentProfile.deleteMany();
  await prisma.adminProfile.deleteMany();
  await prisma.cohort.deleteMany();
  await prisma.academicTerm.deleteMany();
  await prisma.user.deleteMany();
  await prisma.department.deleteMany();
  await prisma.organization.deleteMany();

  // A squatter holding the owner account's universityId under another email.
  const org = await prisma.organization.create({
    data: { code: "SQUAT", name: "Squatter University" },
  });
  await prisma.user.create({
    data: {
      email: "squatter@leornian.dev",
      universityId: "NCTU-OWNER-0001",
      fullName: "Squatter",
      organizationId: org.id,
      role: "STUDENT",
    },
  });

  let failed: unknown = null;
  try {
    await seedCampus({ prisma, admin });
  } catch (error) {
    failed = error;
  }

  const message = failed instanceof Error ? failed.message.split("\n")[0] : String(failed);

  console.log("\n=== CHECKS ===");
  const checks: Array<[string, boolean, string]> = [
    ["the seed failed on a real constraint violation", failed !== null, message ?? ""],
    ["an identity was created for the failing account", created.length === 1, `created=${created.length}`],
    ["that identity was deleted again", deleted.length === 1, `deleted=${deleted.length}`],
    ["no identity is left behind", store.size === 0, `store=${store.size}`],
    [
      "no partial application user was written for it",
      (await prisma.user.count({ where: { email: "owner@leornian.dev" } })) === 0,
      "",
    ],
  ];

  let bad = 0;
  for (const [label, ok, detail] of checks) {
    console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
    if (!ok) bad += 1;
  }

  // Leave the scratch database clean for the next run.
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  console.log(bad === 0 ? "\nALL CHECKS PASSED\n" : `\n${bad} CHECK(S) FAILED\n`);
  process.exitCode = bad === 0 ? 0 : 1;
};

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
