import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { EmailChallengePurpose } from "@prisma/client";
import { EmailChallengeRepository } from "../src/repositories/email-challenge.repository.js";
import { EmailChallengeService } from "../src/services/email-challenge.service.js";
import {
  MailMessage,
  MailProvider,
  setMailProvider,
} from "../src/services/mail/mail.provider.js";
import { verificationEmail } from "../src/services/mail/mail.content.js";
import { env } from "../src/config/env.js";

/**
 * One-time codes.
 *
 * A six-digit code is one of a million, which is a fine secret or a hopeless
 * one depending entirely on the limits around it. These tests are therefore
 * mostly about the limits, and each one is written to fail loudly if a limit is
 * ever relaxed: expiry, the attempt ceiling, the per-address issue ceiling, the
 * resend cooldown, supersession, and single use.
 */

interface Row {
  id: string;
  email: string;
  purpose: EmailChallengePurpose;
  codeHash: string;
  attempts: number;
  consumedAt: Date | null;
  expiresAt: Date;
  requestIp: string | null;
  createdAt: Date;
}

/**
 * An in-memory stand-in that applies the same rules the SQL does.
 *
 * Structural rather than a subclass, and the reason is a real constraint: four
 * of the repository's methods return the Prisma call directly, so their
 * declared type is `PrismaPromise`, and a plain `async` method cannot override
 * that. Standing beside the class and casting at the single injection point
 * keeps the fake honest about the shape it provides instead of pretending to be
 * a Prisma client.
 */
class FakeChallenges {
  rows: Row[] = [];
  private seq = 0;

  async findLive(
    email: string,
    purpose: EmailChallengePurpose,
    now: Date,
    maxAttempts: number
  ) {
    const live = this.rows
      .filter(
        (row) =>
          row.email === email &&
          row.purpose === purpose &&
          row.consumedAt === null &&
          row.expiresAt > now &&
          row.attempts < maxAttempts
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return (live[0] ?? null) as never;
  }

  async findLatest(email: string, purpose: EmailChallengePurpose) {
    const found = this.rows
      .filter((row) => row.email === email && row.purpose === purpose)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

    return (found ? { createdAt: found.createdAt } : null) as never;
  }

  async countSince(email: string, since: Date) {
    return this.rows.filter(
      (row) => row.email === email && row.createdAt >= since
    ).length;
  }

  async issue(data: {
    email: string;
    purpose: EmailChallengePurpose;
    codeHash: string;
    expiresAt: Date;
    requestIp: string | null;
  }) {
    // Supersession, exactly as the real transaction does it.
    for (const row of this.rows) {
      if (
        row.email === data.email &&
        row.purpose === data.purpose &&
        row.consumedAt === null
      ) {
        row.consumedAt = new Date();
      }
    }

    const row: Row = {
      id: `challenge-${++this.seq}`,
      attempts: 0,
      consumedAt: null,
      createdAt: new Date(),
      ...data,
    };

    this.rows.push(row);

    return row as never;
  }

  async recordFailedAttempt(id: string) {
    const row = this.rows.find((item) => item.id === id)!;
    row.attempts += 1;
    return row as never;
  }

  async consume(id: string) {
    const row = this.rows.find((item) => item.id === id)!;

    if (row.consumedAt !== null) {
      return false;
    }

    row.consumedAt = new Date();
    return true;
  }

  async burn(id: string) {
    const row = this.rows.find((item) => item.id === id)!;
    row.consumedAt ??= new Date();
  }
}

/** Captures what would have been sent, and can be told to fail. */
class CapturingMail implements MailProvider {
  readonly name = "capture";
  sent: MailMessage[] = [];
  failNext = false;

  async send(message: MailMessage) {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("relay refused");
    }

    this.sent.push(message);
    return { delivered: true };
  }
}

let mail: CapturingMail;
let repo: FakeChallenges;
let service: EmailChallengeService;

/** The code as the student reads it out of the email. */
const codeFrom = (message: MailMessage) =>
  message.text.match(/\b(\d{6})\b/)![1];

beforeEach(() => {
  mail = new CapturingMail();
  setMailProvider(mail);
  repo = new FakeChallenges();
  service = new EmailChallengeService(
    repo as unknown as EmailChallengeRepository
  );
});

afterEach(() => {
  setMailProvider(null);
});

const issue = () =>
  service.issue("s@uni.test", "EMAIL_VERIFICATION", verificationEmail, null);

/** Moves every stored row back in time, so cooldowns and expiries can be crossed. */
const rewind = (ms: number) => {
  for (const row of repo.rows) {
    row.createdAt = new Date(row.createdAt.getTime() - ms);
    row.expiresAt = new Date(row.expiresAt.getTime() - ms);
  }
};

describe("issuing a code", () => {
  it("mails a code of exactly the configured length", async () => {
    await issue();

    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0].to).toBe("s@uni.test");
    expect(codeFrom(mail.sent[0])).toMatch(
      new RegExp(`^\\d{${env.OTP_LENGTH}}$`)
    );
  });

  it("never stores the code itself", async () => {
    await issue();

    const code = codeFrom(mail.sent[0]);

    // The row holds a bcrypt digest. A database copy must not hand over live
    // credentials — the same rule as RobotDevice.secretHash.
    expect(repo.rows[0].codeHash).not.toContain(code);
    expect(repo.rows[0].codeHash.startsWith("$2")).toBe(true);
  });

  it("lowercases the address so one inbox shares one throttle bucket", () => {
    expect(service.normalizeEmail("  S@UNI.test ")).toBe("s@uni.test");
  });

  it("burns the row when delivery fails, so the student is not locked out", async () => {
    mail.failNext = true;

    await expect(issue()).rejects.toMatchObject({
      statusCode: 502,
      code: "MAIL_DELIVERY_FAILED",
    });

    // The row exists — it still counts against the hourly ceiling — but it is
    // spent, so nothing is left claiming to be a live code nobody received.
    expect(repo.rows).toHaveLength(1);
    expect(repo.rows[0].consumedAt).not.toBeNull();
  });
});

describe("spending a code", () => {
  it("accepts the right code once", async () => {
    await issue();
    const code = codeFrom(mail.sent[0]);

    await expect(
      service.verify("s@uni.test", "EMAIL_VERIFICATION", code)
    ).resolves.toBeUndefined();
  });

  it("refuses the same code a second time", async () => {
    await issue();
    const code = codeFrom(mail.sent[0]);

    await service.verify("s@uni.test", "EMAIL_VERIFICATION", code);

    // Single use. A replayed code is indistinguishable from a wrong one.
    await expect(
      service.verify("s@uni.test", "EMAIL_VERIFICATION", code)
    ).rejects.toMatchObject({ code: "OTP_INVALID" });
  });

  it("refuses a code issued for the other purpose", async () => {
    await issue();
    const code = codeFrom(mail.sent[0]);

    // A code mailed to prove an address must not reset a password.
    await expect(
      service.verify("s@uni.test", "PASSWORD_RESET", code)
    ).rejects.toMatchObject({ code: "OTP_INVALID" });
  });

  it("refuses a code belonging to a different address", async () => {
    await issue();
    const code = codeFrom(mail.sent[0]);

    await expect(
      service.verify("other@uni.test", "EMAIL_VERIFICATION", code)
    ).rejects.toMatchObject({ code: "OTP_INVALID" });
  });

  it("refuses an expired code", async () => {
    await issue();
    const code = codeFrom(mail.sent[0]);

    rewind((env.OTP_TTL_MINUTES + 1) * 60_000);

    await expect(
      service.verify("s@uni.test", "EMAIL_VERIFICATION", code)
    ).rejects.toMatchObject({ code: "OTP_INVALID" });
  });

  it("fails identically whether the code is wrong or no code exists", async () => {
    const noChallenge = await service
      .verify("nobody@uni.test", "EMAIL_VERIFICATION", "000000")
      .catch((error) => error);

    await issue();

    const wrongCode = await service
      .verify("s@uni.test", "EMAIL_VERIFICATION", "000000")
      .catch((error) => error);

    // Telling these apart would say which addresses have codes outstanding,
    // and would let an attacker separate a wrong guess from a dead one.
    expect(noChallenge.statusCode).toBe(wrongCode.statusCode);
    expect(noChallenge.code).toBe(wrongCode.code);
    expect(noChallenge.message).toBe(wrongCode.message);
  });
});

describe("the attempt ceiling", () => {
  it("burns the code after the configured number of wrong guesses", async () => {
    await issue();
    const code = codeFrom(mail.sent[0]);
    const wrong = code === "000000" ? "111111" : "000000";

    for (let attempt = 0; attempt < env.OTP_MAX_ATTEMPTS; attempt += 1) {
      await expect(
        service.verify("s@uni.test", "EMAIL_VERIFICATION", wrong)
      ).rejects.toMatchObject({ code: "OTP_INVALID" });
    }

    // The real code no longer works: five guesses buy an attacker five
    // guesses, not an unlimited number against a still-live code.
    await expect(
      service.verify("s@uni.test", "EMAIL_VERIFICATION", code)
    ).rejects.toMatchObject({ code: "OTP_INVALID" });

    expect(repo.rows[0].consumedAt).not.toBeNull();
  });
});

describe("the issue throttles", () => {
  it("refuses a resend inside the cooldown, and says how long to wait", async () => {
    await issue();

    const error = await issue().catch((caught) => caught);

    expect(error.statusCode).toBe(429);
    expect(error.code).toBe("OTP_COOLDOWN");
    expect(error.details.retryAfterSeconds).toBeGreaterThan(0);

    // Nothing was sent, so the cooldown is not merely advisory.
    expect(mail.sent).toHaveLength(1);
  });

  it("allows a resend once the cooldown has passed", async () => {
    await issue();
    rewind((env.OTP_RESEND_COOLDOWN_SECONDS + 1) * 1000);

    await expect(issue()).resolves.toBeUndefined();
    expect(mail.sent).toHaveLength(2);
  });

  it("stops at the hourly ceiling even when the cooldown allows it", async () => {
    for (let sent = 0; sent < env.OTP_MAX_PER_EMAIL_PER_HOUR; sent += 1) {
      await issue();
      rewind((env.OTP_RESEND_COOLDOWN_SECONDS + 1) * 1000);
    }

    // Without this ceiling the attempt ceiling is defeated: request a fresh
    // code after every fifth wrong guess and the keyspace opens back up.
    await expect(issue()).rejects.toMatchObject({
      statusCode: 429,
      code: "OTP_HOURLY_LIMIT",
    });
  });

  it("counts both purposes against one ceiling", async () => {
    for (let sent = 0; sent < env.OTP_MAX_PER_EMAIL_PER_HOUR; sent += 1) {
      await issue();
      rewind((env.OTP_RESEND_COOLDOWN_SECONDS + 1) * 1000);
    }

    // Alternating purposes must not buy a second allowance: the resource being
    // protected is somebody's inbox, which does not care what the code was for.
    await expect(
      service.issue("s@uni.test", "PASSWORD_RESET", verificationEmail, null)
    ).rejects.toMatchObject({ code: "OTP_HOURLY_LIMIT" });
  });
});

describe("supersession", () => {
  it("kills the previous code when a new one is issued", async () => {
    await issue();
    const first = codeFrom(mail.sent[0]);

    rewind((env.OTP_RESEND_COOLDOWN_SECONDS + 1) * 1000);
    await issue();
    const second = codeFrom(mail.sent[1]);

    expect(first).not.toBe(second);

    // A code read over somebody's shoulder must not stay good after they ask
    // for a fresh one — which is exactly when they most want it not to.
    await expect(
      service.verify("s@uni.test", "EMAIL_VERIFICATION", first)
    ).rejects.toMatchObject({ code: "OTP_INVALID" });

    await expect(
      service.verify("s@uni.test", "EMAIL_VERIFICATION", second)
    ).resolves.toBeUndefined();
  });
});

describe("notifying without a code", () => {
  it("sends the message but leaves nothing spendable", async () => {
    await service.notifyWithoutCode(
      "taken@uni.test",
      "EMAIL_VERIFICATION",
      { subject: "About your account", text: "You already have one." },
      null
    );

    expect(mail.sent).toHaveLength(1);

    // A row exists to hold the throttle, but its hash covers a code nobody was
    // ever told, so there is nothing to guess at.
    expect(repo.rows).toHaveLength(1);
    await expect(
      service.verify("taken@uni.test", "EMAIL_VERIFICATION", "000000")
    ).rejects.toMatchObject({ code: "OTP_INVALID" });
  });

  it("swallows a delivery failure rather than leaking what it found", async () => {
    mail.failNext = true;

    // The caller is being answered identically whatever was found, so an SMTP
    // error here would reveal the very distinction that identical answer hides.
    await expect(
      service.notifyWithoutCode(
        "taken@uni.test",
        "EMAIL_VERIFICATION",
        { subject: "About your account", text: "You already have one." },
        null
      )
    ).resolves.toBeUndefined();
  });
});
