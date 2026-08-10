import { randomUUID } from "crypto";
import { notificationConfig } from "../config/notification.config.js";
import { DeviceTokenRepository } from "../repositories/device-token.repository.js";
import {
  NotificationRepository,
  NotificationWithLecture,
} from "../repositories/notification.repository.js";
import {
  PushNotificationProvider,
  getPushProvider,
} from "./push/push.provider.js";

const MINUTE_MS = 60_000;

export interface DispatchResult {
  cancelled: number;
  claimed: number;
  sent: number;
  failed: number;
  retrying: number;
}

/**
 * Delivers reminders that have come due.
 *
 * The unit of work is a claim, not a read: a row is locked to one worker run
 * before anything is sent, and the lock is part of the same UPDATE that tests
 * it. Two workers polling the same second therefore split the batch instead of
 * both delivering it — which is what stops a reminder going out twice when the
 * process is restarted, or when a second instance is started by mistake.
 *
 * A worker that dies mid-batch leaves its rows locked. They are picked up again
 * once the lock goes stale, and a row that has burned through its attempts is
 * marked FAILED rather than retried forever.
 */
export class NotificationDispatcher {
  constructor(
    private readonly notifications = new NotificationRepository(),
    private readonly devices = new DeviceTokenRepository(),
    private readonly provider: PushNotificationProvider | null = null
  ) {}

  private push() {
    return this.provider ?? getPushProvider();
  }

  async tick(now: Date = new Date()): Promise<DispatchResult> {
    const result: DispatchResult = {
      cancelled: 0,
      claimed: 0,
      sent: 0,
      failed: 0,
      retrying: 0,
    };

    // Anything long overdue is retired before the batch is claimed: "starts in
    // 10 minutes" is wrong an hour later, and sending it would be worse than
    // dropping it.
    result.cancelled = await this.notifications.cancelOverdue(
      new Date(now.getTime() - notificationConfig.staleAfterMinutes * MINUTE_MS)
    );

    const claimed = await this.notifications.claimDue({
      now,
      token: randomUUID(),
      limit: notificationConfig.batchSize,
      lockTimeoutMs: notificationConfig.lockTimeoutMs,
    });

    result.claimed = claimed.length;

    for (const notification of claimed) {
      const outcome = await this.deliver(notification, now);
      result[outcome] += 1;
    }

    return result;
  }

  private async deliver(
    notification: NotificationWithLecture,
    now: Date
  ): Promise<"sent" | "failed" | "retrying"> {
    // `attempts` was incremented by the claim, so this is the count including
    // the attempt about to be made.
    const lastChance = notification.attempts >= notificationConfig.maxAttempts;

    try {
      const targets = await this.devices.findActiveForUser(notification.userId);

      const result = await this.push().send({
        userId: notification.userId,
        organizationId: notification.organizationId,
        title: notification.title,
        body: notification.body,
        data: (notification.data as Record<string, unknown>) ?? {},
        targets: targets.map((device) => ({
          token: device.token,
          platform: device.platform,
        })),
      });

      if (result.delivered) {
        await this.notifications.markSent(notification.id, now);
        return "sent";
      }

      // A provider that reports a rejection is telling us this message will
      // never be accepted, so there is nothing to retry.
      await this.notifications.markFailed(
        notification.id,
        result.detail ?? "Rejected by the push provider",
        true
      );

      return "failed";
    } catch (error) {
      // A thrown error is an outage, not a rejection: keep the reminder
      // PENDING and try again next poll, until it runs out of attempts.
      const reason =
        error instanceof Error ? error.message : "Unknown delivery error";

      await this.notifications.markFailed(notification.id, reason, lastChance);

      if (!lastChance) {
        console.warn(
          `[notification] delivery attempt ${notification.attempts} failed for ${notification.id}: ${reason}`
        );
      } else {
        console.error(
          `[notification] giving up on ${notification.id}: ${reason}`
        );
      }

      return lastChance ? "failed" : "retrying";
    }
  }
}
