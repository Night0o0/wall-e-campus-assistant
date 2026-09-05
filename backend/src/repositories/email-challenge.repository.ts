import { EmailChallengePurpose } from "@prisma/client";
import prisma from "../lib/prisma.js";

/**
 * One-time code storage.
 *
 * No `organizationId` argument anywhere in this file, and the omission is
 * deliberate rather than an oversight: a challenge is issued before there is an
 * account, so there is no tenant to scope it to. What stands in for the tenant
 * rule here is that `email` is always supplied by the service already
 * lowercased, and that nothing in this file ever returns a code — only its
 * hash, to be compared.
 */
export class EmailChallengeRepository {
  /**
   * The newest code for an address and purpose that is still spendable.
   *
   * "Spendable" is three conditions, and all three are applied in the database
   * rather than in the service: not consumed, not expired, and not out of
   * attempts. A filter that ran in application code would be one early return
   * away from handing back a burned row.
   */
  findLive(email: string, purpose: EmailChallengePurpose, now: Date, maxAttempts: number) {
    return prisma.emailChallenge.findFirst({
      where: {
        email,
        purpose,
        consumedAt: null,
        expiresAt: { gt: now },
        attempts: { lt: maxAttempts },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /** The most recent code for an address and purpose, spendable or not. Feeds the resend cooldown. */
  findLatest(email: string, purpose: EmailChallengePurpose) {
    return prisma.emailChallenge.findFirst({
      where: { email, purpose },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
  }

  /**
   * Codes issued to an address since `since`, counting BOTH purposes.
   *
   * Counting them together is the point. Two separate ceilings would let an
   * attacker alternate purposes and send twice the mail, and the resource being
   * protected — somebody's inbox, and this system's reputation with their mail
   * provider — does not care which kind of code filled it.
   */
  countSince(email: string, since: Date) {
    return prisma.emailChallenge.count({
      where: { email, createdAt: { gte: since } },
    });
  }

  /**
   * Issue a new code, retiring every live one for the same address and purpose
   * in the same transaction.
   *
   * The retirement is what makes "the code in your newest email" unambiguous.
   * Without it, requesting a second code would leave two working codes in two
   * inboxes' worth of history, and the oldest would stay valid for its full
   * TTL — so a code read over someone's shoulder stays good even after they
   * request a fresh one, which is precisely when they most want it not to be.
   */
  async issue(data: {
    email: string;
    purpose: EmailChallengePurpose;
    codeHash: string;
    expiresAt: Date;
    requestIp: string | null;
  }) {
    return prisma.$transaction(async (tx) => {
      await tx.emailChallenge.updateMany({
        where: { email: data.email, purpose: data.purpose, consumedAt: null },
        data: { consumedAt: new Date() },
      });

      return tx.emailChallenge.create({ data });
    });
  }

  /** Records a wrong guess. Returns the updated row so the caller can see the new count. */
  recordFailedAttempt(id: string) {
    return prisma.emailChallenge.update({
      where: { id },
      data: { attempts: { increment: 1 } },
    });
  }

  /**
   * Spend a code, but only if it is still unspent.
   *
   * The `consumedAt: null` in the WHERE clause is the single-use guarantee, and
   * it has to be here rather than in a preceding read: two requests arriving
   * with the same valid code at the same moment would both pass a read-then-
   * write check and both succeed. As an UPDATE … WHERE consumedAt IS NULL, the
   * database serialises them and the second matches zero rows.
   *
   * Returns true if this caller is the one that spent it.
   */
  async consume(id: string): Promise<boolean> {
    const result = await prisma.emailChallenge.updateMany({
      where: { id, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    return result.count === 1;
  }

  /** Burns a row outright — used when the attempt ceiling is reached. */
  async burn(id: string) {
    await prisma.emailChallenge.updateMany({
      where: { id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
  }

  /**
   * Housekeeping. Removes rows that expired before `before` — long after they
   * stopped being spendable, so the audit value of a consumed row survives for
   * a while and only the genuinely dead are dropped.
   */
  async pruneExpiredBefore(before: Date) {
    const result = await prisma.emailChallenge.deleteMany({
      where: { expiresAt: { lt: before } },
    });

    return result.count;
  }
}
