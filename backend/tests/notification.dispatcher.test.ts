import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeviceTokenRepository } from "../src/repositories/device-token.repository.js";
import { NotificationRepository } from "../src/repositories/notification.repository.js";
import { NotificationDispatcher } from "../src/services/notification.dispatcher.js";
import type {
  PushMessage,
  PushNotificationProvider,
  PushResult,
} from "../src/services/push/push.provider.js";
import { notificationConfig } from "../src/config/notification.config.js";

/**
 * The delivery worker: it turns a claimed PENDING row into a push and a status,
 * and prunes the handsets the provider says are gone. Database-free — the
 * repositories and the push provider are doubles.
 */

const ORG = "org-a";

type FakeRow = {
  id: string;
  userId: string;
  organizationId: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  attempts: number;
};

const row = (over: Partial<FakeRow> = {}): FakeRow => ({
  id: "n1",
  userId: "u1",
  organizationId: ORG,
  type: "ACCOUNT_APPROVED",
  title: "Your account has been approved",
  body: "Welcome.",
  data: { kind: "ACCOUNT", type: "ACCOUNT_APPROVED", route: "home" },
  attempts: 1,
  ...over,
});

const build = (options: {
  claim: FakeRow[];
  tokens?: { token: string; platform: string }[];
  provider: PushNotificationProvider;
}) => {
  const calls = {
    sent: [] as string[],
    failed: [] as { id: string; giveUp: boolean; reason: string }[],
    deactivated: [] as string[][],
    messages: [] as PushMessage[],
  };

  class FakeNotifications extends NotificationRepository {
    override async cancelOverdue() {
      return 0;
    }
    override async claimDue() {
      return options.claim as never;
    }
    override async markSent(id: string) {
      calls.sent.push(id);
      return {} as never;
    }
    override async markFailed(id: string, reason: string, giveUp: boolean) {
      calls.failed.push({ id, giveUp, reason });
      return {} as never;
    }
  }

  class FakeDevices extends DeviceTokenRepository {
    override async findActiveForUser() {
      return (options.tokens ?? []) as never;
    }
    override async deactivateTokens(tokens: string[]) {
      calls.deactivated.push(tokens);
      return tokens.length;
    }
  }

  const spyProvider: PushNotificationProvider = {
    name: options.provider.name,
    async send(message) {
      calls.messages.push(message);
      return options.provider.send(message);
    },
  };

  return {
    calls,
    dispatcher: new NotificationDispatcher(
      new FakeNotifications(),
      new FakeDevices(),
      spyProvider
    ),
  };
};

const provider = (result: PushResult | (() => Promise<PushResult>)): PushNotificationProvider => ({
  name: "fake",
  send: typeof result === "function" ? result : async () => result,
});

beforeEach(() => vi.restoreAllMocks());

describe("delivering a claimed notification", () => {
  it("marks an approval SENT and pushes it — approvals are eligible for dispatch", async () => {
    const { dispatcher, calls } = build({
      claim: [row({ type: "ACCOUNT_APPROVED" })],
      tokens: [{ token: "tok-1", platform: "ANDROID" }],
      provider: provider({ delivered: true }),
    });

    const result = await dispatcher.tick(new Date());

    expect(result.sent).toBe(1);
    expect(calls.sent).toEqual(["n1"]);
    // The provider received the account payload it should route on.
    expect(calls.messages[0]).toMatchObject({
      userId: "u1",
      organizationId: ORG,
      title: "Your account has been approved",
    });
    expect(calls.messages[0].data).toMatchObject({ route: "home" });
    expect(calls.messages[0].targets).toEqual([{ token: "tok-1", platform: "ANDROID" }]);
  });

  it("delivers even when the recipient has no registered device", async () => {
    const { dispatcher, calls } = build({
      claim: [row()],
      tokens: [],
      provider: provider({ delivered: true, detail: "no registered devices" }),
    });

    const result = await dispatcher.tick(new Date());

    expect(result.sent).toBe(1);
    expect(calls.messages[0].targets).toEqual([]);
  });

  it("deactivates the tokens the provider reports as invalid", async () => {
    const { dispatcher, calls } = build({
      claim: [row()],
      tokens: [
        { token: "good", platform: "ANDROID" },
        { token: "dead", platform: "ANDROID" },
      ],
      provider: provider({ delivered: true, invalidTokens: ["dead"] }),
    });

    await dispatcher.tick(new Date());

    expect(calls.deactivated).toEqual([["dead"]]);
    expect(calls.sent).toEqual(["n1"]); // still delivered
  });

  it("marks FAILED without retry when the provider rejects the message", async () => {
    const { dispatcher, calls } = build({
      claim: [row({ attempts: 1 })],
      provider: provider({ delivered: false, detail: "rejected" }),
    });

    const result = await dispatcher.tick(new Date());

    expect(result.failed).toBe(1);
    expect(calls.failed).toEqual([{ id: "n1", giveUp: true, reason: "rejected" }]);
  });

  it("keeps a thrown error PENDING for retry until attempts run out", async () => {
    const retrying = build({
      claim: [row({ attempts: 1 })],
      provider: provider(async () => {
        throw new Error("FCM unreachable");
      }),
    });

    const first = await retrying.dispatcher.tick(new Date());
    expect(first.retrying).toBe(1);
    expect(retrying.calls.failed[0]).toMatchObject({ giveUp: false });

    const lastChance = build({
      claim: [row({ attempts: notificationConfig.maxAttempts })],
      provider: provider(async () => {
        throw new Error("FCM unreachable");
      }),
    });

    const final = await lastChance.dispatcher.tick(new Date());
    expect(final.failed).toBe(1);
    expect(lastChance.calls.failed[0]).toMatchObject({ giveUp: true });
  });
});
