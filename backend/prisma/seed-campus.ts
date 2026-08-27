/**
 * Development seed: a Supabase-aware, idempotent demo campus.
 *
 * WHAT CHANGED, AND WHY IT HAD TO
 *
 * Authentication now goes directly to Supabase, so a login account is two
 * records in two systems: an identity in `auth.users` and a `User` row keyed to
 * it by `authUserId`. This seed creates the identity FIRST, because the
 * application row needs its id, and writes no `passwordHash` at all — passwords
 * live in Supabase and nowhere else.
 *
 * IDEMPOTENT, NOT DESTRUCTIVE
 *
 * The previous seed opened with `wipe()`, deleting every row it owned so a
 * re-run would be clean. That is no longer safe or sufficient:
 *
 *   - Not sufficient, because dropping application rows does not remove
 *     Supabase identities. `auth.users` is a different schema and survives both
 *     the wipe and the database rebuild, so the second run would meet existing
 *     identities regardless.
 *   - Not safe, because the wipe is the single most dangerous thing in this
 *     repository and it existed only to make re-runs predictable.
 *
 * So there is no wipe. Every write is an upsert keyed on something stable — a
 * natural unique constraint where the schema has one, and a deterministic id
 * derived from a semantic key where it does not (see `stableId`). Running this
 * twice produces the same database as running it once, without deleting
 * anything, and it can be run against a database that already holds seeded data
 * without first tearing it down.
 *
 * SAFETY
 *
 * `assertSeedAllowed` refuses production outright and refuses any non-local
 * database unless the caller names that exact target — on Supabase, the
 * project-qualified target, not just the pooler hostname, which is shared by
 * every project in a region.
 *
 * Every account below uses a password committed to this repository. That is the
 * other reason this must never touch a real deployment.
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { assertSeedAllowed } from "../src/utils/seed-guard.js";
import {
  provisionAccount,
  type IdentityAdmin,
  type IdentityRecord,
} from "../src/utils/seed-identity.js";

/* -------------------------------------------------------------------------- */
/* Determinism                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A stable UUID derived from a semantic key.
 *
 * Several models the seed writes — timetable slots, materials, sessions,
 * notifications — have no natural unique constraint to upsert against. Deriving
 * the primary key from what the row *means* gives them one, so a second run
 * updates the same row instead of inserting a duplicate.
 */
const stableId = (key: string): string => {
  const h = createHash("sha1").update(`leornian-seed:${key}`).digest("hex");
  const variant = ((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16);
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    `5${h.slice(13, 16)}`,
    `${variant}${h.slice(18, 20)}`,
    h.slice(20, 32),
  ].join("-");
};

/** Fixed clock so re-runs do not drift the demo timetable and history. */
const NOW = new Date("2026-08-27T09:00:00.000Z");
const daysFrom = (base: Date, days: number) =>
  new Date(base.getTime() + days * 86_400_000);

/* -------------------------------------------------------------------------- */
/* The demo campus                                                             */
/* -------------------------------------------------------------------------- */

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "Demo@12345";

const ORGS = {
  nctu: {
    code: "NCTU",
    name: "Nile Canal Technological University",
    email: "registry@nctu.demo",
  },
  cu: {
    code: "CU",
    name: "Cairo Demo University",
    email: "registry@cu.demo",
  },
} as const;

type Role = "SYSTEM_OWNER" | "UNIVERSITY_ADMIN" | "DEPARTMENT_ADMIN" | "INSTRUCTOR" | "STUDENT";
type Status = "PENDING" | "ACTIVE" | "REJECTED" | "DISABLED";

interface SeedAccount {
  key: string;
  email: string;
  fullName: string;
  universityId: string;
  role: Role;
  status: Status;
  org: keyof typeof ORGS;
  /** Department code, for accounts scoped to one department. */
  department?: string;
  isVerified: boolean;
  isActive: boolean;
  jobTitle?: string;
}

/**
 * Every role and every account state the authorization work in Phases 3-6 has
 * to be tested against, including the ones that must be REFUSED access.
 *
 * `universityId` is globally unique in the schema, not per-organization, so the
 * organization code is part of it.
 */
const ACCOUNTS: SeedAccount[] = [
  {
    key: "owner",
    email: "owner@leornian.dev",
    fullName: "Platform Owner",
    universityId: "NCTU-OWNER-0001",
    role: "SYSTEM_OWNER",
    status: "ACTIVE",
    org: "nctu",
    isVerified: true,
    isActive: true,
    jobTitle: "Platform Owner",
  },
  {
    key: "admin-nctu",
    email: "admin.nctu@leornian.dev",
    fullName: "Nadia Fahmy",
    universityId: "NCTU-ADMIN-0001",
    role: "UNIVERSITY_ADMIN",
    status: "ACTIVE",
    org: "nctu",
    isVerified: true,
    isActive: true,
    jobTitle: "University Administrator",
  },
  {
    key: "admin-cu",
    email: "admin.cu@leornian.dev",
    fullName: "Omar Shafik",
    universityId: "CU-ADMIN-0001",
    role: "UNIVERSITY_ADMIN",
    status: "ACTIVE",
    org: "cu",
    isVerified: true,
    isActive: true,
    jobTitle: "University Administrator",
  },
  {
    key: "deptadmin-nctu",
    email: "dept.mechatronics@leornian.dev",
    fullName: "Hala Mansour",
    universityId: "NCTU-DEPT-0001",
    role: "DEPARTMENT_ADMIN",
    status: "ACTIVE",
    org: "nctu",
    department: "MEC",
    isVerified: true,
    isActive: true,
    jobTitle: "Department Administrator",
  },
  {
    key: "instructor-a",
    email: "instructor.a@leornian.dev",
    fullName: "Karim Adel",
    universityId: "NCTU-INST-0001",
    role: "INSTRUCTOR",
    status: "ACTIVE",
    org: "nctu",
    department: "MEC",
    isVerified: true,
    isActive: true,
    jobTitle: "Lecturer",
  },
  {
    key: "instructor-b",
    email: "instructor.b@leornian.dev",
    fullName: "Sara Naguib",
    universityId: "NCTU-INST-0002",
    role: "INSTRUCTOR",
    status: "ACTIVE",
    org: "nctu",
    department: "MEC",
    isVerified: true,
    isActive: true,
    jobTitle: "Teaching Assistant",
  },
  {
    key: "instructor-cu",
    email: "instructor.cu@leornian.dev",
    fullName: "Tarek Halim",
    universityId: "CU-INST-0001",
    role: "INSTRUCTOR",
    status: "ACTIVE",
    org: "cu",
    department: "CSE",
    isVerified: true,
    isActive: true,
    jobTitle: "Lecturer",
  },
  {
    key: "student-approved",
    email: "student.approved@leornian.dev",
    fullName: "Mariam Yousri",
    universityId: "NCTU-STU-0001",
    role: "STUDENT",
    status: "ACTIVE",
    org: "nctu",
    department: "MEC",
    isVerified: true,
    isActive: true,
  },
  {
    key: "student-pending",
    email: "student.pending@leornian.dev",
    fullName: "Youssef Amin",
    universityId: "NCTU-STU-0002",
    role: "STUDENT",
    status: "PENDING",
    org: "nctu",
    department: "MEC",
    isVerified: false,
    isActive: true,
  },
  {
    key: "student-rejected",
    email: "student.rejected@leornian.dev",
    fullName: "Laila Sobhy",
    universityId: "NCTU-STU-0003",
    role: "STUDENT",
    status: "REJECTED",
    org: "nctu",
    department: "MEC",
    isVerified: false,
    isActive: false,
  },
  {
    key: "student-disabled",
    email: "student.disabled@leornian.dev",
    fullName: "Bassem Ragab",
    universityId: "NCTU-STU-0004",
    role: "STUDENT",
    status: "DISABLED",
    org: "nctu",
    department: "MEC",
    isVerified: true,
    isActive: false,
  },
  {
    // Exists so cross-tenant tests have a real second-university student to be
    // refused as, rather than a fabricated id.
    key: "student-cu",
    email: "student.cu@leornian.dev",
    fullName: "Nour Hassan",
    universityId: "CU-STU-0001",
    role: "STUDENT",
    status: "ACTIVE",
    org: "cu",
    department: "CSE",
    isVerified: true,
    isActive: true,
  },
];

const DEPARTMENTS = [
  { org: "nctu" as const, code: "MEC", name: "Mechatronics" },
  { org: "nctu" as const, code: "CIV", name: "Civil Engineering" },
  { org: "cu" as const, code: "CSE", name: "Computer Science" },
];

const COURSES = [
  { org: "nctu" as const, dept: "MEC", code: "MEC301", name: "Control Systems", credits: 3 },
  { org: "nctu" as const, dept: "MEC", code: "MEC305", name: "Robotics Fundamentals", credits: 3 },
  { org: "cu" as const, dept: "CSE", code: "CSE210", name: "Data Structures", credits: 3 },
];

/* -------------------------------------------------------------------------- */
/* Seed                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The seed proper, with its two dependencies injected.
 *
 * `admin` is a parameter rather than something this function builds so the
 * database half can be exercised against a scratch Postgres with a fake
 * identity provider — no Supabase project, no network. The identity half is
 * unit-tested separately in tests/seed-identity.test.ts. Between them, every
 * line below is reachable in a test.
 */
export const seedCampus = async ({
  prisma,
  admin,
}: {
  prisma: PrismaClient;
  admin: IdentityAdmin;
}) => {
  assertSeedAllowed();

  console.log(
    "\nSeeding a DEMO campus. Every account below uses a password committed to\n" +
      "this repository, and exists in both Supabase Auth and this database.\n"
  );

  /* Organizations ---------------------------------------------------------- */

  const orgIds: Record<string, string> = {};
  for (const [key, org] of Object.entries(ORGS)) {
    const row = await prisma.organization.upsert({
      where: { code: org.code },
      update: { name: org.name, email: org.email },
      create: { code: org.code, name: org.name, email: org.email },
    });
    orgIds[key] = row.id;
  }

  /* Departments ------------------------------------------------------------ */

  const deptIds: Record<string, string> = {};
  for (const dept of DEPARTMENTS) {
    const row = await prisma.department.upsert({
      where: {
        organizationId_code: { organizationId: orgIds[dept.org]!, code: dept.code },
      },
      update: { name: dept.name, isActive: true },
      create: {
        organizationId: orgIds[dept.org]!,
        code: dept.code,
        name: dept.name,
      },
    });
    deptIds[`${dept.org}:${dept.code}`] = row.id;
  }

  /* Accounts --------------------------------------------------------------- */

  const userIds: Record<string, string> = {};
  let identitiesCreated = 0;
  let identitiesAdopted = 0;

  for (const account of ACCOUNTS) {
    const organizationId = orgIds[account.org]!;
    const departmentId = account.department
      ? deptIds[`${account.org}:${account.department}`]
      : undefined;

    // Identity first: the application row cannot be written without its id.
    // provisionAccount deletes the identity again if the write below fails,
    // but only when this run is the one that created it.
    const { identity, created } = await provisionAccount(
      admin,
      { email: account.email, password: DEMO_PASSWORD },
      async (id: IdentityRecord) => {
        const data = {
          authUserId: id.id,
          fullName: account.fullName,
          role: account.role,
          accountStatus: account.status,
          isVerified: account.isVerified,
          isActive: account.isActive,
          organizationId,
          departmentId: departmentId ?? null,
          // Deliberately absent: passwords live in Supabase. Any value here
          // would be a second, divergent credential.
          passwordHash: null,
        } satisfies Partial<Prisma.UserUncheckedCreateInput>;

        return prisma.user.upsert({
          where: { email: account.email },
          update: data,
          create: {
            ...data,
            email: account.email,
            universityId: account.universityId,
          },
        });
      }
    );

    userIds[account.key] = (
      await prisma.user.findUniqueOrThrow({ where: { email: account.email } })
    ).id;

    created ? (identitiesCreated += 1) : (identitiesAdopted += 1);
    void identity;
  }

  /* Profiles --------------------------------------------------------------- */

  for (const account of ACCOUNTS) {
    const userId = userIds[account.key]!;

    if (account.role === "STUDENT") continue;

    await prisma.adminProfile.upsert({
      where: { userId },
      update: { jobTitle: account.jobTitle ?? "Staff" },
      create: { userId, jobTitle: account.jobTitle ?? "Staff", office: "Main Campus" },
    });
  }

  /* Academic terms --------------------------------------------------------- */

  const termIds: Record<string, string> = {};
  for (const org of ["nctu", "cu"] as const) {
    const row = await prisma.academicTerm.upsert({
      where: {
        organizationId_academicYear_semester: {
          organizationId: orgIds[org]!,
          academicYear: "2026/2027",
          semester: 1,
        },
      },
      update: { isCurrent: true, name: "First Semester 2026/2027" },
      create: {
        organizationId: orgIds[org]!,
        name: "First Semester 2026/2027",
        academicYear: "2026/2027",
        semester: 1,
        startsOn: new Date("2026-09-01"),
        endsOn: new Date("2027-01-15"),
        isCurrent: true,
      },
    });
    termIds[org] = row.id;
  }

  /* Cohorts ---------------------------------------------------------------- */

  const cohortIds: Record<string, string> = {};
  const COHORTS = [
    { org: "nctu" as const, dept: "MEC", name: "Mechatronics L2 — A", level: 2, section: "A" },
    { org: "cu" as const, dept: "CSE", name: "Computer Science L2 — A", level: 2, section: "A" },
  ];

  for (const cohort of COHORTS) {
    const departmentId = deptIds[`${cohort.org}:${cohort.dept}`]!;
    const row = await prisma.cohort.upsert({
      where: {
        departmentId_academicYear_level_section_groupName: {
          departmentId,
          academicYear: "2026/2027",
          level: cohort.level,
          section: cohort.section,
          groupName: "",
        },
      },
      update: { name: cohort.name, isActive: true },
      create: {
        organizationId: orgIds[cohort.org]!,
        departmentId,
        name: cohort.name,
        academicYear: "2026/2027",
        level: cohort.level,
        section: cohort.section,
        groupName: "",
      },
    });
    cohortIds[cohort.org] = row.id;
  }

  /* Courses and offerings -------------------------------------------------- */

  const courseIds: Record<string, string> = {};
  const offeringIds: Record<string, string> = {};

  for (const course of COURSES) {
    const organizationId = orgIds[course.org]!;
    const departmentId = deptIds[`${course.org}:${course.dept}`]!;
    const createdById =
      course.org === "nctu" ? userIds["admin-nctu"]! : userIds["admin-cu"]!;

    const courseRow = await prisma.course.upsert({
      where: { courseCode_organizationId: { courseCode: course.code, organizationId } },
      update: { courseName: course.name, departmentId, credits: course.credits },
      create: {
        courseCode: course.code,
        courseName: course.name,
        semester: "First Semester",
        department: course.dept,
        departmentId,
        credits: course.credits,
        createdById,
        organizationId,
      },
    });
    courseIds[course.code] = courseRow.id;

    const offeringRow = await prisma.courseOffering.upsert({
      where: {
        courseId_termId_departmentId: {
          courseId: courseRow.id,
          termId: termIds[course.org]!,
          departmentId,
        },
      },
      update: { isActive: true, displayName: course.name },
      create: {
        organizationId,
        departmentId,
        courseId: courseRow.id,
        termId: termIds[course.org]!,
        displayName: course.name,
      },
    });
    offeringIds[course.code] = offeringRow.id;

    await prisma.courseOfferingCohort.upsert({
      where: {
        offeringId_cohortId: {
          offeringId: offeringRow.id,
          cohortId: cohortIds[course.org]!,
        },
      },
      update: {},
      create: { offeringId: offeringRow.id, cohortId: cohortIds[course.org]! },
    });
  }

  /* Teaching assignments --------------------------------------------------- */

  const teachingIds: Record<string, string> = {};
  const TEACHING = [
    { course: "MEC301", instructor: "instructor-a", org: "nctu" as const, role: "LECTURER" as const },
    { course: "MEC305", instructor: "instructor-b", org: "nctu" as const, role: "LECTURER" as const },
    { course: "CSE210", instructor: "instructor-cu", org: "cu" as const, role: "LECTURER" as const },
  ];

  for (const teaching of TEACHING) {
    const row = await prisma.teachingAssignment.upsert({
      where: {
        offeringId_instructorId_cohortId_teachingRole: {
          offeringId: offeringIds[teaching.course]!,
          instructorId: userIds[teaching.instructor]!,
          cohortId: cohortIds[teaching.org]!,
          teachingRole: teaching.role,
        },
      },
      update: { isActive: true },
      create: {
        organizationId: orgIds[teaching.org]!,
        offeringId: offeringIds[teaching.course]!,
        instructorId: userIds[teaching.instructor]!,
        cohortId: cohortIds[teaching.org]!,
        teachingRole: teaching.role,
      },
    });
    teachingIds[teaching.course] = row.id;
  }

  /* Student profiles and enrollments --------------------------------------- */

  const STUDENTS = ACCOUNTS.filter((a) => a.role === "STUDENT");

  for (const student of STUDENTS) {
    const org = student.org;
    const userId = userIds[student.key]!;
    // A pending student has not completed a profile yet — that is the state
    // Phase 4 hands over and Phase 8 renders, so the seed must reproduce it.
    const isPending = student.status === "PENDING";

    await prisma.studentProfile.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        faculty: "Faculty of Engineering",
        department: student.department ?? null,
        level: isPending ? null : 2,
        semester: isPending ? null : "First Semester",
        section: isPending ? null : "A",
        academicYear: isPending ? null : "2026/2027",
        cohortId: isPending ? null : cohortIds[org]!,
        status: isPending ? "INCOMPLETE" : "COMPLETED",
        completedAt: isPending ? null : NOW,
      },
    });

    // Only accounts that are actually let in get enrolled.
    if (student.status !== "ACTIVE") continue;

    const courseCodes = org === "nctu" ? ["MEC301", "MEC305"] : ["CSE210"];
    for (const code of courseCodes) {
      await prisma.enrollment.upsert({
        where: {
          offeringId_studentId: { offeringId: offeringIds[code]!, studentId: userId },
        },
        update: { isActive: true },
        create: {
          organizationId: orgIds[org]!,
          offeringId: offeringIds[code]!,
          studentId: userId,
        },
      });
    }
  }

  /* Timetable -------------------------------------------------------------- */

  const scheduleIds: Record<string, string> = {};
  const TIMETABLE = [
    { course: "MEC301", org: "nctu" as const, instructor: "instructor-a", day: "SUNDAY" as const, start: "09:00", end: "10:30", room: "B201" },
    { course: "MEC305", org: "nctu" as const, instructor: "instructor-b", day: "TUESDAY" as const, start: "11:00", end: "12:30", room: "B204" },
    { course: "CSE210", org: "cu" as const, instructor: "instructor-cu", day: "MONDAY" as const, start: "09:00", end: "10:30", room: "C101" },
  ];

  for (const slot of TIMETABLE) {
    const id = stableId(`schedule:${slot.org}:${slot.course}:${slot.day}:${slot.start}`);
    const data = {
      organizationId: orgIds[slot.org]!,
      courseId: courseIds[slot.course]!,
      instructorId: userIds[slot.instructor]!,
      departmentId: deptIds[`${slot.org}:${slot.org === "nctu" ? "MEC" : "CSE"}`]!,
      cohortId: cohortIds[slot.org]!,
      offeringId: offeringIds[slot.course]!,
      teachingAssignmentId: teachingIds[slot.course]!,
      faculty: "Faculty of Engineering",
      department: slot.org === "nctu" ? "MEC" : "CSE",
      level: 2,
      semester: 1,
      section: "A",
      dayOfWeek: slot.day,
      startTime: slot.start,
      endTime: slot.end,
      room: slot.room,
      isActive: true,
    };

    await prisma.lectureSchedule.upsert({ where: { id }, update: data, create: { id, ...data } });
    scheduleIds[slot.course] = id;
  }

  /* Materials -------------------------------------------------------------- */

  for (const course of COURSES) {
    const id = stableId(`material:${course.org}:${course.code}`);
    const addedById =
      course.org === "nctu"
        ? userIds[course.code === "MEC301" ? "instructor-a" : "instructor-b"]!
        : userIds["instructor-cu"]!;

    const data = {
      organizationId: orgIds[course.org]!,
      courseId: courseIds[course.code]!,
      departmentId: deptIds[`${course.org}:${course.dept}`]!,
      cohortId: cohortIds[course.org]!,
      offeringId: offeringIds[course.code]!,
      faculty: "Faculty of Engineering",
      department: course.dept,
      level: 2,
      semester: 1,
      section: "A",
      title: `${course.name} — Week 1 notes`,
      driveUrl: `https://example.invalid/materials/${course.code.toLowerCase()}-week-1`,
      addedById,
      isActive: true,
    };

    await prisma.courseMaterial.upsert({ where: { id }, update: data, create: { id, ...data } });
  }

  /* Assignments ------------------------------------------------------------ */

  for (const course of COURSES) {
    const id = stableId(`assignment:${course.org}:${course.code}`);
    const createdById =
      course.org === "nctu"
        ? userIds[course.code === "MEC301" ? "instructor-a" : "instructor-b"]!
        : userIds["instructor-cu"]!;

    const data = {
      organizationId: orgIds[course.org]!,
      departmentId: deptIds[`${course.org}:${course.dept}`]!,
      offeringId: offeringIds[course.code]!,
      createdById,
      title: `${course.name} — Assignment 1`,
      description: "Demo assignment created by the development seed.",
      deadline: daysFrom(NOW, 14),
      maxScore: 100,
      isPublished: true,
      publishedAt: NOW,
    };

    await prisma.assignment.upsert({ where: { id }, update: data, create: { id, ...data } });

    await prisma.assignmentCohort.upsert({
      where: { assignmentId_cohortId: { assignmentId: id, cohortId: cohortIds[course.org]! } },
      update: {},
      create: { assignmentId: id, cohortId: cohortIds[course.org]! },
    });
  }

  /* A closed attendance session, with attendance ---------------------------- */

  const sessionId = stableId("session:nctu:MEC301:week1");
  const sessionStart = daysFrom(NOW, -7);
  const sessionData = {
    title: "Control Systems — Week 1",
    createdById: userIds["instructor-a"]!,
    courseId: courseIds["MEC301"]!,
    organizationId: orgIds["nctu"]!,
    lectureScheduleId: scheduleIds["MEC301"]!,
    room: "B201",
    status: "CLOSED" as const,
    startTime: sessionStart,
    endTime: new Date(sessionStart.getTime() + 90 * 60_000),
    closeReason: "MANUAL" as const,
    absencesSweptAt: new Date(sessionStart.getTime() + 95 * 60_000),
  };

  await prisma.session.upsert({
    where: { id: sessionId },
    update: sessionData,
    create: { id: sessionId, ...sessionData },
  });

  // The approved student attended; the disabled one did not. Both rows exist so
  // attendance history has something true to show for each case.
  await prisma.attendance.upsert({
    where: {
      studentId_sessionId: { studentId: userIds["student-approved"]!, sessionId },
    },
    update: { status: "PRESENT" },
    create: {
      studentId: userIds["student-approved"]!,
      sessionId,
      status: "PRESENT",
      scanTime: new Date(sessionStart.getTime() + 4 * 60_000),
    },
  });

  await prisma.attendance.upsert({
    where: {
      studentId_sessionId: { studentId: userIds["student-disabled"]!, sessionId },
    },
    update: { status: "ABSENT" },
    create: {
      studentId: userIds["student-disabled"]!,
      sessionId,
      status: "ABSENT",
      scanTime: sessionData.endTime,
    },
  });

  /* Notifications ----------------------------------------------------------- */

  const NOTIFICATIONS = [
    {
      key: "approved",
      user: "student-approved",
      org: "nctu" as const,
      type: "ACCOUNT_APPROVED" as const,
      title: "Your account was approved",
      body: "You can now use every student feature.",
      status: "SENT" as const,
    },
    {
      key: "rejected",
      user: "student-rejected",
      org: "nctu" as const,
      type: "ACCOUNT_REJECTED" as const,
      title: "Your registration was not approved",
      body: "Contact the registry office for details.",
      status: "SENT" as const,
    },
    {
      key: "assignment",
      user: "student-approved",
      org: "nctu" as const,
      type: "ASSIGNMENT_PUBLISHED" as const,
      title: "New assignment: Control Systems — Assignment 1",
      body: "Due in two weeks.",
      status: "PENDING" as const,
    },
  ];

  for (const notification of NOTIFICATIONS) {
    const id = stableId(`notification:${notification.user}:${notification.key}`);
    const data = {
      organizationId: orgIds[notification.org]!,
      userId: userIds[notification.user]!,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      scheduledFor: NOW,
      sentAt: notification.status === "SENT" ? NOW : null,
      status: notification.status,
    };

    await prisma.notification.upsert({
      where: { id },
      update: data,
      create: { id, ...data },
    });
  }

  /* Report ----------------------------------------------------------------- */

  console.log(`Organizations      : ${Object.keys(ORGS).length}`);
  console.log(`Departments        : ${DEPARTMENTS.length}`);
  console.log(`Accounts           : ${ACCOUNTS.length}`);
  console.log(`  identities created: ${identitiesCreated}`);
  console.log(`  identities adopted: ${identitiesAdopted}`);
  console.log(`Courses / offerings: ${COURSES.length}`);
  console.log(`Timetable slots    : ${TIMETABLE.length}`);
  console.log(`\nAll accounts use the password: ${DEMO_PASSWORD}\n`);
};