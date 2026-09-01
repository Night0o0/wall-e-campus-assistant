/**
 * Read-only verification of the configured development database.
 *
 * This script never prints connection strings, identity ids, emails, tokens,
 * or keys. It verifies the database projection expected by the live auth/API
 * harness and exits non-zero when an invariant fails.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
let failures = 0;

const check = (label: string, ok: boolean, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
};

const main = async () => {
  const [
    organizations,
    users,
    usersWithoutIdentity,
    usersWithLocalPasswords,
    terms,
    cohorts,
    offerings,
    teachingAssignments,
    enrollments,
    roleGroups,
    statusGroups,
    currentGroups,
  ] = await Promise.all([
    prisma.organization.count(),
    prisma.user.count(),
    prisma.user.count({ where: { authUserId: null } }),
    prisma.user.count({ where: { passwordHash: { not: null } } }),
    prisma.academicTerm.count(),
    prisma.cohort.count(),
    prisma.courseOffering.count(),
    prisma.teachingAssignment.count(),
    prisma.enrollment.count(),
    prisma.user.groupBy({ by: ["role"], _count: { _all: true } }),
    prisma.user.groupBy({ by: ["accountStatus"], _count: { _all: true } }),
    prisma.academicTerm.groupBy({
      by: ["organizationId"],
      where: { isCurrent: true },
      _count: { _all: true },
    }),
  ]);

  const indexRows = await prisma.$queryRaw<Array<{ present: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = 'AcademicTerm_one_current_per_organization_key'
    ) AS present
  `;

  const migrationRows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) AS count
    FROM "_prisma_migrations"
    WHERE finished_at IS NOT NULL
      AND rolled_back_at IS NULL
  `;

  const tenantRows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) AS count
    FROM (
      SELECT o.id
      FROM "CourseOffering" o
      JOIN "Department" d ON d.id = o."departmentId"
      JOIN "Course" c ON c.id = o."courseId"
      JOIN "AcademicTerm" t ON t.id = o."termId"
      WHERE o."organizationId" <> d."organizationId"
         OR o."organizationId" <> c."organizationId"
         OR o."organizationId" <> t."organizationId"
      UNION ALL
      SELECT a.id
      FROM "TeachingAssignment" a
      JOIN "CourseOffering" o ON o.id = a."offeringId"
      JOIN "User" u ON u.id = a."instructorId"
      WHERE a."organizationId" <> o."organizationId"
         OR a."organizationId" <> u."organizationId"
      UNION ALL
      SELECT e.id
      FROM "Enrollment" e
      JOIN "CourseOffering" o ON o.id = e."offeringId"
      JOIN "User" u ON u.id = e."studentId"
      WHERE e."organizationId" <> o."organizationId"
         OR e."organizationId" <> u."organizationId"
    ) anomalies
  `;

  const roles = new Set(roleGroups.map((row) => row.role));
  const statuses = new Set(statusGroups.map((row) => row.accountStatus));
  const tenantAnomalies = Number(tenantRows[0]?.count ?? 0n);
  const migrations = Number(migrationRows[0]?.count ?? 0n);

  console.log("\n=== Live database checks ===");
  check("two seeded organizations exist", organizations === 2, `${organizations} found`);
  check("twelve seeded application users exist", users === 12, `${users} found`);
  check("every user is linked to a Supabase identity", usersWithoutIdentity === 0);
  check("no user retains a local password hash", usersWithLocalPasswords === 0);
  check(
    "all product roles are represented",
    ["SYSTEM_OWNER", "UNIVERSITY_ADMIN", "DEPARTMENT_ADMIN", "INSTRUCTOR", "STUDENT"].every(
      (role) => roles.has(role as never)
    )
  );
  check(
    "all account lifecycle states are represented",
    ["PENDING", "ACTIVE", "REJECTED", "DISABLED"].every((status) =>
      statuses.has(status as never)
    )
  );
  check(
    "academic core data is populated",
    [terms, cohorts, offerings, teachingAssignments, enrollments].every((count) => count > 0),
    `terms=${terms}, cohorts=${cohorts}, offerings=${offerings}, teaching=${teachingAssignments}, enrollments=${enrollments}`
  );
  check(
    "each organization has exactly one current academic term",
    currentGroups.length === organizations && currentGroups.every((row) => row._count._all === 1),
    `${currentGroups.length}/${organizations} organizations represented`
  );
  check("the current-term uniqueness index exists", indexRows[0]?.present === true);
  check("all fourteen migrations are recorded as applied", migrations === 14, `${migrations} found`);
  check("academic references contain no cross-tenant anomalies", tenantAnomalies === 0);

  console.log(failures === 0 ? "\nALL CHECKS PASSED\n" : `\n${failures} CHECK(S) FAILED\n`);
  process.exitCode = failures === 0 ? 0 : 1;
};

main()
  .catch((error) => {
    console.error("\nVERIFICATION ABORTED:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
