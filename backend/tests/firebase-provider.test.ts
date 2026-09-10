import { describe, expect, it } from "vitest";
import {
  collectMulticastOutcome,
  parseServiceAccount,
  toStringData,
} from "../src/services/push/firebase.provider.js";

/**
 * The pure edges of the Firebase provider — credential decoding, FCM data
 * flattening, and the token-pruning rule — without touching firebase-admin or
 * any network. The provider's I/O (initializeApp/send) is not exercised here;
 * that is the one part that requires real Firebase config and is called out as
 * a manual verification step.
 */

// Not a real key — the parser only checks that `private_key` is a string, so a
// harmless placeholder keeps the credential-scanner clean.
const account = {
  type: "service_account",
  project_id: "leornian-test",
  private_key: "test-placeholder-private-key",
  client_email: "sdk@leornian-test.iam.gserviceaccount.com",
};

describe("parseServiceAccount", () => {
  it("accepts raw JSON", () => {
    const parsed = parseServiceAccount(JSON.stringify(account));
    expect(parsed.project_id).toBe("leornian-test");
  });

  it("accepts base64-encoded JSON", () => {
    const b64 = Buffer.from(JSON.stringify(account), "utf8").toString("base64");
    expect(parseServiceAccount(b64).project_id).toBe("leornian-test");
  });

  it("rejects JSON missing the credential fields", () => {
    expect(() => parseServiceAccount(JSON.stringify({ project_id: "x" }))).toThrow();
  });

  it("rejects a value that is not JSON at all", () => {
    expect(() => parseServiceAccount("not-json")).toThrow();
  });
});

describe("toStringData", () => {
  it("stringifies non-strings and drops null/undefined", () => {
    const out = toStringData({
      type: "SCHEDULE_CREATED",
      level: 2,
      section: null,
      missing: undefined,
      nested: { a: 1 },
    });

    expect(out).toEqual({
      type: "SCHEDULE_CREATED",
      level: "2",
      nested: JSON.stringify({ a: 1 }),
    });
  });
});

describe("collectMulticastOutcome", () => {
  it("prunes unregistered and invalid tokens, keeps transient failures", () => {
    const tokens = ["ok", "gone", "bad", "flaky"];
    const responses = [
      { success: true },
      { success: false, error: { code: "messaging/registration-token-not-registered" } },
      { success: false, error: { code: "messaging/invalid-argument" } },
      { success: false, error: { code: "messaging/internal-error" } },
    ];

    const outcome = collectMulticastOutcome(tokens, responses);

    expect(outcome.successes).toBe(1);
    // The transient "internal-error" token is NOT pruned — it may recover.
    expect(outcome.invalidTokens.sort()).toEqual(["bad", "gone"]);
  });
});
