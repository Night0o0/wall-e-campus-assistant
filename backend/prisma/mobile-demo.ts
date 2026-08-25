import { DeviceStatus } from "@prisma/client";
import bcrypt from "bcrypt";
import prisma from "../src/lib/prisma.js";
import { assertSeedAllowed } from "../src/utils/seed-guard.js";

/**
 * Non-destructive credential setup for mobile QA.
 *
 * Unlike prisma/seed.ts this does not wipe university data. It resets the
 * known NCTU demo principals and idempotently fills otherwise-empty mobile
 * surfaces with a small showcase dataset.
 */
const HUMAN_PASSWORD = "Demo@12345";
const ROBOT_PASSWORD = "Robot@12345-Demo-Only";

const main = async () => {
  assertSeedAllowed();

  const organization = await prisma.organization.findUnique({
    where: { code: "NCTU" },
    select: { id: true },
  });

  if (!organization) {
    throw new Error(
      "NCTU demo data is missing. Run the full development seed first."
    );
  }

  const humanHash = await bcrypt.hash(HUMAN_PASSWORD, 10);
  const robotHash = await bcrypt.hash(ROBOT_PASSWORD, 10);
  const accountEmails = [
    "ahmed.hassan@nctu.edu.eg",
    "adel.mansour@nctu.edu.eg",
    "mechatronics.a@student.nctu.edu.eg",
  ];

  const accounts = await prisma.user.findMany({
    where: { email: { in: accountEmails }, organizationId: organization.id },
    select: { id: true, email: true },
  });

  if (accounts.length !== accountEmails.length) {
    const found = new Set(accounts.map((account) => account.email));
    const missing = accountEmails.filter((email) => !found.has(email));
    throw new Error(`Mobile demo accounts are missing: ${missing.join(", ")}`);
  }

  await prisma.user.updateMany({
    where: { id: { in: accounts.map((account) => account.id) } },
    data: { passwordHash: humanHash, isActive: true, isVerified: true },
  });

  const superAdmin = accounts.find(
    (account) => account.email === "ahmed.hassan@nctu.edu.eg"
  )!;
  const admin = accounts.find(
    (account) => account.email === "adel.mansour@nctu.edu.eg"
  )!;
  const student = accounts.find(
    (account) => account.email === "mechatronics.a@student.nctu.edu.eg"
  )!;
  const existingRobot = await prisma.robotDevice.findFirst({
    where: {
      organizationId: organization.id,
      OR: [
        { deviceKeyId: "robot@nctu.edu.eg" },
        { deviceKeyId: "dev_nctu_demo" },
      ],
    },
  });

  if (existingRobot) {
    await prisma.robotDevice.update({
      where: { id: existingRobot.id },
      data: {
        deviceKeyId: "robot@nctu.edu.eg",
        secretHash: robotHash,
        status: DeviceStatus.ACTIVE,
        revokedAt: null,
        revokedById: null,
        revokedReason: null,
      },
    });
  } else {
    await prisma.robotDevice.create({
      data: {
        organizationId: organization.id,
        name: "NCTU Lecture Hall Robot",
        room: "B-204",
        deviceKeyId: "robot@nctu.edu.eg",
        secretHash: robotHash,
        status: DeviceStatus.ACTIVE,
        createdById: superAdmin.id,
      },
    });
  }

  /* ---------------------------- Showcase content --------------------------- */

  // A pending registration gives both staff roles something actionable in the
  // approval queue without affecting the approved timetable demo student.
  const pendingEmail = "pending.student@student.nctu.edu.eg";
  const pending = await prisma.user.findUnique({ where: { email: pendingEmail } });

  if (!pending) {
    await prisma.user.create({
      data: {
        universityId: "NCTU-MOBILE-PENDING",
        fullName: "Nour Mobile Demo",
        email: pendingEmail,
        passwordHash: humanHash,
        role: "STUDENT",
        isVerified: false,
        isActive: true,
        organizationId: organization.id,
        studentProfile: {
          create: {
            faculty: "Faculty of Engineering",
            department: "Mechatronics",
            level: 2,
            semester: "First Semester",
            section: "A",
            status: "INCOMPLETE",
          },
        },
      },
    });
  }

  const courses = await prisma.course.findMany({
    where: {
      organizationId: organization.id,
      courseCode: { in: ["MEC201", "MEC202", "MEC203", "MEC204", "MEC205"] },
    },
    select: { id: true, courseCode: true, courseName: true },
  });

  const materialTitles: Record<string, string[]> = {
    MEC201: [
      "Electronics lecture slides",
      "Electronics lab sheets",
      "Midterm revision questions",
    ],
    MEC202: [
      "Control Systems lecture notes",
      "MATLAB exercises",
      "Practice problem set",
    ],
    MEC203: [
      "Thermodynamics lecture slides",
      "Property tables and formulas",
      "Final revision material",
    ],
    MEC204: [
      "Digital Logic lecture slides",
      "Logic design lab manual",
      "Circuit practice sheets",
    ],
    MEC205: [
      "Robotics Lab handbook",
      "Robot programming examples",
      "Project assessment guide",
    ],
  };

  for (const course of courses) {
    for (const [index, title] of materialTitles[course.courseCode]!.entries()) {
      const existing = await prisma.courseMaterial.findFirst({
        where: { organizationId: organization.id, courseId: course.id, title },
      });
      const values = {
        faculty: "Faculty of Engineering",
        department: "Mechatronics",
        level: 2,
        semester: 1,
        section: null,
        driveUrl:
          `https://drive.google.com/drive/folders/` +
          `WALLE_DEMO_${course.courseCode}_${index + 1}`,
        addedById: admin.id,
        isActive: true,
      };

      if (existing) {
        await prisma.courseMaterial.update({
          where: { id: existing.id },
          data: values,
        });
      } else {
        await prisma.courseMaterial.create({
          data: {
            organizationId: organization.id,
            courseId: course.id,
            title,
            ...values,
          },
        });
      }
    }
  }

  // The full seed's live sessions naturally expire. Refresh one unlinked
  // B-204 session here so the robot always has a safe QR-display demonstration
  // immediately after this command is run. The demo student has no attendance
  // row for it, so the camera scan flow can be exercised once for real.
  const qrCourse = courses.find((course) => course.courseCode === "MEC201");
  const liveTitle = "Mobile Demo Live Attendance";
  const liveSession = await prisma.session.findFirst({
    where: {
      organizationId: organization.id,
      title: liveTitle,
      status: "ACTIVE",
    },
    orderBy: { createdAt: "desc" },
  });
  const now = new Date();

  if (liveSession) {
    await prisma.session.update({
      where: { id: liveSession.id },
      data: {
        createdById: admin.id,
        courseId: qrCourse?.id ?? null,
        lectureScheduleId: null,
        room: "B-204",
        status: "ACTIVE",
        startTime: now,
        endTime: null,
        closeReason: null,
        absencesSweptAt: null,
      },
    });
  } else {
    await prisma.session.create({
      data: {
        title: liveTitle,
        createdById: admin.id,
        courseId: qrCourse?.id ?? null,
        organizationId: organization.id,
        room: "B-204",
        startTime: now,
      },
    });
  }

  // Human inbox examples for all three app roles. Student reminders already
  // exist in the full seed, but these stable titles make this script useful on
  // a partially populated development database too.
  for (const notice of [
    {
      userId: student.id,
      title: "Welcome to the mobile campus assistant",
      body: "Your timetable, attendance, materials and QR scanner are ready to try.",
    },
    {
      userId: admin.id,
      title: "Teaching dashboard ready",
      body: "Your lectures, sessions and pending-student queue are available in the app.",
    },
    {
      userId: superAdmin.id,
      title: "University mobile overview ready",
      body: "Campus people, courses, devices and attendance metrics are available.",
    },
  ]) {
    const existing = await prisma.notification.findFirst({
      where: { userId: notice.userId, title: notice.title },
    });

    if (!existing) {
      await prisma.notification.create({
        data: {
          organizationId: organization.id,
          userId: notice.userId,
          type: "ACCOUNT_APPROVED",
          title: notice.title,
          body: notice.body,
          scheduledFor: now,
          sentAt: now,
          status: "SENT",
          data: { source: "mobile-demo" },
        },
      });
    }
  }

  console.log(
    `Mobile demo is ready for NCTU: ${courses.length} material courses, ` +
      "one pending student, role inbox notices and one fresh B-204 robot session."
  );
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
