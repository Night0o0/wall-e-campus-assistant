import { env } from "../../config/env.js";
import { logger } from "../../utils/logger.js";
import type { PushMessage, PushNotificationProvider, PushResult } from "./push.provider.js";

/**
 * Real push delivery through Firebase Cloud Messaging.
 *
 * This is the only file that talks to firebase-admin. Everything above it deals
 * in Notification rows and PushMessages; FCM is a delivery channel for a record
 * that already exists in the database, never the record itself — so a Firebase
 * outage costs a buzz, not a notification.
 *
 * The Android side sets a high-priority notification and names the high-priority
 * channel the client created, so a foreground/background message is shown at
 * once rather than batched. `data` carries the routing hints the app deep-links
 * on (type + ids); its values must be strings, which is enforced here.
 *
 * firebase-admin and the credential are loaded lazily, inside the first send, so
 * a deployment that never enables Firebase neither imports the SDK nor reads the
 * service account, and an import of this module costs nothing.
 */

/** The high-priority Android channel the Flutter client registers on install. */
export const ANDROID_NOTIFICATION_CHANNEL = "leornian_high_priority";

/** FCM error codes that mean the token is permanently gone. */
const UNREGISTERED_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

/** Minimal shape of the firebase-admin Messaging we use, to avoid a hard dep in types. */
interface FcmMessaging {
  sendEachForMulticast(message: unknown): Promise<{
    responses: { success: boolean; error?: { code?: string } }[];
  }>;
}

/**
 * Decodes the credential, which may be raw JSON or base64-encoded JSON (Render
 * env fields dislike newlines). Never logs the value. Exported for tests.
 */
export const parseServiceAccount = (raw: string): Record<string, unknown> => {
  const text = raw.trim().startsWith("{")
    ? raw
    : Buffer.from(raw, "base64").toString("utf8");

  const parsed = JSON.parse(text) as Record<string, unknown>;

  if (typeof parsed.project_id !== "string" || typeof parsed.private_key !== "string") {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is not a valid service-account JSON");
  }

  return parsed;
};

/** FCM data values must be strings; flatten a payload, JSON-encoding non-strings. */
export const toStringData = (data: Record<string, unknown>): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) continue;
    out[key] = typeof value === "string" ? value : JSON.stringify(value);
  }
  return out;
};

/**
 * Splits a multicast response into a success count and the tokens to retire.
 * Pure and exported so the token-pruning rule can be tested without firebase.
 */
export const collectMulticastOutcome = (
  tokens: string[],
  responses: { success: boolean; error?: { code?: string } }[]
): { successes: number; invalidTokens: string[] } => {
  const invalidTokens: string[] = [];
  let successes = 0;

  responses.forEach((result, index) => {
    if (result.success) {
      successes += 1;
      return;
    }
    const code = result.error?.code;
    if (code && UNREGISTERED_CODES.has(code)) {
      invalidTokens.push(tokens[index]!);
    }
  });

  return { successes, invalidTokens };
};

export class FirebaseAdminPushProvider implements PushNotificationProvider {
  readonly name = "firebase";

  private messaging: FcmMessaging | null = null;
  private initError: Error | null = null;

  /**
   * Builds the admin app once. firebase-admin is dynamically imported so it
   * never enters the startup path of a non-Firebase deployment. A credential
   * that fails to parse is remembered and re-thrown on every send, so the row
   * stays PENDING and retries rather than being marked permanently failed.
   */
  private async ensureMessaging(): Promise<FcmMessaging> {
    if (this.messaging) return this.messaging;
    if (this.initError) throw this.initError;

    try {
      if (!env.FIREBASE_SERVICE_ACCOUNT) {
        throw new Error("FIREBASE_SERVICE_ACCOUNT is not configured");
      }

      const serviceAccount = parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT);

      const appModule = await import("firebase-admin/app");
      const messagingModule = await import("firebase-admin/messaging");

      // Reuse an already-initialized app (hot reload, multiple providers).
      const app =
        appModule.getApps().length > 0
          ? appModule.getApp()
          : appModule.initializeApp({
              // `cert` accepts snake_case service-account JSON directly.
              credential: appModule.cert(serviceAccount as never),
            });

      this.messaging = messagingModule.getMessaging(app) as unknown as FcmMessaging;
      return this.messaging;
    } catch (error) {
      this.initError = error instanceof Error ? error : new Error(String(error));
      throw this.initError;
    }
  }

  async send(message: PushMessage): Promise<PushResult> {
    // Nothing to push, but the in-app record still stands: a recipient with no
    // registered device is delivered successfully to their inbox.
    if (message.targets.length === 0) {
      return { delivered: true, detail: "no registered devices" };
    }

    const messaging = await this.ensureMessaging();
    const tokens = message.targets.map((target) => target.token);

    const response = await messaging.sendEachForMulticast({
      tokens,
      notification: { title: message.title, body: message.body },
      data: toStringData(message.data),
      android: {
        priority: "high",
        notification: {
          channelId: ANDROID_NOTIFICATION_CHANNEL,
          priority: "high",
        },
      },
    });

    const { successes, invalidTokens } = collectMulticastOutcome(
      tokens,
      response.responses
    );

    if (invalidTokens.length > 0) {
      logger.info("push.firebase.pruned_tokens", {
        userId: message.userId,
        organizationId: message.organizationId,
        pruned: invalidTokens.length,
      });
    }

    // Delivered as long as the record reached the pipeline. Per-token failures
    // are pruning signals, not a reason to mark the notification failed — the
    // database row remains the source of truth.
    return {
      delivered: true,
      detail: `fcm ${successes}/${tokens.length} delivered`,
      invalidTokens,
    };
  }
}
