import { NotificationType } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { NotificationService } from "../src/services/notification.service.js";
import { AppError } from "../src/utils/AppError.js";
import {
  FakeDeviceTokenRepository,
  FakeNotificationRepository,
  ORG_A,
  ORG_B,
} from "./helpers/fakes.js";

/**
 * The inbox. Every one of these tests is really the same question asked from a
 * different angle: can a request reach a notification that is not the caller's?
 */

const OWNER = { id: "student-b1", organizationId: ORG_A };
const OTHER_USER = { id: "student-b2", organizationId: ORG_A };
/** Same person id, another university — the shape a stolen token would take. */
const IMPOSTOR = { id: "student-b1", organizationId: ORG_B };

const OCCURRENCE = new Date("2026-08-09T12:00:00.000Z");

const query = {
  page: 1,
  limit: 10,
  sortOrder: "desc" as const,
};

describe("notification inbox", () => {
  let notifications: FakeNotificationRepository;
  let service: NotificationService;
  let ownerNotificationId: string;
  let otherNotificationId: string;

  beforeEach(async () => {
    notifications = new FakeNotificationRepository();
    service = new NotificationService(
      notifications,
      new FakeDeviceTokenRepository()
    );

    await notifications.createManyIgnoringDuplicates([
      {
        organizationId: ORG_A,
        userId: OWNER.id,
        lectureScheduleId: "lecture-electronics",
        occurrenceStartsAt: OCCURRENCE,
        type: NotificationType.LECTURE_STUDENT_10M,
        title: "Lecture starting soon",
        body: "Electronics starts in 10 minutes. Room B-204.",
        data: {},
        scheduledFor: new Date("2026-08-09T11:50:00.000Z"),
      },
      {
        organizationId: ORG_A,
        userId: OTHER_USER.id,
        lectureScheduleId: "lecture-electronics",
        occurrenceStartsAt: OCCURRENCE,
        type: NotificationType.LECTURE_STUDENT_10M,
        title: "Lecture starting soon",
        body: "Electronics starts in 10 minutes. Room B-204.",
        data: {},
        scheduledFor: new Date("2026-08-09T11:50:00.000Z"),
      },
    ]);

    // A reminder only reaches an inbox once it has gone out.
    for (const row of notifications.rows) {
      await notifications.markSent(row.id, new Date("2026-08-09T11:50:05.000Z"));
    }

    ownerNotificationId = notifications.rows.find(
      (row) => row.userId === OWNER.id
    )!.id;
    otherNotificationId = notifications.rows.find(
      (row) => row.userId === OTHER_USER.id
    )!.id;
  });

  it("marks the caller's own notification as read", async () => {
    expect((await service.unreadCount(OWNER)).unreadCount).toBe(1);

    const marked = await service.markRead(ownerNotificationId, OWNER);

    expect(marked.isRead).toBe(true);
    expect(marked.readAt).toBeInstanceOf(Date);
    expect((await service.unreadCount(OWNER)).unreadCount).toBe(0);

    // Marking it twice is not an error and does not move the timestamp.
    const again = await service.markRead(ownerNotificationId, OWNER);
    expect(again.readAt).toEqual(marked.readAt);
  });

  it("marks everything unread as read in one call", async () => {
    const result = await service.markAllRead(OWNER);

    expect(result.updated).toBe(1);
    expect(result.unreadCount).toBe(0);
    // Somebody else's notification was not touched.
    expect((await service.unreadCount(OTHER_USER)).unreadCount).toBe(1);
  });

  it("never returns another user's notifications in the list", async () => {
    const listed = await service.list(query, OWNER);

    expect(listed.meta.total).toBe(1);
    expect(listed.data.map((row) => row.id)).toEqual([ownerNotificationId]);
    expect(listed.data.map((row) => row.id)).not.toContain(otherNotificationId);
  });

  it("refuses to read another user's notification", async () => {
    // The id is real and exists — it just is not this caller's.
    await expect(service.markRead(otherNotificationId, OWNER)).rejects.toThrow(
      AppError
    );

    await expect(
      service.markRead(otherNotificationId, OWNER)
    ).rejects.toMatchObject({
      statusCode: 404,
      message: "Notification not found",
    });
  });

  it("refuses to mark another user's notification as read", async () => {
    await expect(service.markRead(ownerNotificationId, OTHER_USER)).rejects.toMatchObject(
      { statusCode: 404 }
    );

    // And it is still unread for the person it belongs to.
    expect((await service.unreadCount(OWNER)).unreadCount).toBe(1);
  });

  it("refuses to reach a notification from another organization", async () => {
    await expect(
      service.markRead(ownerNotificationId, IMPOSTOR)
    ).rejects.toMatchObject({ statusCode: 404 });

    const listed = await service.list(query, IMPOSTOR);
    expect(listed.meta.total).toBe(0);

    expect((await service.unreadCount(IMPOSTOR)).unreadCount).toBe(0);
    expect((await service.markAllRead(IMPOSTOR)).updated).toBe(0);
    expect((await service.unreadCount(OWNER)).unreadCount).toBe(1);
  });

  it("hides reminders that have not been sent yet", async () => {
    await notifications.createManyIgnoringDuplicates([
      {
        organizationId: ORG_A,
        userId: OWNER.id,
        lectureScheduleId: "lecture-control-systems",
        occurrenceStartsAt: new Date("2026-08-10T09:00:00.000Z"),
        type: NotificationType.LECTURE_STUDENT_10M,
        title: "Lecture starting soon",
        body: "Control Systems starts in 10 minutes. Room C-101.",
        data: {},
        scheduledFor: new Date("2026-08-10T08:50:00.000Z"),
      },
    ]);

    const listed = await service.list(query, OWNER);

    expect(listed.meta.total).toBe(1);
    expect((await service.unreadCount(OWNER)).unreadCount).toBe(1);
  });
});
