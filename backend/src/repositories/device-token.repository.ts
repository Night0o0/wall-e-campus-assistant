import { DevicePlatform } from "@prisma/client";
import prisma from "../lib/prisma.js";

/**
 * Push registrations. Nothing delivers to these yet — see
 * PushNotificationProvider — but the handset has to be able to register from
 * the day the mobile client ships, and a token that was never stored cannot be
 * back-filled.
 */
export class DeviceTokenRepository {
  /**
   * Re-registering the same token moves it to the current owner and reactivates
   * it. A token is issued to a device, not to a person: after a shared handset
   * changes hands the previous owner must stop receiving on it.
   */
  async register(input: {
    token: string;
    userId: string;
    organizationId: string;
    platform: DevicePlatform;
  }) {
    const now = new Date();

    return prisma.deviceToken.upsert({
      where: { token: input.token },
      create: { ...input, lastSeenAt: now },
      update: {
        userId: input.userId,
        organizationId: input.organizationId,
        platform: input.platform,
        isActive: true,
        lastSeenAt: now,
      },
    });
  }

  /**
   * Retire tokens the push provider reported as permanently gone
   * (unregistered/invalid). Not owner-scoped: the provider is authoritative
   * that these handsets no longer exist, so there is nobody to scope to, and
   * leaving them active would retry a dead device on every future send.
   */
  async deactivateTokens(tokens: string[]) {
    if (tokens.length === 0) return 0;

    const { count } = await prisma.deviceToken.updateMany({
      where: { token: { in: tokens }, isActive: true },
      data: { isActive: false },
    });

    return count;
  }

  /** Scoped to the owner, so one user cannot unregister another user's device. */
  async deactivate(token: string, userId: string, organizationId: string) {
    const { count } = await prisma.deviceToken.updateMany({
      where: { token, userId, organizationId, isActive: true },
      data: { isActive: false },
    });

    return count;
  }

  async findActiveForUser(userId: string) {
    return prisma.deviceToken.findMany({
      where: { userId, isActive: true },
      orderBy: { lastSeenAt: "desc" },
    });
  }

  async listForUser(userId: string, organizationId: string) {
    return prisma.deviceToken.findMany({
      where: { userId, organizationId },
      orderBy: { lastSeenAt: "desc" },
    });
  }
}
