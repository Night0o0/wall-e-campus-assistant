/**
 * Runs the seed's DATABASE half against the scratch Postgres with a fake
 * identity provider, twice, and checks the Phase 2 guarantees.
 *
 * No Supabase project, no network, no credentials. The identity half is covered
 * by tests/seed-identity.test.ts; this covers everything the identity half hands
 * off to — every upsert, against the real schema.
 */
import { PrismaClient } from "@prisma/client";
import { seedCampus } from "../prisma/seed-campus.js";
import {
  normaliseEmail,
  type IdentityAdmin,
  type IdentityRecord,
} from "../src/utils/seed-identity.js";

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
process.env.DIRECT_URL = SCRATCH;
process.env.NODE_ENV = "development";

const prisma = new PrismaClient({ datasources: { db: { url: SCRATCH } } });

/** Stands in for Supabase Auth, and outlives a "rebuild" the way auth.users does. */
const makeFakeAdmin = () => {
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
      const record = { id: `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`, email: key };
      store.set(key, record);
      created.push(key);
      return record;
    },
    async delete(id) {
      deleted.push(id);
      for (const [k, v] of store) if (v.id === id) store.delete(k);
    },
  };

  return { admin, created, deleted, store };
};

const snapshot = async () => ({
  organizations: await prisma.organization.count(),
  departments: await prisma.department.count(),
  users: await prisma.user.count(),
  adminProfiles: await prisma.adminProfile.count(),
  studentProfiles: await prisma.studentProfile.count(),
  terms: await prisma.academicTerm.count(),
  cohorts: await prisma.cohort.count(),
  courses: await prisma.course.count(),
  offerings: await prisma.courseOffering.count(),
  offeringCohorts: await prisma.courseOfferingCohort.count(),
  teaching: await prisma.teachingAssignment.count(),
  enrollments: await prisma.enrollment.count(),
  schedules: await prisma.lectureSchedule.count(),
  materials: await prisma.courseMaterial.count(),
  assignments: await prisma.assignment.count(),
  assignmentCohorts: await prisma.assignmentCohort.count(),
  sessions: await prisma.session.count(),
  attendance: await prisma.attendance.count(),
  notifications: await prisma.notification.count(),
});

const failures: string[] = [];
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(label);
};

const main = async () => {
  console.log("\n=== starting state ===");
  const before = await snapshot();
  console.log(`users=${before.users} organizations=${before.organizations}`);

  const { admin, created, deleted } = makeFakeAdmin();

  console.log("\n=== RUN 1 ===");
  await seedCampus({ prisma, admin });
  const first = await snapshot();
  const createdAfterFirst = created.length;

  console.log("\n=== RUN 2 (same identity store, as after a re-run) ===");
  await seedCampus({ prisma, admin });
  const second = await snapshot();

  console.log("\n=== RUN 3 (identities survive, application rows wiped — the rebuild case) ===");
  // Exactly what happens after `rebuild-database.mjs`: `public` is emptied but
  // `auth.users` is untouched. Delete application rows only, keep the identities.
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

  await seedCampus({ prisma, admin });
  const third = await snapshot();

  console.log("\n=== CHECKS ===");

  check(
    "run 2 changes no row counts (idempotent)",
    JSON.stringify(first) === JSON.stringify(second),
    JSON.stringify(first) === JSON.stringify(second) ? "" : `${JSON.stringify(first)} vs ${JSON.stringify(second)}`
  );

  check(
    "run 3 reproduces the same counts after an application-only wipe",
    JSON.stringify(first) === JSON.stringify(third)
  );

  check(
    "identities created exactly once across three runs",
    created.length === createdAfterFirst && createdAfterFirst === 12,
    `created=${created.length} after-run-1=${createdAfterFirst}`
  );

  check("no identity was ever deleted", deleted.length === 0, `deleted=${deleted.length}`);

  const users = await prisma.user.findMany({
    select: { email: true, authUserId: true, passwordHash: true, role: true, accountStatus: true, organizationId: true },
  });

  check("every user has an authUserId", users.every((u) => !!u.authUserId), `${users.filter((u) => !u.authUserId).length} missing`);
  check("no user has a local passwordHash", users.every((u) => u.passwordHash === null), `${users.filter((u) => u.passwordHash !== null).length} with hashes`);
  check("12 accounts exist", users.length === 12, `found ${users.length}`);

  const byRole = users.reduce<Record<string, number>>((acc, u) => {
    acc[u.role] = (acc[u.role] ?? 0) + 1;
    return acc;
  }, {});
  check(
    "role distribution is 1 owner / 2 univ admins / 1 dept admin / 3 instructors / 5 students",
    byRole.SYSTEM_OWNER === 1 && byRole.UNIVERSITY_ADMIN === 2 && byRole.DEPARTMENT_ADMIN === 1 &&
      byRole.INSTRUCTOR === 3 && byRole.STUDENT === 5,
    JSON.stringify(byRole)
  );

  const byStatus = users.reduce<Record<string, number>>((acc, u) => {
    acc[u.accountStatus] = (acc[u.accountStatus] ?? 0) + 1;
    return acc;
  }, {});
  check(
    "all four account states are represented",
    !!byStatus.ACTIVE && !!byStatus.PENDING && !!byStatus.REJECTED && !!byStatus.DISABLED,
    JSON.stringify(byStatus)
  );

  const orgs = await prisma.organization.findMany({ select: { code: true, _count: { select: { users: true } } } });
  check("two organizations, both populated", orgs.length === 2 && orgs.every((o) => o._count.users > 0), JSON.stringify(orgs.map((o) => `${o.code}:${o._count.users}`)));

  const authIds = new Set(users.map((u) => u.authUserId));
  check("authUserId values are unique", authIds.size === users.length);

  const pending = await prisma.user.findFirst({
    where: { email: "student.pending@leornian.dev" },
    include: { studentProfile: true },
  });
  check("the pending student has an INCOMPLETE profile", pending?.studentProfile?.status === "INCOMPLETE", pending?.studentProfile?.status ?? "none");

  const pendingEnrollments = await prisma.enrollment.count({ where: { studentId: pending!.id } });
  check("the pending student is not enrolled", pendingEnrollments === 0, `${pendingEnrollments} enrollments`);

  console.log("\n=== FINAL COUNTS ===");
  console.table(third);

  console.log(
    failures.length === 0
      ? "\nALL CHECKS PASSED\n"
      : `\n${failures.length} CHECK(S) FAILED: ${failures.join("; ")}\n`
  );
  process.exitCode = failures.length === 0 ? 0 : 1;
};

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
