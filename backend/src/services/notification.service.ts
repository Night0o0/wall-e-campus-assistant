import { DevicePlatform } from "@prisma/client";
import { DeviceTokenRepository } from "../repositories/device-token.repository.js";
import {
  NotificationRepository,
  NotificationWithLecture,
} from "../repositories/notification.repository.js";
import { NotificationQuery } from "../types/notification.types.js";
import { notFound } from "../utils/AppError.js";
import { paginate } from "../utils/pagination.js";

/**
 * The authenticated user's own notification inbox.
 *
 * Every method takes the actor and scopes on both its user id and its
 * organization. Neither is ever read from the request body or the query string,
 * so there is no shape of request that reaches another person's notifications —
 * and a notification that is not the caller's answers 404, not 403, so the
 * endpoint cannot be used to find out whether an id exists.
 */

export interface NotificationActor {
  id: string;
  organizationId: string;
}

export class NotificationService {
  constructor(
    private readonly notifications = new NotificationRepository(),
    private readonly devices = new DeviceTokenRepository()
  ) {}

  async list(query: NotificationQuery, actor: NotificationActor) {
    const { data, total } = await this.notifications.findManyForUser(
      {
        userId: actor.id,
        organizationId: actor.organizationId,
        status: query.status,
        type: query.type,
        unreadOnly: query.unreadOnly,
      },
      query
    );

    const result = paginate(
      data.map((notification) => this.present(notification)),
      total,
      query
    );

    return {
      ...result,
      unreadCount: await this.notifications.countUnreadForUser(
        actor.id,
        actor.organizationId
      ),
    };
  }

  async unreadCount(actor: NotificationActor) {
    return {
      unreadCount: await this.notifications.countUnreadForUser(
        actor.id,
        actor.organizationId
      ),
    };
  }

  async markRead(id: string, actor: NotificationActor) {
    const notification = await this.notifications.findByIdForUser(
      id,
      actor.id,
      actor.organizationId
    );

    if (!notification) {
      throw notFound("Notification not found");
    }

    if (notification.readAt) {
      return this.present(notification);
    }

    const readAt = new Date();

    await this.notifications.markRead(
      id,
      actor.id,
      actor.organizationId,
      readAt
    );

    return this.present({ ...notification, readAt });
  }

  async markAllRead(actor: NotificationActor) {
    const updated = await this.notifications.markAllRead(
      actor.id,
      actor.organizationId,
      new Date()
    );

    return { updated, unreadCount: 0 };
  }

  /* ---------------------------- Device tokens ----------------------------- */

  async registerDevice(
    input: { token: string; platform: DevicePlatform },
    actor: NotificationActor
  ) {
    const device = await this.devices.register({
      token: input.token,
      platform: input.platform,
      userId: actor.id,
      organizationId: actor.organizationId,
    });

    return {
      id: device.id,
      platform: device.platform,
      isActive: device.isActive,
      lastSeenAt: device.lastSeenAt,
    };
  }

  async deactivateDevice(token: string, actor: NotificationActor) {
    const count = await this.devices.deactivate(
      token,
      actor.id,
      actor.organizationId
    );

    // Somebody else's token is reported exactly like one that never existed.
    if (count === 0) {
      throw notFound("Device token not found");
    }

    return { deactivated: count };
  }

  /* ------------------------------ Internals ------------------------------- */

  private present(notification: NotificationWithLecture) {
    const lecture = notification.lectureSchedule;

    return {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      status: notification.status,
      scheduledFor: notification.scheduledFor,
      occurrenceStartsAt: notification.occurrenceStartsAt,
      sentAt: notification.sentAt,
      readAt: notification.readAt,
      isRead: notification.readAt !== null,
      data: notification.data,
      createdAt: notification.createdAt,

      lecture: lecture
        ? {
            id: lecture.id,
            dayOfWeek: lecture.dayOfWeek,
            startTime: lecture.startTime,
            endTime: lecture.endTime,
            room: lecture.room,
            isActive: lecture.isActive,
            course: lecture.course,
            instructor: lecture.instructor,
          }
        : null,
    };
  }
}
