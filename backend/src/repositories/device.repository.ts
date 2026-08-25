import { DeviceStatus, Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { buildOrderBy, toSkipTake } from "../utils/pagination.js";

/**
 * Robot/tablet credential storage.
 *
 * `organizationId` is a required first argument on every method that reads more
 * than one row, for the same reason it is on AdminRepository and
 * StudentRepository: an optional tenant filter is one forgotten argument away
 * from listing another university's estate.
 *
 * `secretHash` is never included in a projection meant for a response. It is
 * selected only by `findByKeyId`, which exists to compare it.
 *
 * `canOpenSessions` is absent from every projection and from `create`. The
 * column still exists — it is part of the approved M1 migration — but nothing
 * reads it and nothing writes it, so it stays at its database default of false.
 */

const SORTABLE = ["name", "createdAt", "lastSeenAt", "status"] as const;

/** Everything a console needs, and nothing that could leak a credential. */
const safeSelect = {
  id: true,
  organizationId: true,
  name: true,
  room: true,
  deviceKeyId: true,
  status: true,
  lastSeenAt: true,
  lastIpAddress: true,
  createdById: true,
  revokedAt: true,
  revokedById: true,
  revokedReason: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.RobotDeviceSelect;

export type SafeDevice = Prisma.RobotDeviceGetPayload<{
  select: typeof safeSelect;
}>;

export interface DeviceListFilter {
  status?: DeviceStatus;
  search?: string;
}

export class DeviceRepository {
  async create(data: {
    organizationId: string;
    name: string;
    room: string | null;
    deviceKeyId: string;
    secretHash: string;
    createdById: string;
  }): Promise<SafeDevice> {
    return prisma.robotDevice.create({ data, select: safeSelect });
  }

  /**
   * By id, without the secret. Used by the authentication middleware on every
   * request, which is why it selects no more than it needs.
   */
  async findById(id: string): Promise<SafeDevice | null> {
    return prisma.robotDevice.findUnique({ where: { id }, select: safeSelect });
  }

  /** Scoped lookup for the management console. */
  async findByIdInOrganization(
    id: string,
    organizationId: string
  ): Promise<SafeDevice | null> {
    return prisma.robotDevice.findFirst({
      where: { id, organizationId },
      select: safeSelect,
    });
  }

  /**
   * The one place `secretHash` is read. Not tenant-scoped, and cannot be: a
   * device presents a key id before anyone knows which university it belongs
   * to. The organization comes back with the row and scopes everything after.
   */
  async findByKeyId(deviceKeyId: string) {
    return prisma.robotDevice.findUnique({
      where: { deviceKeyId },
      select: { ...safeSelect, secretHash: true },
    });
  }

  async findManyInOrganization(
    organizationId: string,
    filter: DeviceListFilter,
    page: {
      page: number;
      limit: number;
      sortBy?: string;
      sortOrder: "asc" | "desc";
    }
  ) {
    const where: Prisma.RobotDeviceWhereInput = {
      organizationId,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: "insensitive" } },
              { room: { contains: filter.search, mode: "insensitive" } },
              { deviceKeyId: { contains: filter.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      prisma.robotDevice.findMany({
        where,
        ...toSkipTake(page),
        orderBy: [buildOrderBy(page.sortBy, page.sortOrder, SORTABLE, "createdAt")],
        select: safeSelect,
      }),
      prisma.robotDevice.count({ where }),
    ]);

    return { data, total };
  }

  /**
   * Scoped update. The tenant is part of the WHERE rather than checked
   * beforehand, so there is no window in which another university's row has
   * been loaded, and a mismatched pair simply updates nothing.
   */
  async updateInOrganization(
    id: string,
    organizationId: string,
    data: Prisma.RobotDeviceUncheckedUpdateInput
  ) {
    const { count } = await prisma.robotDevice.updateMany({
      where: { id, organizationId },
      data,
    });

    return count;
  }

  /** Audit stamp written after a successful credential exchange. */
  async touch(id: string, at: Date, ipAddress: string | null) {
    return prisma.robotDevice.update({
      where: { id },
      data: { lastSeenAt: at, lastIpAddress: ipAddress },
      select: safeSelect,
    });
  }
}
