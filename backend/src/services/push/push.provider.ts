import { env } from "../../config/env.js";

/**
 * The seam between "a reminder is due" and "a phone buzzes".
 *
 * Nothing above this file knows what a push provider is. Firebase Cloud
 * Messaging is not configured on this project yet and the Flutter client does
 * not exist, so the pilot ships with a provider that only logs — the in-app
 * notification API is fully functional either way, because a Notification row
 * is the record and push is a delivery channel for it, not the other way round.
 *
 * Adding FCM later means one new implementation of this interface and one line
 * in the factory at the bottom. No business logic changes.
 */

export interface PushTarget {
  token: string;
  platform: string;
}

export interface PushMessage {
  userId: string;
  organizationId: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  /** The recipient's registered devices. Empty when they have none. */
  targets: PushTarget[];
}

export interface PushResult {
  /** False marks the notification FAILED; throwing schedules a retry instead. */
  delivered: boolean;
  detail?: string;
}

export interface PushNotificationProvider {
  readonly name: string;
  send(message: PushMessage): Promise<PushResult>;
}

/**
 * Stores the notification and does nothing else. The user still sees it the
 * next time the client polls /api/notifications, which is the whole delivery
 * path until a mobile app exists.
 */
export class InAppOnlyPushProvider implements PushNotificationProvider {
  readonly name = "none";

  async send(): Promise<PushResult> {
    return { delivered: true, detail: "in-app only" };
  }
}

/** The same, plus a line in the server log so a reminder can be watched go out. */
export class LoggingPushProvider implements PushNotificationProvider {
  readonly name = "log";

  async send(message: PushMessage): Promise<PushResult> {
    console.log(
      `[notification] → user ${message.userId} (${message.targets.length} device(s)): ${message.title} — ${message.body}`
    );

    return {
      delivered: true,
      detail: `logged for ${message.targets.length} device(s)`,
    };
  }
}

let provider: PushNotificationProvider | null = null;

export const getPushProvider = (): PushNotificationProvider => {
  if (!provider) {
    provider =
      env.PUSH_PROVIDER === "log"
        ? new LoggingPushProvider()
        : new InAppOnlyPushProvider();
  }

  return provider;
};

/** Test seam. Pass null to fall back to the configured provider. */
export const setPushProvider = (next: PushNotificationProvider | null) => {
  provider = next;
};
