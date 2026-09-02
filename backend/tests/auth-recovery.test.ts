import { afterEach, beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcrypt";
import { UserRepository } from "../src/repositories/user.repository.js";
import { EmailChallengeRepository } from "../src/repositories/email-challenge.repository.js";
import { EmailChallengeService } from "../src/services/email-challenge.service.js";
import { AuthService } from "../src/services/auth.service.js";
import {
  MailMessage,
  MailProvider,
  setMailProvider,
} from "../src/services/mail/mail.provider.js";
import { env } from "../src/config/env.js";

/**
 * Registration by verified email, and password recovery.
 *
 * The property under test throughout is that neither surface says whether an
 * account exists. A registration endpoint that answers "that email is taken"
 * and a reset endpoint that answers "no such user" are, between them, a
 * complete checker for which addresses hold accounts at this university —
 * which is a list worth having if you intend to phish it.
 *
 * So the assertions come in pairs: the caller's answer must be identical, and
 * the mail must differ. Exactly one party learns anything, and it is whoever
 * reads the inbox.
 */

interface UserFixture {
  id: string;
  email: string;
  role: "STUDENT" | "INSTRUCTOR" | "UNIVERSITY_ADMIN";
  isActive: boolean;
  passwordHash: string;
}

class CapturingMail implements MailProvider {
  readonly name = "capture";
  sent: MailMessage[] = [];

  async send(message: MailMessage) {
    this.sent.push(message);
    return { delivered: true };
  }
}

/**
 * In-memory challenge storage, mirroring the SQL rules.
 *
 * Structural rather than a subclass — several repository methods return the
 * Prisma call directly and so are typed `PrismaPromise`, which a plain `async`
 * method cannot override. Cast at the injection point below.
 */
class FakeChallenges {
  rows: {
    id: string;
    email: string;
    purpose: string;
    codeHash: string;
    attempts: number;
    consumedAt: Date | null;
    expiresAt: Date;
    createdAt: Date;
  }[] = [];

  private seq = 0;

  async findLive(
    email: string,
    purpose: never,
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

  async findLatest() {
    return null as never;
  }

  async countSince() {
    return 0;
  }

  async issue(data: never) {
    const row = {
      id: `challenge-${++this.seq}`,
      attempts: 0,
      consumedAt: null,
      createdAt: new Date(),
      ...(data as unknown as {
        email: string;
        purpose: string;
        codeHash: string;
        expiresAt: Date;
      }),
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

let mail: CapturingMail;
let users: UserFixture[];
let passwordWrites: { id: string; hash: string }[];
let created: Record<string, unknown>[];
let service: AuthService;

const STUDENT_PASSWORD = "old-password-1";

const buildUsers = () => {
  class FakeUsers extends UserRepository {
    override async findByEmail(email: string) {
      return (users.find((row) => row.email === email) ?? null) as never;
    }

    override async findByUniversityId() {
      return null as never;
    }

    override async findOrganizationByCode() {
      return { id: "org-a", name: "Nile Central" } as never;
    }

    override async create(data: Record<string, unknown>) {
      created.push(data);
      return { id: "new-user", isVerified: false, ...data } as never;
    }

    override async updatePassword(id: string, hash: string) {
      passwordWrites.push({ id, hash });
      return undefined as never;
    }
  }

  return new FakeUsers();
};

const codeFrom = (message: MailMessage) =>
  message.text.match(/\b(\d{6})\b/)?.[1] ?? null;

beforeEach(async () => {
  mail = new CapturingMail();
  setMailProvider(mail);

  passwordWrites = [];
  created = [];

  users = [
    {
      id: "student-1",
      email: "student@uni.test",
      role: "STUDENT",
      isActive: true,
      passwordHash: await bcrypt.hash(STUDENT_PASSWORD, 10),
    },
    {
      id: "staff-1",
      email: "doctor@uni.test",
      role: "INSTRUCTOR",
      isActive: true,
      passwordHash: await bcrypt.hash("staff-password-1", 10),
    },
    {
      id: "closed-1",
      email: "closed@uni.test",
      role: "STUDENT",
      isActive: false,
      passwordHash: await bcrypt.hash("closed-password-1", 10),
    },
  ];

  service = new AuthService(
    buildUsers(),
    new EmailChallengeService(
      new FakeChallenges() as unknown as EmailChallengeRepository
    )
  );
});

afterEach(() => {
  setMailProvider(null);
});

describe("starting email verification", () => {
  it("mails a code to an address with no account", async () => {
    await service.startEmailVerification("new@uni.test", null);

    expect(mail.sent).toHaveLength(1);
    expect(codeFrom(mail.sent[0])).toMatch(/^\d{6}$/);
  });

  it("mails no code to an address that already has one, and does not say so", async () => {
    const answer = await service.startEmailVerification(
      "student@uni.test",
      null
    );

    // The caller is told nothing — same undefined return as the happy path.
    expect(answer).toBeUndefined();

    expect(mail.sent).toHaveLength(1);
    expect(codeFrom(mail.sent[0])).toBeNull();
    expect(mail.sent[0].subject).toContain("your Leornian account");
  });

  it("treats the address case-insensitively", async () => {
    await service.startEmailVerification("STUDENT@UNI.TEST", null);

    // Upper case must not sneak past the "already registered" check and mint a
    // code for an address that is in fact taken.
    expect(codeFrom(mail.sent[0])).toBeNull();
  });
});

describe("finishing email verification", () => {
  it("returns a ticket for the address that was proven", async () => {
    await service.startEmailVerification("new@uni.test", null);
    const code = codeFrom(mail.sent[0])!;

    const result = await service.confirmEmailVerification("new@uni.test", code);

    expect(result.verificationTicket).toBeTruthy();
    expect(result.expiresInMinutes).toBe(env.REGISTRATION_TICKET_TTL_MINUTES);
  });

  it("refuses a wrong code", async () => {
    await service.startEmailVerification("new@uni.test", null);

    await expect(
      service.confirmEmailVerification("new@uni.test", "000000")
    ).rejects.toMatchObject({ code: "OTP_INVALID" });
  });
});

describe("registering with the flag off", () => {
  it("still accepts a registration with no ticket", async () => {
    // The Flutter client that predates this feature must keep working until it
    // implements the OTP screens. That is the whole reason this is a flag.
    await service.register({
      universityId: "NCTU-9001",
      fullName: "Youssef Nasser",
      email: "new@uni.test",
      password: "password-1",
      organizationCode: "NCTU",
    });

    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ email: "new@uni.test", role: "STUDENT" });
  });
});

describe("registering with the flag on", () => {
  beforeEach(() => {
    (env as { STUDENT_EMAIL_VERIFICATION_REQUIRED: boolean }).STUDENT_EMAIL_VERIFICATION_REQUIRED =
      true;
  });

  afterEach(() => {
    (env as { STUDENT_EMAIL_VERIFICATION_REQUIRED: boolean }).STUDENT_EMAIL_VERIFICATION_REQUIRED =
      false;
  });

  const registerWith = (ticket: string | undefined, email = "new@uni.test") =>
    service.register({
      universityId: "NCTU-9001",
      fullName: "Youssef Nasser",
      email,
      password: "password-1",
      organizationCode: "NCTU",
      verificationTicket: ticket,
    });

  const proveEmail = async (email: string) => {
    await service.startEmailVerification(email, null);
    const code = codeFrom(mail.sent[mail.sent.length - 1])!;
    const { verificationTicket } = await service.confirmEmailVerification(
      email,
      code
    );

    return verificationTicket;
  };

  it("refuses a registration with no ticket, with a code the client can branch on", async () => {
    await expect(registerWith(undefined)).rejects.toMatchObject({
      statusCode: 400,
      code: "EMAIL_VERIFICATION_REQUIRED",
    });

    expect(created).toEqual([]);
  });

  it("refuses a ticket that is not a ticket", async () => {
    await expect(registerWith("not-a-jwt")).rejects.toMatchObject({
      code: "EMAIL_VERIFICATION_EXPIRED",
    });
  });

  it("accepts a registration whose ticket matches the address", async () => {
    const ticket = await proveEmail("new@uni.test");

    await registerWith(ticket);

    expect(created).toHaveLength(1);
  });

  it("refuses a ticket issued for a different address", async () => {
    const ticket = await proveEmail("attacker@uni.test");

    // Without this check, proving your own mailbox would let you register an
    // account under somebody else's address.
    await expect(registerWith(ticket, "victim@uni.test")).rejects.toMatchObject(
      { code: "EMAIL_VERIFICATION_MISMATCH" }
    );

    expect(created).toEqual([]);
  });
});

describe("asking for a password reset", () => {
  it("mails a code to an active student", async () => {
    await service.requestPasswordReset("student@uni.test", null);

    expect(codeFrom(mail.sent[0])).toMatch(/^\d{6}$/);
  });

  it("sends nothing at all for an address with no account", async () => {
    const answer = await service.requestPasswordReset("nobody@uni.test", null);

    // Mailing a stranger to tell them they are a stranger would turn this into
    // a way to send mail to arbitrary addresses.
    expect(answer).toBeUndefined();
    expect(mail.sent).toEqual([]);
  });

  it("sends nothing for a deactivated account", async () => {
    await service.requestPasswordReset("closed@uni.test", null);

    expect(mail.sent).toEqual([]);
  });

  it("explains rather than issuing a code for staff", async () => {
    await service.requestPasswordReset("doctor@uni.test", null);

    expect(mail.sent).toHaveLength(1);
    expect(codeFrom(mail.sent[0])).toBeNull();
    expect(mail.sent[0].text).toContain("administrator");
  });

  it("answers identically for every kind of address", async () => {
    const answers = [];

    for (const email of [
      "student@uni.test",
      "doctor@uni.test",
      "closed@uni.test",
      "nobody@uni.test",
    ]) {
      answers.push(await service.requestPasswordReset(email, null));
    }

    expect(answers).toEqual([undefined, undefined, undefined, undefined]);
  });
});

describe("completing a password reset", () => {
  const startReset = async () => {
    await service.requestPasswordReset("student@uni.test", null);
    return codeFrom(mail.sent[mail.sent.length - 1])!;
  };

  it("sets a new password when the code is right", async () => {
    const code = await startReset();

    await service.resetPassword("student@uni.test", code, "brand-new-pass-1");

    expect(passwordWrites).toHaveLength(1);
    expect(passwordWrites[0].id).toBe("student-1");
    expect(
      await bcrypt.compare("brand-new-pass-1", passwordWrites[0].hash)
    ).toBe(true);
  });

  it("refuses a wrong code and writes nothing", async () => {
    await startReset();

    await expect(
      service.resetPassword("student@uni.test", "000000", "brand-new-pass-1")
    ).rejects.toMatchObject({ code: "OTP_INVALID" });

    expect(passwordWrites).toEqual([]);
  });

  it("refuses to reuse a spent code", async () => {
    const code = await startReset();

    await service.resetPassword("student@uni.test", code, "brand-new-pass-1");

    await expect(
      service.resetPassword("student@uni.test", code, "another-pass-1")
    ).rejects.toMatchObject({ code: "OTP_INVALID" });

    expect(passwordWrites).toHaveLength(1);
  });

  it("refuses to set the password back to the current one", async () => {
    const code = await startReset();

    await expect(
      service.resetPassword("student@uni.test", code, STUDENT_PASSWORD)
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(passwordWrites).toEqual([]);
  });

  it("cannot be used to reset a staff password even with a valid code", async () => {
    // Staff never receive a code, but the guard is repeated at the point of
    // use: a role change between issue and spend must not open the path.
    await service.requestPasswordReset("doctor@uni.test", null);

    await expect(
      service.resetPassword("doctor@uni.test", "000000", "brand-new-pass-1")
    ).rejects.toMatchObject({ code: "OTP_INVALID" });

    expect(passwordWrites).toEqual([]);
  });
});
