import {
  PrismaClient,
  BillingCycle,
  DayOfWeek,
  SubscriptionStatus,
} from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

/** Credentials for the seeded platform owner. Change these before deploying. */
const OWNER = {
  email: process.env.SEED_OWNER_EMAIL ?? "owner@wall-e.io",
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

const PLANS = [
  {
    name: "Free",
    description: "Evaluation tier for pilots and demos.",
    monthlyPrice: 0,
    yearlyPrice: 0,
    maxUsers: 100,
    maxRobots: 1,
    maxCourses: 10,
    features: ["QR attendance", "1 robot", "Community support"],
  },
  {
    name: "Basic",
    description: "For a single faculty getting started.",
    monthlyPrice: 199,
    yearlyPrice: 1990,
    maxUsers: 2000,
    maxRobots: 3,
    maxCourses: 150,
    features: ["QR attendance", "3 robots", "Email support", "Basic analytics"],
  },
  {
    name: "Pro",
    description: "For universities running campus-wide attendance.",
    monthlyPrice: 499,
    yearlyPrice: 4990,
    maxUsers: 15000,
    maxRobots: 10,
    maxCourses: 800,
    features: [
      "Everything in Basic",
      "10 robots",
      "Advanced analytics",
      "Priority support",
      "Custom branding",
    ],
  },
  {
    name: "Enterprise",
    description: "Unlimited scale with a dedicated success manager.",
    monthlyPrice: 999,
    yearlyPrice: 9990,
    maxUsers: 100000,
    maxRobots: 50,
    maxCourses: 5000,
    features: [
      "Everything in Pro",
      "50 robots",
      "SSO / SAML",
      "Dedicated manager",
      "99.9% uptime SLA",
    ],
  },
];

const UNIVERSITIES = [
  {
    name: "New Cairo Technological University",
    code: "NCTU",
    email: "info@nctu.edu.eg",
    phone: "+20 2 1111 2222",
    website: "https://nctu.edu.eg",
    address: "New Cairo, Cairo Governorate",
    plan: "Pro",
    cycle: BillingCycle.MONTHLY,
    status: SubscriptionStatus.ACTIVE,
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
    plan: "Enterprise",
    cycle: BillingCycle.YEARLY,
    status: SubscriptionStatus.ACTIVE,
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
    plan: "Pro",
    cycle: BillingCycle.MONTHLY,
    status: SubscriptionStatus.ACTIVE,
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
    plan: "Basic",
    cycle: BillingCycle.MONTHLY,
    status: SubscriptionStatus.ACTIVE,
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
    plan: "Enterprise",
    cycle: BillingCycle.MONTHLY,
    status: SubscriptionStatus.ACTIVE,
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
    plan: "Basic",
    cycle: BillingCycle.MONTHLY,
    status: SubscriptionStatus.TRIAL,
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
    plan: "Basic",
    cycle: BillingCycle.MONTHLY,
    status: SubscriptionStatus.CANCELLED,
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
    plan: "Pro",
    cycle: BillingCycle.MONTHLY,
    status: SubscriptionStatus.PAST_DUE,
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

/** Instructors are ADMIN users; the academic title lives on AdminProfile.jobTitle. */
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
  await prisma.payment.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.studentProfile.deleteMany();
  await prisma.adminProfile.deleteMany();
  await prisma.user.deleteMany();
  // Break the Organization -> Subscription link before deleting either side.
  await prisma.organization.updateMany({ data: { subscriptionId: null } });
  await prisma.subscription.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.subscriptionPlan.deleteMany();
}

async function main() {
  console.log("🌱 Seeding WALL-E platform data...\n");

  if (process.env.SEED_KEEP_EXISTING !== "true") {
    console.log("🧹 Clearing existing data (set SEED_KEEP_EXISTING=true to skip)");
    await wipe();
  }

  const now = new Date();
  const devLecture = developmentLectureSlot(now);
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const ownerHash = await bcrypt.hash(OWNER.password, 10);

  /* ------------------------------ Subscription plans ------------------------------ */

  const plans = new Map<string, { id: string; monthlyPrice: number; yearlyPrice: number }>();

  for (const plan of PLANS) {
    const record = await prisma.subscriptionPlan.upsert({
      where: { name: plan.name },
      update: {
        description: plan.description,
        monthlyPrice: plan.monthlyPrice,
        yearlyPrice: plan.yearlyPrice,
        maxUsers: plan.maxUsers,
        maxRobots: plan.maxRobots,
        maxCourses: plan.maxCourses,
        features: plan.features,
      },
      create: {
        name: plan.name,
        description: plan.description,
        monthlyPrice: plan.monthlyPrice,
        yearlyPrice: plan.yearlyPrice,
        maxUsers: plan.maxUsers,
        maxRobots: plan.maxRobots,
        maxCourses: plan.maxCourses,
        features: plan.features,
      },
    });

    plans.set(plan.name, {
      id: record.id,
      monthlyPrice: plan.monthlyPrice,
      yearlyPrice: plan.yearlyPrice,
    });
  }

  console.log(`✅ ${PLANS.length} subscription plans`);

  /* ------------------------------- Platform owner -------------------------------- */

  const platformOrg = await prisma.organization.upsert({
    where: { code: "WALLE" },
    update: {},
    create: {
      name: "WALL-E Platform",
      code: "WALLE",
      email: "hello@wall-e.io",
      website: "https://wall-e.io",
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
  let totalInvoices = 0;
  let totalPayments = 0;
  let totalCourses = 0;
  let totalSchedules = 0;

  for (const university of UNIVERSITIES) {
    const existing = await prisma.organization.findUnique({
      where: { code: university.code },
    });

    if (existing) {
      console.log(`↩︎  ${university.code} already exists, skipping`);
      continue;
    }

    const plan = plans.get(university.plan)!;
    const joinedAt = startOfMonth(now, -university.joinedMonthsAgo);
    const isYearly = university.cycle === BillingCycle.YEARLY;

    const periodStart = startOfMonth(now);
    const periodEnd = isYearly
      ? new Date(periodStart.getFullYear() + 1, periodStart.getMonth(), 1)
      : startOfMonth(now, 1);

    const subscription = await prisma.subscription.create({
      data: {
        planId: plan.id,
        status: university.status,
        billingCycle: university.cycle,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        trialEndsAt:
          university.status === SubscriptionStatus.TRIAL
            ? new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
            : null,
        // Recent enough to land inside the trailing-30-day churn window.
        cancelledAt:
          university.status === SubscriptionStatus.CANCELLED
            ? new Date(now.getTime() - 12 * 86400000)
            : null,
        createdAt: joinedAt,
      },
    });

    const organization = await prisma.organization.create({
      data: {
        name: university.name,
        code: university.code,
        email: university.email,
        phone: university.phone,
        website: university.website,
        address: university.address,
        subscriptionId: subscription.id,
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
        role: "UNIVERSITY_SUPER_ADMIN",
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
          role: "ADMIN",
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

      // Instructors: ADMIN users, titled through AdminProfile.jobTitle.
      const instructors = [];

      for (const [index, instructor] of DEMO_INSTRUCTORS.entries()) {
        instructors.push(
          await prisma.user.create({
            data: {
              universityId: `${university.code}-ADM-DR${index + 1}`,
              fullName: instructor.fullName,
              email: `${instructor.slug}@${domain}.edu.eg`,
              passwordHash,
              role: "ADMIN",
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

      for (const entry of DEMO_TIMETABLE) {
        await prisma.lectureSchedule.create({
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

        totalSchedules += 1;
      }

      /* --- One lecture starting shortly, for testing reminders --- */

      const devInstructor = await prisma.user.create({
        data: {
          universityId: `${university.code}-ADM-DEV`,
          fullName: "Nour Reminder",
          email: `dev.reminder@${domain}.edu.eg`,
          passwordHash,
          role: "ADMIN",
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
      for (const student of DEMO_STUDENTS) {
        const birthDate = fakeBirthDate();

        await prisma.user.create({
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

        totalUsers += 1;
      }
    }

    /* --- Billing history: one invoice + payment per elapsed period --- */

    if (university.status !== SubscriptionStatus.TRIAL) {
      const amount = isYearly ? plan.yearlyPrice : plan.monthlyPrice;
      const step = isYearly ? 12 : 1;

      // Cancelled accounts stop billing the month they left.
      const lastMonth =
        university.status === SubscriptionStatus.CANCELLED
          ? 1
          : 0;

      for (
        let monthsAgo = university.joinedMonthsAgo;
        monthsAgo >= lastMonth;
        monthsAgo -= step
      ) {
        if (amount === 0) continue;

        const issuedAt = startOfMonth(now, -monthsAgo);
        const dueDate = new Date(issuedAt.getTime() + 14 * 86400000);
        const isCurrentMonth = monthsAgo === 0;

        // A past-due account has stopped paying, so its last two invoices are
        // both outstanding.
        const isPastDue =
          university.status === SubscriptionStatus.PAST_DUE && monthsAgo <= 1;

        // The current month is mostly collected already, with one account left
        // awaiting payment so the invoice list shows every status.
        const awaitingPayment =
          isCurrentMonth && university.code === "ASU" && !isPastDue;
        const unpaid = isPastDue || awaitingPayment;

        // Current-month invoices settle a few days after issue, not on the due
        // date, which would be in the future.
        const paidAt = isCurrentMonth
          ? new Date(issuedAt.getTime() + 3 * 86400000)
          : dueDate;

        const tax = Math.round(amount * 0.14 * 100) / 100;

        const invoice = await prisma.invoice.create({
          data: {
            organizationId: organization.id,
            invoiceNumber: `INV-${issuedAt.getFullYear()}-${String(
              totalInvoices + 1
            ).padStart(4, "0")}`,
            amount,
            tax,
            total: amount + tax,
            currency: "USD",
            status: !unpaid
              ? "PAID"
              : dueDate < now
                ? "OVERDUE"
                : "SENT",
            dueDate,
            paidAt: unpaid ? null : paidAt,
            notes: `${university.plan} plan — ${
              isYearly ? "annual" : "monthly"
            } billing`,
            createdAt: issuedAt,
          },
        });

        totalInvoices += 1;

        if (!unpaid) {
          await prisma.payment.create({
            data: {
              organizationId: organization.id,
              invoiceId: invoice.id,
              amount: amount + tax,
              currency: "USD",
              status: "COMPLETED",
              paymentMethod: pick(["visa", "mastercard", "bank_transfer"]),
              transactionId: `txn_${organization.code.toLowerCase()}_${monthsAgo}_${randomInt(
                10000,
                99999
              )}`,
              description: `Payment for invoice ${invoice.invoiceNumber}`,
              paidAt,
              createdAt: paidAt,
            },
          });

          totalPayments += 1;
        }
      }
    }

    console.log(
      `✅ ${university.code.padEnd(5)} ${university.name} — ${university.plan}/${university.status} — super admin: ${superAdmin.email}`
    );
  }

  console.log("\n────────────────────────────────────────");
  console.log(`Organizations : ${UNIVERSITIES.length + 1}`);
  console.log(`Users         : ${totalUsers + 1}`);
  console.log(`Courses       : ${totalCourses}`);
  console.log(`Lectures      : ${totalSchedules}`);
  console.log(`Invoices      : ${totalInvoices}`);
  console.log(`Payments      : ${totalPayments}`);
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
    console.log(`     instructor (ADMIN)   : adel.mansour@${domain}.edu.eg`);
    console.log(`     instructor (ADMIN)   : hana.zaki@${domain}.edu.eg`);
    console.log(`     instructor (reminder): dev.reminder@${domain}.edu.eg`);
  }

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
