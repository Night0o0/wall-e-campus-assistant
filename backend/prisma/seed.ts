import {
  PrismaClient,
  AttendanceStatus,
  DayOfWeek,
  SessionCloseReason,
} from "@prisma/client";
import bcrypt from "bcrypt";
import { partsInZone, zonedTimeToUtc } from "../src/utils/occurrence.util.js";
import { assertSeedAllowed } from "../src/utils/seed-guard.js";

const prisma = new PrismaClient();

/** Credentials for the seeded platform owner. Change these before deploying. */
const OWNER = {
  email: process.env.SEED_OWNER_EMAIL ?? "owner@leornian.local",
  password: process.env.SEED_OWNER_PASSWORD ?? "Owner@12345",
  fullName: "Platform Owner",
  universityId: "OWNER001",
};

/** Every seeded university account shares this password. */
const DEMO_PASSWORD = "Demo@12345";

const MONTHS_OF_HISTORY = 8;

/** Deterministic PRNG so repeated seeds produce the same dataset. */
const makeRandom = (seed: number) => {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
};

const random = makeRandom(20260806);

const randomInt = (min: number, max: number) =>
  Math.floor(random() * (max - min + 1)) + min;

const startOfMonth = (date: Date, offset = 0) =>
  new Date(date.getFullYear(), date.getMonth() + offset, 1);

const UNIVERSITIES = [
  {
    name: "New Cairo Technological University",
    code: "NCTU",
    email: "info@nctu.edu.eg",
    phone: "+20 2 1111 2222",
    website: "https://nctu.edu.eg",
    address: "New Cairo, Cairo Governorate",
    joinedMonthsAgo: 7,
    admins: 3,
    students: 24,
  },
  {
    name: "Cairo University",
    code: "CU",
    email: "admin@cu.edu.eg",
    phone: "+20 2 3567 8901",
    website: "https://cu.edu.eg",
    address: "Giza, Cairo Governorate",
    joinedMonthsAgo: 7,
    admins: 4,
    students: 30,
  },
  {
    name: "Alexandria University",
    code: "AU",
    email: "admin@alexu.edu.eg",
    phone: "+20 3 9876 5432",
    website: "https://alexu.edu.eg",
    address: "Alexandria",
    joinedMonthsAgo: 6,
    admins: 3,
    students: 18,
  },
  {
    name: "Ain Shams University",
    code: "ASU",
    email: "admin@asu.edu.eg",
    phone: "+20 2 5555 1234",
    website: "https://asu.edu.eg",
    address: "Abbasia, Cairo",
    joinedMonthsAgo: 5,
    admins: 2,
    students: 15,
  },
  {
    name: "Mansoura University",
    code: "MU",
    email: "admin@mans.edu.eg",
    phone: "+20 50 2222 3333",
    website: "https://mans.edu.eg",
    address: "Mansoura, Dakahlia",
    joinedMonthsAgo: 4,
    admins: 3,
    students: 20,
  },
  {
    name: "Helwan University",
    code: "HU",
    email: "admin@helwan.edu.eg",
    phone: "+20 2 4444 9999",
    website: "https://helwan.edu.eg",
    address: "Helwan, Cairo",
    joinedMonthsAgo: 0,
    admins: 1,
    students: 8,
  },
  {
    name: "Assiut University",
    code: "AUN",
    email: "admin@aun.edu.eg",
    phone: "+20 88 2411 111",
    website: "https://aun.edu.eg",
    address: "Assiut",
    joinedMonthsAgo: 5,
    admins: 1,
    students: 6,
  },
  {
    name: "Tanta University",
    code: "TU",
    email: "admin@tanta.edu.eg",
    phone: "+20 40 3344 556",
    website: "https://tanta.edu.eg",
    address: "Tanta, Gharbia",
    joinedMonthsAgo: 3,
    admins: 2,
    students: 12,
  },
];

const FIRST_NAMES = [
  "Ahmed", "Sara", "Mohamed", "Fatma", "Omar", "Nour", "Youssef", "Mariam",
  "Khaled", "Hana", "Mostafa", "Salma", "Kareem", "Aya", "Tarek", "Dina",
  "Hassan", "Rana", "Amr", "Yasmin", "Ali", "Layla", "Ibrahim", "Malak",
  "Ziad", "Habiba", "Adel", "Nada", "Sherif", "Farida",
];

const LAST_NAMES = [
  "Hassan", "Mahmoud", "Ali", "Ibrahim", "Said", "Fouad", "Nasser", "Kamal",
  "Sabry", "Zaki", "Farid", "Rashad", "Gaber", "Lotfy", "Shafik", "Adel",
];

const DEPARTMENTS = [
  "Computer Science",
  "Electrical Engineering",
  "Mechanical Engineering",
  "Business Administration",
  "Pharmacy",
  "Medicine",
];

const JOB_TITLES = [
  "Lecturer",
  "Assistant Professor",
  "Associate Professor",
  "Professor",
  "Teaching Assistant",
];

const SEMESTERS = ["Fall 2025", "Spring 2026", "Fall 2026"];

/** Each department sits under one faculty, so seeded profiles stay coherent. */
const FACULTY_BY_DEPARTMENT: Record<string, string> = {
  "Computer Science": "Faculty of Computers and Information",
  "Electrical Engineering": "Faculty of Engineering",
  "Mechanical Engineering": "Faculty of Engineering",
  "Business Administration": "Faculty of Commerce",
  Pharmacy: "Faculty of Pharmacy",
  Medicine: "Faculty of Medicine",
};

/* --------------------------- Academic timetable demo --------------------------- */

/**
 * A fixed cohort the lecture timetable can be demonstrated against. Everything
 * here is deterministic — the random students above are useful for volume, but
 * a timetable demo needs a student whose academic address is known in advance.
 *
 * Seeded into two universities so cross-tenant isolation can be shown: the CU
 * cohort has the identical academic address and must never see NCTU lectures.
 */
const DEMO_SCHEDULE_CODES = ["NCTU", "CU"];

const DEMO_FACULTY = "Faculty of Engineering";
const DEMO_DEPARTMENT = "Mechatronics";
const DEMO_LEVEL = 2;
/** 1 = First Semester. The profile stores the label; the schedule stores the number. */
const DEMO_SEMESTER = 1;
const DEMO_SEMESTER_LABEL = "First Semester";

const DEMO_COURSES = [
  { code: "MEC201", name: "Electronics", credits: 3 },
  { code: "MEC202", name: "Control Systems", credits: 3 },
  { code: "MEC203", name: "Thermodynamics", credits: 2 },
  { code: "MEC204", name: "Digital Logic Design", credits: 3 },
  { code: "MEC205", name: "Robotics Lab", credits: 2 },
];

/** Instructors are INSTRUCTOR users; the academic title lives on AdminProfile.jobTitle. */
const DEMO_INSTRUCTORS = [
  {
    slug: "adel.mansour",
    fullName: "Adel Mansour",
    jobTitle: "Associate Professor",
    office: "B-311",
  },
  {
    slug: "hana.zaki",
    fullName: "Hana Zaki",
    jobTitle: "Lecturer",
    office: "B-315",
  },
];

/**
 * The week itself. Deliberately free of instructor and room clashes — the API
 * would reject them, so seeded data that contained one would be unreproducible.
 */
const DEMO_TIMETABLE = [
  { section: "A", course: "MEC201", instructor: 0, day: DayOfWeek.SUNDAY, start: "10:00", end: "12:00", room: "B-204" },
  { section: "A", course: "MEC202", instructor: 0, day: DayOfWeek.MONDAY, start: "09:00", end: "11:00", room: "B-204" },
  { section: "A", course: "MEC203", instructor: 1, day: DayOfWeek.TUESDAY, start: "11:00", end: "13:00", room: "C-101" },
  { section: "A", course: "MEC204", instructor: 1, day: DayOfWeek.WEDNESDAY, start: "08:00", end: "10:00", room: "B-204" },
  { section: "A", course: "MEC205", instructor: 0, day: DayOfWeek.THURSDAY, start: "12:00", end: "14:00", room: "LAB-2" },
  { section: "B", course: "MEC201", instructor: 0, day: DayOfWeek.SUNDAY, start: "12:00", end: "14:00", room: "B-204" },
  { section: "B", course: "MEC202", instructor: 1, day: DayOfWeek.MONDAY, start: "11:00", end: "13:00", room: "C-101" },
];

/**
 * The campus clock the timetable's wall-clock times are read in. Must match
 * NOTIFICATION_TIMEZONE, or the lecture placed below would not be where the
 * reminder generator looks for it.
 */
const CAMPUS_TIMEZONE = process.env.NOTIFICATION_TIMEZONE ?? "Africa/Cairo";

const WEEKDAYS = [
  DayOfWeek.SUNDAY,
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.FRIDAY,
  DayOfWeek.SATURDAY,
];

/**
 * The instant of a past occurrence of a weekly slot, on the campus clock.
 *
 * `weeksAgo: 0` is the most recent one that has already happened. Computed
 * rather than written down, for the same reason the development lecture is: a
 * seed with hardcoded dates stops demonstrating anything next month.
 */
const pastOccurrence = (
  day: DayOfWeek,
  clock: string,
  weeksAgo: number,
  now: Date
): Date => {
  const today = partsInZone(now, CAMPUS_TIMEZONE);
  const midnight = Date.UTC(today.year, today.month - 1, today.day);

  const wanted = WEEKDAYS.indexOf(day);
  const daysBack = ((new Date(midnight).getUTCDay() - wanted + 7) % 7) + weeksAgo * 7;

  const at = (offsetDays: number) => {
    const date = new Date(midnight - offsetDays * 86400000);
    const [hour = 0, minute = 0] = clock.split(":").map(Number);

    return zonedTimeToUtc(
      {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
        hour,
        minute,
      },
      CAMPUS_TIMEZONE
    );
  };

  const candidate = at(daysBack);

  // If today is the lecture's own weekday and the hour has not come round yet,
  // the "most recent" occurrence is the week before.
  return candidate > now ? at(daysBack + 7) : candidate;
};

/**
 * A lecture placed a short way into the future, so lecture reminders can be
 * watched being generated and delivered without editing the database by hand.
 *
 * Computed from whenever the seed runs rather than written as a fixed date:
 * the seed must stay useful next month. It lands 90 minutes out, which is far
 * enough ahead that the 30-minute and 10-minute rules are both still to come —
 * the 24-hour rule is already behind by then and is what
 * POST /api/notifications/dev/simulate exists for.
 *
 * Given its own instructor and its own room so it cannot clash with the fixed
 * week above, which the API would reject.
 */
const developmentLectureSlot = (now: Date) => {
  const read = (date: Date) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: CAMPUS_TIMEZONE,
      hourCycle: "h23",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(date);

    const value = (type: string) =>
      parts.find((part) => part.type === type)?.value ?? "";

    return {
      weekday: value("weekday"),
      hour: Number(value("hour")),
      minute: Number(value("minute")),
    };
  };

  const target = new Date(now.getTime() + 90 * 60 * 1000);
  const local = read(target);

  // Late evening would push the lecture's end past midnight, which the schedule
  // validator rejects (startTime must be before endTime). Park it at 10:00 the
  // following morning instead.
  const spillsOverMidnight = local.hour >= 21;

  const day = spillsOverMidnight
    ? read(new Date(target.getTime() + 24 * 60 * 60 * 1000)).weekday
    : local.weekday;

  const startHour = spillsOverMidnight ? 10 : local.hour;
  const startMinute = spillsOverMidnight ? 0 : local.minute;

  const pad = (value: number) => String(value).padStart(2, "0");

  const index = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(day);

  return {
    dayOfWeek: WEEKDAYS[index === -1 ? 0 : index]!,
    startTime: `${pad(startHour)}:${pad(startMinute)}`,
    endTime: `${pad((startHour + 2) % 24)}:${pad(startMinute)}`,
    imminent: !spillsOverMidnight,
  };
};

/**
 * Three students per demo university: one that matches the section A week, one
 * in section B, and one a level up — so filtering can be seen to exclude, not
 * just include.
 */
const DEMO_STUDENTS = [
  { key: "A1", slug: "mechatronics.a", fullName: "Mariam Fouad", level: DEMO_LEVEL, section: "A" },
  { key: "B1", slug: "mechatronics.b", fullName: "Youssef Nasser", level: DEMO_LEVEL, section: "B" },
  { key: "L3", slug: "mechatronics.l3", fullName: "Salma Kamal", level: 3, section: "A" },
  // Three more in section A, so the section A cohort is four people and an
  // attendance roll can show PRESENT, LATE and ABSENT side by side. With one
  // student in the cohort the three states cannot all be seen at once, and a
  // roll of one is not a roll anybody can read a report from.
  { key: "A2", slug: "mechatronics.a2", fullName: "Omar Sherif", level: DEMO_LEVEL, section: "A" },
  { key: "A3", slug: "mechatronics.a3", fullName: "Nadia Hassan", level: DEMO_LEVEL, section: "A" },
  { key: "A4", slug: "mechatronics.a4", fullName: "Karim Adel", level: DEMO_LEVEL, section: "A" },
];

const pick = <T>(items: T[]) => items[randomInt(0, items.length - 1)]!;

/** 14 digits, shaped like an Egyptian national ID. Fake, but well-formed. */
const fakeNationalId = (birthDate: Date) => {
  const century = birthDate.getUTCFullYear() < 2000 ? "2" : "3";
  const yy = String(birthDate.getUTCFullYear() % 100).padStart(2, "0");
  const mm = String(birthDate.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(birthDate.getUTCDate()).padStart(2, "0");
  const serial = String(randomInt(0, 9999999)).padStart(7, "0");
  return `${century}${yy}${mm}${dd}${serial}`;
};

const fakePhone = () => `+201${randomInt(0, 9)}${String(randomInt(0, 99999999)).padStart(8, "0")}`;

const fakeBirthDate = () =>
  new Date(
    Date.UTC(randomInt(1998, 2006), randomInt(0, 11), randomInt(1, 28))
  );

const nameFor = (index: number) =>
  `${FIRST_NAMES[index % FIRST_NAMES.length]} ${
    LAST_NAMES[Math.floor(index / FIRST_NAMES.length) % LAST_NAMES.length]
  }`;

const slugify = (value: string) =>
  value.toLowerCase().replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "");

/**
 * Clears every table this script owns so re-seeding is repeatable.
 * Order matters: children before parents.
 */
async function wipe() {
  await prisma.attendance.deleteMany();
  await prisma.session.deleteMany();
  await prisma.lectureSchedule.deleteMany();
  await prisma.course.deleteMany();
  await prisma.studentProfile.deleteMany();
  await prisma.adminProfile.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

async function main() {
  // Before anything else, and before any connection is opened: this script
  // wipes every table it owns and writes credentials that are committed to the
  // repository. Checked on NODE_ENV alone — SEED_KEEP_EXISTING does not soften
  // it, because the demo data is as unwelcome in production as the deletion is.
  assertSeedAllowed();

  console.log("🌱 Seeding Leornian platform data...\n");

  if (process.env.SEED_KEEP_EXISTING !== "true") {
    console.log("🧹 Clearing existing data (set SEED_KEEP_EXISTING=true to skip)");
    await wipe();
  }

  const now = new Date();
  const devLecture = developmentLectureSlot(now);
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const ownerHash = await bcrypt.hash(OWNER.password, 10);

  /* ------------------------------- Platform owner -------------------------------- */

  const platformOrg = await prisma.organization.upsert({
    where: { code: "LEORNIAN" },
    update: {},
    create: {
      name: "Leornian Platform",
      code: "LEORNIAN",
      email: "hello@leornian.local",
      website: "https://leornian.local",
      address: "Cairo, Egypt",
      createdAt: startOfMonth(now, -MONTHS_OF_HISTORY),
    },
  });

  await prisma.user.upsert({
    where: { email: OWNER.email },
    update: { role: "SYSTEM_OWNER", isActive: true, isVerified: true },
    create: {
      universityId: OWNER.universityId,
      fullName: OWNER.fullName,
      email: OWNER.email,
      passwordHash: ownerHash,
      role: "SYSTEM_OWNER",
      isVerified: true,
      organizationId: platformOrg.id,
      createdAt: startOfMonth(now, -MONTHS_OF_HISTORY),
    },
  });

  console.log(`✅ Platform owner (${OWNER.email})`);

  /* -------------------------------- Universities --------------------------------- */

  let userCounter = 0;
  let totalUsers = 0;
  let totalCourses = 0;
  let totalSchedules = 0;
  let totalSessions = 0;

  for (const university of UNIVERSITIES) {
    const existing = await prisma.organization.findUnique({
      where: { code: university.code },
    });

    if (existing) {
      console.log(`↩︎  ${university.code} already exists, skipping`);
      continue;
    }

    const joinedAt = startOfMonth(now, -university.joinedMonthsAgo);

    const organization = await prisma.organization.create({
      data: {
        name: university.name,
        code: university.code,
        email: university.email,
        phone: university.phone,
        website: university.website,
        address: university.address,
        createdAt: joinedAt,
      },
    });

    /* --- Users: one super admin, some admins, some students --- */

    const superAdminName = nameFor(userCounter++);

    const superAdmin = await prisma.user.create({
      data: {
        universityId: `${university.code}-ADM-001`,
        fullName: superAdminName,
        email: `${slugify(superAdminName)}@${university.code.toLowerCase()}.edu.eg`,
        passwordHash,
        role: "UNIVERSITY_ADMIN",
        isVerified: true,
        organizationId: organization.id,
        createdAt: joinedAt,
        adminProfile: {
          create: {
            jobTitle: "Head of IT",
            office: "Administration Building",
          },
        },
      },
    });

    totalUsers += 1;

    const adminIds: string[] = [superAdmin.id];

    for (let index = 0; index < university.admins; index += 1) {
      const fullName = nameFor(userCounter++);

      const admin = await prisma.user.create({
        data: {
          universityId: `${university.code}-ADM-${String(index + 2).padStart(3, "0")}`,
          fullName,
          email: `${slugify(fullName)}.${index + 2}@${university.code.toLowerCase()}.edu.eg`,
          passwordHash,
          role: "INSTRUCTOR",
          isVerified: true,
          isActive: random() > 0.1,
          organizationId: organization.id,
          createdAt: new Date(joinedAt.getTime() + randomInt(1, 40) * 86400000),
          adminProfile: {
            create: {
              jobTitle: pick(JOB_TITLES),
              office: `Room ${randomInt(100, 450)}`,
            },
          },
        },
      });

      adminIds.push(admin.id);
      totalUsers += 1;
    }

    for (let index = 0; index < university.students; index += 1) {
      const fullName = nameFor(userCounter++);
      const department = pick(DEPARTMENTS);
      const birthDate = fakeBirthDate();

      // A quarter of students have registered but not filled their profile in
      // yet — that is the state a fresh registration lands in.
      const profileCompleted = random() > 0.25;
      const createdAt = new Date(
        joinedAt.getTime() + randomInt(1, 90) * 86400000
      );

      await prisma.user.create({
        data: {
          universityId: `${university.code}-${randomInt(2022, 2026)}-${String(index + 1).padStart(4, "0")}`,
          fullName,
          email: `${slugify(fullName)}.${index + 1}@student.${university.code.toLowerCase()}.edu.eg`,
          passwordHash,
          role: "STUDENT",
          isVerified: random() > 0.2,
          isActive: random() > 0.05,
          organizationId: organization.id,
          createdAt,
          studentProfile: {
            create: profileCompleted
              ? {
                  faculty: FACULTY_BY_DEPARTMENT[department]!,
                  department,
                  level: randomInt(1, 4),
                  semester: pick(SEMESTERS),
                  section: String.fromCharCode(65 + randomInt(0, 3)),
                  groupName: `Group ${randomInt(1, 6)}`,
                  academicYear: "2025/2026",
                  phoneNumber: fakePhone(),
                  nationalId: fakeNationalId(birthDate),
                  dateOfBirth: birthDate,
                  status: "COMPLETED",
                  completedAt: new Date(
                    createdAt.getTime() + randomInt(1, 14) * 86400000
                  ),
                }
              : {},
          },
        },
      });

      totalUsers += 1;
    }

    /* --- A few courses per university --- */

    const courseCount = randomInt(3, 6);

    for (let index = 0; index < courseCount; index += 1) {
      const department = pick(DEPARTMENTS);

      await prisma.course.create({
        data: {
          courseCode: `${department.slice(0, 2).toUpperCase()}${randomInt(100, 499)}-${index}`,
          courseName: `${department} ${["Fundamentals", "Advanced Topics", "Lab", "Seminar"][index % 4]}`,
          description: `${department} course at ${university.name}.`,
          semester: pick(SEMESTERS),
          department,
          credits: randomInt(2, 4),
          createdById: pick(adminIds),
          organizationId: organization.id,
          createdAt: new Date(joinedAt.getTime() + randomInt(1, 60) * 86400000),
        },
      });

      totalCourses += 1;
    }

    /* --- Demo academic timetable (a fixed, matchable cohort) --- */

    if (DEMO_SCHEDULE_CODES.includes(university.code)) {
      const domain = university.code.toLowerCase();

      // Instructors: INSTRUCTOR users, titled through AdminProfile.jobTitle.
      const instructors = [];

      for (const [index, instructor] of DEMO_INSTRUCTORS.entries()) {
        instructors.push(
          await prisma.user.create({
            data: {
              universityId: `${university.code}-ADM-DR${index + 1}`,
              fullName: instructor.fullName,
              email: `${instructor.slug}@${domain}.edu.eg`,
              passwordHash,
              role: "INSTRUCTOR",
              isVerified: true,
              organizationId: organization.id,
              createdAt: joinedAt,
              adminProfile: {
                create: {
                  jobTitle: instructor.jobTitle,
                  office: instructor.office,
                },
              },
            },
          })
        );

        totalUsers += 1;
      }

      const demoCourses = new Map<string, string>();

      for (const course of DEMO_COURSES) {
        const record = await prisma.course.create({
          data: {
            courseCode: course.code,
            courseName: course.name,
            description: `${course.name} for ${DEMO_DEPARTMENT} level ${DEMO_LEVEL}.`,
            semester: DEMO_SEMESTER_LABEL,
            department: DEMO_DEPARTMENT,
            credits: course.credits,
            createdById: superAdmin.id,
            organizationId: organization.id,
            createdAt: joinedAt,
          },
        });

        demoCourses.set(course.code, record.id);
        totalCourses += 1;
      }

      // Keyed by course + section, so the open sessions below can name the
      // exact lecture they are taking attendance for. `courseId` travels with
      // it because a session copies the course from its lecture — see
      // SessionService.createSession; a session written here without it would
      // be invisible to every course-level attendance query.
      const demoSchedules = new Map<
        string,
        { id: string; room: string; courseId: string }
      >();

      for (const entry of DEMO_TIMETABLE) {
        const schedule = await prisma.lectureSchedule.create({
          data: {
            organizationId: organization.id,
            courseId: demoCourses.get(entry.course)!,
            instructorId: instructors[entry.instructor]!.id,
            faculty: DEMO_FACULTY,
            department: DEMO_DEPARTMENT,
            level: DEMO_LEVEL,
            semester: DEMO_SEMESTER,
            section: entry.section,
            dayOfWeek: entry.day,
            startTime: entry.start,
            endTime: entry.end,
            room: entry.room,
            createdAt: joinedAt,
          },
        });

        demoSchedules.set(`${entry.course}:${entry.section}`, {
          id: schedule.id,
          room: schedule.room,
          courseId: schedule.courseId,
        });

        totalSchedules += 1;
      }

      /* --- Two open sessions, so room-scoped QR context can be seen working --- */

      // Opened by each lecture's own instructor, and each carries the room of
      // the lecture behind it, exactly as SessionService stamps it.
      const openSessions: { course: string; section: string; instructor: number }[] = [
        { course: "MEC201", section: "A", instructor: 0 }, // B-204 — visible
        { course: "MEC203", section: "A", instructor: 1 }, // C-101 — not
      ];

      for (const open of openSessions) {
        const schedule = demoSchedules.get(`${open.course}:${open.section}`)!;

        await prisma.session.create({
          data: {
            title: `${open.course} — section ${open.section}`,
            createdById: instructors[open.instructor]!.id,
            organizationId: organization.id,
            lectureScheduleId: schedule.id,
            courseId: schedule.courseId,
            room: schedule.room,
          },
        });

        totalSessions += 1;
      }

      /* --- One lecture starting shortly, for testing reminders --- */

      const devInstructor = await prisma.user.create({
        data: {
          universityId: `${university.code}-ADM-DEV`,
          fullName: "Nour Reminder",
          email: `dev.reminder@${domain}.edu.eg`,
          passwordHash,
          role: "INSTRUCTOR",
          isVerified: true,
          organizationId: organization.id,
          createdAt: joinedAt,
          adminProfile: { create: { jobTitle: "Lecturer", office: "B-401" } },
        },
      });

      totalUsers += 1;

      await prisma.lectureSchedule.create({
        data: {
          organizationId: organization.id,
          courseId: demoCourses.get("MEC205")!,
          instructorId: devInstructor.id,
          faculty: DEMO_FACULTY,
          department: DEMO_DEPARTMENT,
          level: DEMO_LEVEL,
          semester: DEMO_SEMESTER,
          // Section B, so the seeded section B student is in its cohort.
          section: "B",
          dayOfWeek: devLecture.dayOfWeek,
          startTime: devLecture.startTime,
          endTime: devLecture.endTime,
          // Its own instructor and its own room: it is placed by the clock
          // rather than by the timetable, so it must not be able to clash.
          room: "DEV-LAB",
          createdAt: joinedAt,
        },
      });

      totalSchedules += 1;

      // Students whose profiles are already COMPLETED, so the personalised
      // timetable endpoint works the moment they sign in.
      const demoStudents: { id: string; level: number; section: string }[] = [];

      for (const student of DEMO_STUDENTS) {
        const birthDate = fakeBirthDate();

        const record = await prisma.user.create({
          data: {
            universityId: `${university.code}-DEMO-${student.key}`,
            fullName: student.fullName,
            email: `${student.slug}@student.${domain}.edu.eg`,
            passwordHash,
            role: "STUDENT",
            isVerified: true,
            organizationId: organization.id,
            createdAt: joinedAt,
            studentProfile: {
              create: {
                faculty: DEMO_FACULTY,
                department: DEMO_DEPARTMENT,
                level: student.level,
                semester: DEMO_SEMESTER_LABEL,
                section: student.section,
                groupName: `Group ${student.section}1`,
                academicYear: "2025/2026",
                phoneNumber: fakePhone(),
                nationalId: fakeNationalId(birthDate),
                dateOfBirth: birthDate,
                status: "COMPLETED",
                completedAt: joinedAt,
              },
            },
          },
        });

        demoStudents.push({
          id: record.id,
          level: student.level,
          section: student.section,
        });

        totalUsers += 1;
      }

      /* --- Attendance history, covering every lifecycle state --- */

      // The section A / level 2 cohort — exactly who the MEC201 section A
      // lecture addresses, and therefore exactly who its roll is called over.
      const sectionA = demoStudents.filter(
        (student) => student.level === DEMO_LEVEL && student.section === "A"
      );

      const mec201 = demoSchedules.get("MEC201:A")!;
      const mec201Instructor = instructors[0]!.id;

      /**
       * Four Sundays, deliberately not four sessions.
       *
       * Week 3 has no session at all, and that gap is the point: it is the only
       * way to see NOT_RECORDED, which exists precisely because no row exists.
       * A seed in which every occurrence was recorded could not demonstrate the
       * one state the lifecycle was built to keep separate from ABSENT.
       */
      const history: {
        weeksAgo: number;
        closeReason: SessionCloseReason;
        /** Index into sectionA; everyone else on the roll is marked absent. */
        present: number[];
        late: number[];
      }[] = [
        { weeksAgo: 3, closeReason: SessionCloseReason.MANUAL, present: [0, 1], late: [2] },
        // weeksAgo 2 is missing on purpose → NOT_RECORDED.
        {
          weeksAgo: 1,
          // The instructor walked out without closing it; the sweep did.
          closeReason: SessionCloseReason.AUTO_STALE,
          present: [0, 2],
          late: [],
        },
        { weeksAgo: 0, closeReason: SessionCloseReason.MANUAL, present: [0, 1, 2, 3], late: [] },
      ];

      for (const week of history) {
        const startTime = pastOccurrence("SUNDAY", "10:00", week.weeksAgo, now);
        const endTime = new Date(startTime.getTime() + 120 * 60_000);
        // The roll is called shortly after the session closes, as the worker
        // would do it.
        const sweptAt = new Date(endTime.getTime() + 5 * 60_000);

        const session = await prisma.session.create({
          data: {
            title: `MEC201 — section A`,
            createdById: mec201Instructor,
            organizationId: organization.id,
            lectureScheduleId: mec201.id,
            courseId: mec201.courseId,
            room: mec201.room,
            status: "CLOSED",
            startTime,
            endTime,
            closeReason: week.closeReason,
            absencesSweptAt: sweptAt,
            createdAt: startTime,
          },
        });

        totalSessions += 1;

        for (const [index, student] of sectionA.entries()) {
          const isPresent = week.present.includes(index);
          const isLate = week.late.includes(index);

          if (!isPresent && !isLate) {
            // ABSENT: written by the roll call, not by a scan, so its scanTime
            // is the moment the roll was called.
            await prisma.attendance.create({
              data: {
                studentId: student.id,
                sessionId: session.id,
                status: AttendanceStatus.ABSENT,
                scanTime: sweptAt,
              },
            });

            continue;
          }

          // PRESENT within the threshold, LATE past it. The threshold is
          // ATTENDANCE_LATE_AFTER_MINUTES (15 by default); 5 and 25 minutes sit
          // clearly either side of it, so the demo does not depend on the exact
          // value being left alone.
          await prisma.attendance.create({
            data: {
              studentId: student.id,
              sessionId: session.id,
              status: isLate ? AttendanceStatus.LATE : AttendanceStatus.PRESENT,
              scanTime: new Date(
                startTime.getTime() + (isLate ? 25 : 5) * 60_000
              ),
            },
          });
        }
      }

      /**
       * One session left in PENDING: open, but its lecture is over.
       *
       * Opened five minutes past its own two-hour length, so it sits inside the
       * stale grace rather than past it. This state is genuinely transient — if
       * the attendance worker is running it will auto-close this session to
       * AUTO_STALE once the grace expires, which is not the seed decaying but
       * the lifecycle working.
       */
      const mec202 = demoSchedules.get("MEC202:A")!;

      await prisma.session.create({
        data: {
          title: "MEC202 — section A",
          createdById: mec201Instructor,
          organizationId: organization.id,
          lectureScheduleId: mec202.id,
          courseId: mec202.courseId,
          room: mec202.room,
          status: "ACTIVE",
          startTime: new Date(now.getTime() - 125 * 60_000),
          createdAt: new Date(now.getTime() - 125 * 60_000),
        },
      });

      totalSessions += 1;
    }

    console.log(
      `✅ ${university.code.padEnd(5)} ${university.name} — super admin: ${superAdmin.email}`
    );
  }

  console.log("\n────────────────────────────────────────");
  console.log(`Organizations : ${UNIVERSITIES.length + 1}`);
  console.log(`Users         : ${totalUsers + 1}`);
  console.log(`Courses       : ${totalCourses}`);
  console.log(`Lectures      : ${totalSchedules}`);
  console.log(`Open sessions : ${totalSessions}`);
  console.log("────────────────────────────────────────");
  console.log("\n🔑 Sign in to the dashboard with:");
  console.log(`   Email    : ${OWNER.email}`);
  console.log(`   Password : ${OWNER.password}`);
  console.log(`\n   University accounts use password: ${DEMO_PASSWORD}\n`);

  console.log("🗓️  Timetable demo accounts (all use the password above):");
  console.log(
    `   ${DEMO_FACULTY} / ${DEMO_DEPARTMENT} / level ${DEMO_LEVEL} / ${DEMO_SEMESTER_LABEL}`
  );

  for (const code of DEMO_SCHEDULE_CODES) {
    const domain = code.toLowerCase();
    console.log(`   ${code}:`);
    console.log(`     student  (section A) : mechatronics.a@student.${domain}.edu.eg`);
    console.log(`     student  (section B) : mechatronics.b@student.${domain}.edu.eg`);
    console.log(`     student  (level 3)   : mechatronics.l3@student.${domain}.edu.eg`);
    console.log(`     instructor (INSTRUCTOR)   : adel.mansour@${domain}.edu.eg`);
    console.log(`     instructor (INSTRUCTOR)   : hana.zaki@${domain}.edu.eg`);
    console.log(`     instructor (reminder): dev.reminder@${domain}.edu.eg`);
  }

  console.log("\n📋 Attendance lifecycle coverage (per demo university):");
  console.log("   GET /api/schedules/<MEC201 section A id>/attendance-log");
  console.log("   PRESENT / LATE   : scans 5 and 25 minutes after each session opened");
  console.log("   ABSENT           : section A students with no scan, written by the roll call");
  console.log("   AUTO_STALE       : the session one week ago, closed by the sweep");
  console.log("   MANUAL           : the sessions three weeks and this week");
  console.log("   NOT_RECORDED     : two weeks ago — no session was ever opened");
  console.log("   PENDING          : MEC202/A, open now with its lecture already over");
  console.log("                      Deliberately not scannable:");
  console.log("                      the window is enforced on read and on write, not by the");
  console.log("                      the worker closes it as AUTO_STALE.");
  console.log("   The two open sessions above stay scannable for two hours from seeding —");
  console.log("   the length of their lecture. Re-run the seed to refresh the demo.");

  console.log("\n🔔 Lecture reminder demo (Robotics Lab, room DEV-LAB, section B):");
  console.log(
    `   ${devLecture.dayOfWeek} ${devLecture.startTime}–${devLecture.endTime} (${CAMPUS_TIMEZONE})${
      devLecture.imminent ? " — about 90 minutes from now" : " — tomorrow morning"
    }`
  );
  console.log(
    "   Its 30-minute and 10-minute reminders will be generated by the worker."
  );
  console.log(
    "   For the 24-hour one, POST /api/notifications/dev/simulate as a super admin."
  );

  console.log("");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
