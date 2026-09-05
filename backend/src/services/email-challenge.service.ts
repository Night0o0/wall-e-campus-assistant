import { randomInt } from "crypto";
import bcrypt from "bcrypt";
import { EmailChallengePurpose } from "@prisma/client";
import { EmailChallengeRepository } from "../repositories/email-challenge.repository.js";
import { getMailProvider, MailMessage } from "./mail/mail.provider.js";
import { env } from "../config/env.js";
import { AppError, tooManyRequests } from "../utils/AppError.js";

const SALT_ROUNDS = 10;

/**
 * Issuing and spending one-time codes.
 *
 * ── The threat this file is written against ────────────────────────────────
 *
 * A six-digit code is one of a million. That is a perfectly good secret and a
 * hopeless one, depending entirely on the limits around it, so the limits are
 * the substance of this service rather than an afterthought bolted to it:
 *
 *   Expiry (OTP_TTL_MINUTES)          — a code is guessable given unlimited
 *                                       time; it is not given ten minutes.
 *   Attempt ceiling (OTP_MAX_ATTEMPTS)— five wrong guesses burn the code, so an
 *                                       attacker gets 5 tries per code, not 10⁶.
 *   Issue ceiling (per hour)          — otherwise the attempt ceiling is
 *                                       defeated by requesting a fresh code
 *                                       after every fifth guess.
 *   Resend cooldown                   — stops the same inbox being used as a
 *                                       mail cannon at somebody else's expense.
 *   Supersession                      — issuing retires the previous live code,
 *                                       so only the newest email works.
 *
 * Remove any one and the others stop being sufficient. They are a set.
 *
 * ── The other rule: this service never says whether an account exists ──────
 *
 * Every public method here returns the same shape whatever it found. Deciding
 * what to *send* — a code, a "you already have an account" note, or nothing at
 * all — happens inside, where the answer never reaches the caller. See
 * AuthService for the endpoints that depend on this.
 */
export class EmailChallengeService {
  /** Injected so tests can drive the limits without a database. */
  constructor(private challenges = new EmailChallengeRepository()) {}

  /** Addresses are compared and throttled in one canonical form. */
  normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  /**
   * A numeric code of exactly OTP_LENGTH digits, leading zeros included.
   *
   * `randomInt` rather than `Math.random`: this is a credential, and
   * `Math.random` is a fast PRNG with observable internal state, not a source
   * of secrets. Leading zeros are preserved by padding — trimming them would
   * quietly shrink the keyspace and make "012345" unenterable.
   */
  private generateCode(): string {
    const max = 10 ** env.OTP_LENGTH;
    return String(randomInt(0, max)).padStart(env.OTP_LENGTH, "0");
  }

  /**
   * Enforces the two issue-side throttles. Throws 429; never reveals anything
   * about the account, because it only ever looks at challenge rows.
   */
  private async assertMayIssue(email: string, purpose: EmailChallengePurpose) {
    const now = Date.now();

    const latest = await this.challenges.findLatest(email, purpose);

    if (latest) {
      const elapsedSeconds = Math.floor(
        (now - latest.createdAt.getTime()) / 1000
      );
      const remaining = env.OTP_RESEND_COOLDOWN_SECONDS - elapsedSeconds;

      if (remaining > 0) {
        throw tooManyRequests(
          `Wait ${remaining} more second${remaining === 1 ? "" : "s"} before requesting another code`,
          remaining,
          "OTP_COOLDOWN"
        );
      }
    }

    const issuedThisHour = await this.challenges.countSince(
      email,
      new Date(now - 60 * 60_000)
    );

    if (issuedThisHour >= env.OTP_MAX_PER_EMAIL_PER_HOUR) {
      throw tooManyRequests(
        "Too many codes have been requested for this address. Try again later.",
        3600,
        "OTP_HOURLY_LIMIT"
      );
    }
  }

  /**
   * Issue a code and mail it.
   *
   * Order matters and is not the obvious one. The row is written first so the
   * throttles above count this attempt even if delivery then fails — otherwise
   * a broken relay would turn the issue ceiling off. But a row that survives a
   * failed send would be worse still: the student would be told to check an
   * inbox nothing arrived in, and be inside the cooldown when they tried again.
   * So a failed send burns the row it just wrote and rethrows.
   */
  async issue(
    email: string,
    purpose: EmailChallengePurpose,
    body: (code: string, ttlMinutes: number) => Omit<MailMessage, "to">,
    requestIp: string | null
  ): Promise<void> {
    await this.assertMayIssue(email, purpose);

    const code = this.generateCode();
    const codeHash = await bcrypt.hash(code, SALT_ROUNDS);

    const challenge = await this.challenges.issue({
      email,
      purpose,
      codeHash,
      expiresAt: new Date(Date.now() + env.OTP_TTL_MINUTES * 60_000),
      requestIp,
    });

    try {
      await getMailProvider().send({
        to: email,
        ...body(code, env.OTP_TTL_MINUTES),
      });
    } catch (error) {
      await this.challenges.burn(challenge.id);

      throw new AppError(
        "The verification email could not be sent. Please try again shortly.",
        502,
        undefined,
        "MAIL_DELIVERY_FAILED"
      );
    }
  }

  /**
   * Send a message to an address without issuing any code.
   *
   * The "nothing to verify, but do not go silent" path: an address that already
   * has an account, or a staff member who cannot self-serve. Still throttled,
   * because an endpoint that mails unlimited strangers is a mail cannon whether
   * or not the mail contains a code.
   *
   * Delivery failure is swallowed. The caller is being answered identically
   * regardless of what was found, so surfacing an SMTP error here would leak
   * exactly the distinction the identical answer exists to hide.
   */
  async notifyWithoutCode(
    email: string,
    purpose: EmailChallengePurpose,
    message: Omit<MailMessage, "to">,
    requestIp: string | null
  ): Promise<void> {
    await this.assertMayIssue(email, purpose);

    await this.challenges.issue({
      email,
      purpose,
      // No code was generated, and none can match this. The row exists only to
      // hold the throttle; bcrypt over a random string is unguessable by
      // construction because nobody was ever told what it hashes.
      codeHash: await bcrypt.hash(this.generateCode(), SALT_ROUNDS),
      expiresAt: new Date(Date.now() + env.OTP_TTL_MINUTES * 60_000),
      requestIp,
    });

    try {
      await getMailProvider().send({ to: email, ...message });
    } catch {
      // Deliberately ignored — see the note above.
    }
  }

  /**
   * Spend a code.
   *
   * Every failure below throws the same error with the same code, and that
   * uniformity is load-bearing: distinguishing "no such challenge" from "wrong
   * code" from "expired" would tell an attacker which addresses have codes
   * outstanding and let them separate a wrong guess from a dead one, which is
   * how five attempts become unlimited attempts.
   *
   * Throws on failure; returns nothing on success. There is no boolean to
   * accidentally ignore.
   */
  async verify(
    email: string,
    purpose: EmailChallengePurpose,
    code: string
  ): Promise<void> {
    const invalid = () =>
      new AppError(
        "That code is not valid. Request a new one and try again.",
        400,
        undefined,
        "OTP_INVALID"
      );

    const challenge = await this.challenges.findLive(
      email,
      purpose,
      new Date(),
      env.OTP_MAX_ATTEMPTS
    );

    if (!challenge) {
      throw invalid();
    }

    const matches = await bcrypt.compare(code, challenge.codeHash);

    if (!matches) {
      const updated = await this.challenges.recordFailedAttempt(challenge.id);

      // The ceiling is enforced on the way out as well as on the way in: the
      // row is burned the moment the last attempt is spent, rather than being
      // left to be filtered out by the next read.
      if (updated.attempts >= env.OTP_MAX_ATTEMPTS) {
        await this.challenges.burn(challenge.id);
      }

      throw invalid();
    }

    // Atomic single-use. Two requests carrying the same correct code race here
    // and exactly one wins; the loser is indistinguishable from a wrong code,
    // which is the correct outcome for a replay.
    const spent = await this.challenges.consume(challenge.id);

    if (!spent) {
      throw invalid();
    }
  }

  /** Housekeeping hook for the sweep. Keeps consumed rows for a day past expiry. */
  pruneExpired(retentionHours = 24) {
    return this.challenges.pruneExpiredBefore(
      new Date(Date.now() - retentionHours * 60 * 60_000)
    );
  }
}
