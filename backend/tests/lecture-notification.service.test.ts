import { NotificationStatus, NotificationType } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { LectureNotificationService } from "../src/services/lecture-notification.service.js";
import { NotificationDispatcher } from "../src/services/notification.dispatcher.js";
import {
  FakeDeviceTokenRepository,
  FakeNotificationRepository,
  FakeScheduleRepository,
  FakeStudentRepository,
  ORG_A,
  ORG_B,
  ScheduleOptions,
  StudentFixture,
  makeSchedule,
  makeStudent,
} from "./helpers/fakes.js";

/**
 * Generation is tested in UTC so the expected instants can be written down
 * rather than computed by the code under test. Time-zone handling — which is
 * what turns a wall-clock "12:00" into an instant — is covered on its own in
 * occurrence.util.test.ts, against Cairo's summer and winter offsets.
 */
const TZ = "UTC";

/** A Wednesday. The lecture below falls on the Sunday four days later. */
const NOW = new Date("2026-08-05T10:00:00.000Z");
const OCCURRENCE = new Date("2026-08-09T12:00:00.000Z");
const WEEK = 7 * 24 * 60;

const INSTRUCTOR = "instructor-1";
const STUDENT_IN_COHORT = "student-b1";

const build = (options: {
  schedules?: ScheduleOptions[];
  students?: StudentFixture[];
}) => {
  const notifications = new FakeNotificationRepository();

  const service = new LectureNotificationService(
    new FakeScheduleRepository(
      (options.schedules ?? [{}]).map((schedule) => makeSchedule(schedule))
    ),
    new FakeStudentRepository(options.students ?? []),
    notifications,
    TZ
  );

  return { service, notifications };
};

const generate = async (options: Parameters<typeof build>[0]) => {
  const { service, notifications } = build(options);

  const result = await service.generateUpcoming({
    now: NOW,
    horizonMinutes: WEEK,
  });

  return { service, notifications, result };
};

describe("lecture reminder generation", () => {
  let cohortStudent: StudentFixture;

  beforeEach(() => {
    cohortStudent = makeStudent(STUDENT_IN_COHORT);
  });

  it("gives the instructor a reminder 24 hours before the lecture", async () => {
    const { notifications } = await generate({ students: [cohortStudent] });

    const reminders = notifications.rows.filter(
      (row) => row.type === NotificationType.LECTURE_INSTRUCTOR_24H
    );

    expect(reminders).toHaveLength(1);
    expect(reminders[0]!.userId).toBe(INSTRUCTOR);
    expect(reminders[0]!.occurrenceStartsAt).toEqual(OCCURRENCE);
    // 24 hours before the lecture starts, to the minute.
    expect(reminders[0]!.scheduledFor).toEqual(
      new Date("2026-08-08T12:00:00.000Z")
    );
    expect(reminders[0]!.status).toBe(NotificationStatus.PENDING);
  });

  it("gives the instructor a second reminder 30 minutes before the lecture", async () => {
    const { notifications } = await generate({ students: [cohortStudent] });

    const reminders = notifications.rows.filter(
      (row) => row.type === NotificationType.LECTURE_INSTRUCTOR_30M
    );

    expect(reminders).toHaveLength(1);
    expect(reminders[0]!.userId).toBe(INSTRUCTOR);
    expect(reminders[0]!.scheduledFor).toEqual(
      new Date("2026-08-09T11:30:00.000Z")
    );
  });

  it("gives a student in the cohort a reminder 10 minutes before the lecture", async () => {
    const { notifications } = await generate({ students: [cohortStudent] });

    const reminders = notifications.rows.filter(
      (row) => row.type === NotificationType.LECTURE_STUDENT_10M
    );

    expect(reminders).toHaveLength(1);
    expect(reminders[0]!.userId).toBe(STUDENT_IN_COHORT);
    expect(reminders[0]!.scheduledFor).toEqual(
      new Date("2026-08-09T11:50:00.000Z")
    );
  });

  it("sends the student reminder to nobody outside the lecture's cohort", async () => {
    // There is no enrollment table in this schema — a lecture addresses a
    // cohort, and the cohort is the enrollment. Each of these students misses
    // on exactly one key.
    const { notifications } = await generate({
      students: [
        cohortStudent,
        makeStudent("wrong-section", { section: "A" }),
        makeStudent("wrong-level", { level: 3 }),
        makeStudent("wrong-department", { department: "Civil Engineering" }),
        makeStudent("wrong-faculty", { faculty: "Faculty of Medicine" }),
        makeStudent("wrong-semester", { semester: "Second Semester" }),
      ],
    });

    const recipients = notifications.rows
      .filter((row) => row.type === NotificationType.LECTURE_STUDENT_10M)
      .map((row) => row.userId);

    expect(recipients).toEqual([STUDENT_IN_COHORT]);
  });

  it("never sends a lecture reminder across organizations", async () => {
    // Same faculty, department, level, semester and section — a different
    // university. Free-text academic addresses collide between universities,
    // so this is the case the tenant filter exists for.
    const { notifications } = await generate({
      students: [
        cohortStudent,
        makeStudent("other-university-student", { organizationId: ORG_B }),
      ],
    });

    const recipients = notifications.rows.map((row) => row.userId);

    expect(recipients).not.toContain("other-university-student");
    expect(
      notifications.rows.every((row) => row.organizationId === ORG_A)
    ).toBe(true);
  });

  it("does not duplicate a reminder when generation runs again", async () => {
    const { service, notifications, result } = await generate({
      students: [cohortStudent],
    });

    expect(result.created).toBe(3);
    const afterFirstRun = notifications.rows.length;

    // Same window, twice more — the unique key absorbs both.
    const second = await service.generateUpcoming({
      now: NOW,
      horizonMinutes: WEEK,
    });
    const third = await service.generateUpcoming({
      now: new Date(NOW.getTime() + 60_000),
      horizonMinutes: WEEK,
    });

    expect(second.drafted).toBe(3);
    expect(second.created).toBe(0);
    expect(third.created).toBe(0);
    expect(notifications.rows).toHaveLength(afterFirstRun);
  });

  it("generates nothing for a deactivated lecture", async () => {
    const { notifications, result } = await generate({
      schedules: [{ isActive: false }],
      students: [cohortStudent],
    });

    expect(result.scheduledLectures).toBe(0);
    expect(notifications.rows).toHaveLength(0);
  });

  it("cancels the pending reminders of a lecture that gets cancelled", async () => {
    const { service, notifications } = await generate({
      students: [cohortStudent],
    });

    const cancelled = await service.cancelForSchedule(
      "lecture-electronics",
      "The lecture was cancelled"
    );

    expect(cancelled).toBe(3);
    expect(
      notifications.rows.every(
        (row) => row.status === NotificationStatus.CANCELLED
      )
    ).toBe(true);
  });

  it("skips the instructor reminder when the instructor's account is deactivated", async () => {
    const { notifications } = await generate({
      schedules: [{ instructorActive: false }],
      students: [cohortStudent],
    });

    const types = notifications.rows.map((row) => row.type);

    expect(types).toEqual([NotificationType.LECTURE_STUDENT_10M]);
  });

  it("does not create a reminder whose moment has already passed", async () => {
    // Fifteen minutes before the lecture: the 24-hour and 30-minute rules were
    // both due earlier and are not worth writing, the 10-minute rule is still
    // five minutes away.
    const { service, notifications } = build({ students: [cohortStudent] });

    await service.generateUpcoming({
      now: new Date("2026-08-09T11:45:00.000Z"),
      horizonMinutes: WEEK,
    });

    expect(notifications.rows.map((row) => row.type)).toEqual([
      NotificationType.LECTURE_STUDENT_10M,
    ]);
  });

  it("writes the course, the time and the room into the message", async () => {
    const { notifications } = await generate({ students: [cohortStudent] });

    const byType = (type: NotificationType) =>
      notifications.rows.find((row) => row.type === type)!;

    const admin24h = byType(NotificationType.LECTURE_INSTRUCTOR_24H);
    expect(admin24h.title).toBe("Upcoming lecture");
    expect(admin24h.body).toBe(
      "Electronics lecture is tomorrow at 12:00 PM. Room B-204."
    );

    const admin30m = byType(NotificationType.LECTURE_INSTRUCTOR_30M);
    expect(admin30m.title).toBe("Lecture starting soon");
    expect(admin30m.body).toBe(
      "Electronics lecture starts in 30 minutes. Room B-204."
    );

    const student10m = byType(NotificationType.LECTURE_STUDENT_10M);
    expect(student10m.title).toBe("Lecture starting soon");
    expect(student10m.body).toBe("Electronics starts in 10 minutes. Room B-204.");

    // The structured half, for a client that wants to link back to the lecture.
    expect(student10m.data).toMatchObject({
      kind: "LECTURE_REMINDER",
      courseCode: "MEC201",
      courseName: "Electronics",
      room: "B-204",
      startsAt: OCCURRENCE.toISOString(),
      endsAt: new Date("2026-08-09T14:00:00.000Z").toISOString(),
      minutesBefore: 10,
    });
  });
});

describe("delivery", () => {
  it("marks a due reminder SENT and does not send it a second time", async () => {
    const { notifications } = await generate({
      students: [makeStudent(STUDENT_IN_COHORT)],
    });

    const dispatcher = new NotificationDispatcher(
      notifications,
      new FakeDeviceTokenRepository()
    );

    // Two minutes after the 10-minute reminder came due. The instructor's
    // 30-minute reminder is due as well; the 24-hour one was due yesterday and
    // is retired instead of sent.
    const sentAt = new Date("2026-08-09T11:52:00.000Z");
    const first = await dispatcher.tick(sentAt);

    expect(first.cancelled).toBe(1);
    expect(first.claimed).toBe(2);
    expect(first.sent).toBe(2);

    const delivered = notifications.rows.filter(
      (row) => row.status === NotificationStatus.SENT
    );

    expect(delivered.map((row) => row.type).sort()).toEqual([
      NotificationType.LECTURE_INSTRUCTOR_30M,
      NotificationType.LECTURE_STUDENT_10M,
    ]);
    expect(delivered.every((row) => row.sentAt?.getTime() === sentAt.getTime())).toBe(
      true
    );

    // Running the worker again over the same window claims nothing: the rows
    // are no longer PENDING.
    const second = await dispatcher.tick(new Date("2026-08-09T11:53:00.000Z"));

    expect(second.claimed).toBe(0);
    expect(second.sent).toBe(0);
    expect(
      notifications.rows.filter(
        (row) => row.status === NotificationStatus.SENT
      )
    ).toHaveLength(2);
  });

  it("cancels a reminder that has been due for longer than its window", async () => {
    const { notifications } = await generate({
      students: [makeStudent(STUDENT_IN_COHORT)],
    });

    const dispatcher = new NotificationDispatcher(
      notifications,
      new FakeDeviceTokenRepository()
    );

    // Three hours after the lecture started. "Starts in 10 minutes" is a lie by
    // now, so it is retired rather than sent.
    const result = await dispatcher.tick(new Date("2026-08-09T15:00:00.000Z"));

    expect(result.cancelled).toBe(3);
    expect(result.sent).toBe(0);
  });
});

describe("development simulation", () => {
  it("brings a lecture's reminders forward so they can be delivered now", async () => {
    const { service, notifications } = build({
      students: [makeStudent(STUDENT_IN_COHORT)],
    });

    const simulated = await service.simulateForSchedule({
      lectureScheduleId: "lecture-electronics",
      organizationId: ORG_A,
      types: [NotificationType.LECTURE_INSTRUCTOR_24H],
      now: NOW,
    });

    expect(simulated).not.toBeNull();
    expect(simulated!.created).toBe(1);
    expect(simulated!.occurrenceStartsAt).toEqual(OCCURRENCE);

    const reminder = notifications.rows[0]!;

    // Due immediately...
    expect(reminder.scheduledFor).toEqual(NOW);
    // ...but still worded as the 24-hour reminder it stands in for, and still
    // addressed to the real recipient.
    expect(reminder.userId).toBe(INSTRUCTOR);
    expect(reminder.body).toBe(
      "Electronics lecture is tomorrow at 12:00 PM. Room B-204."
    );

    const dispatcher = new NotificationDispatcher(
      notifications,
      new FakeDeviceTokenRepository()
    );

    expect((await dispatcher.tick(NOW)).sent).toBe(1);
  });

  it("refuses to simulate a lecture belonging to another organization", async () => {
    const { service } = build({ students: [] });

    const simulated = await service.simulateForSchedule({
      lectureScheduleId: "lecture-electronics",
      organizationId: ORG_B,
      now: NOW,
    });

    expect(simulated).toBeNull();
  });
});
