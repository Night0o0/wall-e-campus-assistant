import { describe, expect, it } from "vitest";
import { NotificationRepository } from "../src/repositories/notification.repository.js";
import { StudentRepository } from "../src/repositories/student.repository.js";
import {
  CampusEventNotifier,
  MaterialEvent,
  ScheduleEvent,
} from "../src/services/campus-events.notifier.js";

/**
 * Cohort event notifications: who is targeted, that a tenant boundary is never
 * crossed, and that a stable per-recipient key makes a repeat a no-op.
 *
 * Database-free: the student targeting query and the idempotent insert are both
 * replaced by in-memory doubles that record what the notifier asked for.
 */

const ORG_A = "org-a";
const ORG_B = "org-b";

/** A student the fake audience query returns, with their free-text semester. */
type FakeStudent = { userId: string; organizationId: string; semester: string | null };

const build = (options: {
  audience?: FakeStudent[];
  captureQuery?: (criteria: Record<string, unknown>) => void;
} = {}) => {
  const drafts: Record<string, unknown>[] = [];

  class FakeStudents extends StudentRepository {
    override async findApprovedAudience(criteria: {
      organizationId: string;
      faculty: string;
      department: string;
      level: number;
      section: string | null;
    }) {
      options.captureQuery?.(criteria);
      return (options.audience ?? []).map((student) => ({
        semester: student.semester,
        user: { id: student.userId, organizationId: student.organizationId },
      })) as never;
    }
  }

  class FakeNotifications extends NotificationRepository {
    override async createEventNotifications(rows: unknown[]) {
      drafts.push(...(rows as Record<string, unknown>[]));
      return rows.length;
    }
  }

  return {
    drafts,
    notifier: new CampusEventNotifier(new FakeStudents(), new FakeNotifications()),
  };
};

const MATERIAL: MaterialEvent = {
  materialId: "mat-1",
  organizationId: ORG_A,
  courseId: "course-1",
  courseCode: "CS201",
  courseName: "Data Structures",
  title: "Lectures",
  faculty: "Faculty of Engineering",
  department: "Mechatronics",
  level: 2,
  semester: 1,
  section: "A",
};

const SCHEDULE: ScheduleEvent = {
  scheduleId: "sch-1",
  organizationId: ORG_A,
  courseId: "course-1",
  courseCode: "CS201",
  courseName: "Data Structures",
  faculty: "Faculty of Engineering",
  department: "Mechatronics",
  level: 2,
  semester: 1,
  section: "A",
  dayOfWeek: "SUNDAY",
  startTime: "09:00",
  endTime: "10:30",
  room: "B201",
};

describe("material publication notifications", () => {
  it("targets the matching approved cohort, one keyed row each", async () => {
    const { notifier, drafts } = build({
      audience: [
        { userId: "s1", organizationId: ORG_A, semester: "First Semester" },
        { userId: "s2", organizationId: ORG_A, semester: "First Semester" },
      ],
    });

    const created = await notifier.materialPublished(MATERIAL);

    expect(created).toBe(2);
    expect(drafts.map((d) => d.userId).sort()).toEqual(["s1", "s2"]);
    expect(drafts.map((d) => d.eventKey).sort()).toEqual([
      "material-published:mat-1:s1",
      "material-published:mat-1:s2",
    ]);
    expect(drafts.every((d) => d.type === "COURSE_MATERIAL_PUBLISHED")).toBe(true);
    // The stored tenant is the material's own, never anything else.
    expect(drafts.every((d) => d.organizationId === ORG_A)).toBe(true);
  });

  it("drops students whose semester does not match the material", async () => {
    const { notifier, drafts } = build({
      audience: [
        { userId: "s1", organizationId: ORG_A, semester: "First Semester" },
        { userId: "s2", organizationId: ORG_A, semester: "Second Semester" },
        { userId: "s3", organizationId: ORG_A, semester: "2026" }, // unreadable
      ],
    });

    const created = await notifier.materialPublished(MATERIAL); // semester 1

    expect(created).toBe(1);
    expect(drafts.map((d) => d.userId)).toEqual(["s1"]);
  });

  it("never crosses a tenant boundary, even if the query leaks one", async () => {
    const { notifier, drafts } = build({
      audience: [
        { userId: "s1", organizationId: ORG_A, semester: "First Semester" },
        { userId: "intruder", organizationId: ORG_B, semester: "First Semester" },
      ],
    });

    await notifier.materialPublished(MATERIAL);

    expect(drafts.map((d) => d.userId)).toEqual(["s1"]);
  });

  it("passes a null section through as 'every section'", async () => {
    let seen: Record<string, unknown> | null = null;
    const { notifier } = build({
      audience: [],
      captureQuery: (criteria) => (seen = criteria),
    });

    await notifier.materialPublished({ ...MATERIAL, section: null });

    expect(seen!.section).toBeNull();
  });

  it("writes nothing when the cohort is empty", async () => {
    const { notifier, drafts } = build({ audience: [] });
    expect(await notifier.materialPublished(MATERIAL)).toBe(0);
    expect(drafts).toEqual([]);
  });
});

describe("schedule notifications", () => {
  const audience = [
    { userId: "s1", organizationId: ORG_A, semester: "First Semester" },
  ];

  it("keys a created lecture per recipient", async () => {
    const { notifier, drafts } = build({ audience });
    await notifier.scheduleCreated(SCHEDULE);
    expect(drafts[0]).toMatchObject({
      type: "SCHEDULE_CREATED",
      eventKey: "schedule-created:sch-1:s1",
    });
  });

  it("keys a cancelled lecture per recipient", async () => {
    const { notifier, drafts } = build({ audience });
    await notifier.scheduleCancelled(SCHEDULE);
    expect(drafts[0]).toMatchObject({
      type: "SCHEDULE_CANCELLED",
      eventKey: "schedule-cancelled:sch-1:s1",
    });
  });

  it("gives an update a fingerprint that is stable for the same change", async () => {
    const a = build({ audience });
    await a.notifier.scheduleUpdated(SCHEDULE);
    const b = build({ audience });
    await b.notifier.scheduleUpdated(SCHEDULE);

    expect(a.drafts[0].eventKey).toBe(b.drafts[0].eventKey);
    expect(a.drafts[0].type).toBe("SCHEDULE_UPDATED");
  });

  it("gives a different change a different fingerprint", async () => {
    const a = build({ audience });
    await a.notifier.scheduleUpdated(SCHEDULE);
    const b = build({ audience });
    await b.notifier.scheduleUpdated({ ...SCHEDULE, room: "C303" });

    expect(a.drafts[0].eventKey).not.toBe(b.drafts[0].eventKey);
  });
});
