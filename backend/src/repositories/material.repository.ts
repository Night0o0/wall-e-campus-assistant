import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { MaterialQuery } from "../types/material.types.js";

/**
 * Course material links.
 *
 * Every method takes organizationId as a required first argument and spreads it
 * last into the where clause, so no filter derived from a request can displace
 * it — the same construction as UserRepository.findManyInOrganization.
 */

const withRelations = {
  course: {
    select: { id: true, courseCode: true, courseName: true },
  },
  addedBy: {
    select: { id: true, fullName: true },
  },
} satisfies Prisma.CourseMaterialInclude;

export class MaterialRepository {
  /**
   * Everything published to one student's cohort.
   *
   * The section rule is the interesting part: a row matches when it names the
   * student's own section OR names no section at all, because NULL means "every
   * section of this cohort". Written as an OR here rather than filtered in the
   * service so the database can use the cohort index and return only the rows
   * that are actually wanted.
   *
   * faculty, department and section are free text on both sides — a member of
   * staff typed one and a student typed the other — so they are compared
   * case-insensitively, exactly as the timetable lookup does.
   */
  async findForCohort(
    organizationId: string,
    criteria: {
      faculty: string;
      department: string;
      level: number;
      semester: number;
      section: string;
    }
  ) {
    return prisma.courseMaterial.findMany({
      where: {
        faculty: { equals: criteria.faculty, mode: "insensitive" },
        department: { equals: criteria.department, mode: "insensitive" },
        level: criteria.level,
        semester: criteria.semester,
        OR: [
          { section: null },
          { section: { equals: criteria.section, mode: "insensitive" } },
        ],
        isActive: true,
        organizationId,
      },
      include: withRelations,
      orderBy: [{ createdAt: "desc" }],
    });
  }

  /** The staff-side listing, narrowed by whatever the caller asked for. */
  async findManyInOrganization(organizationId: string, query: MaterialQuery) {
    return prisma.courseMaterial.findMany({
      where: {
        ...(query.courseId ? { courseId: query.courseId } : {}),
        ...(query.department
          ? { department: { equals: query.department, mode: "insensitive" } }
          : {}),
        ...(query.level !== undefined ? { level: query.level } : {}),
        ...(query.semester !== undefined ? { semester: query.semester } : {}),
        ...(query.section
          ? { section: { equals: query.section, mode: "insensitive" } }
          : {}),
        // Only the publisher's own links when the service says so. An INSTRUCTOR
        // may not widen this - MaterialService overrides it from the token.
        ...(query.addedById ? { addedById: query.addedById } : {}),

        // Active by default: a withdrawn link is history, not a listing. But
        // "all" and "withdrawn" are askable, because the row is kept precisely
        // so it can be seen and reactivated (D-7).
        ...(query.status === "all" ? {} : { isActive: query.status !== "withdrawn" }),

        // Last, and not optional.
        organizationId,
      },
      include: withRelations,
      orderBy: [{ createdAt: "desc" }],
    });
  }

  /** One link, but only if it belongs to this organization. */
  async findInOrganization(id: string, organizationId: string) {
    return prisma.courseMaterial.findFirst({
      where: { id, organizationId },
      include: withRelations,
    });
  }

  async create(data: Prisma.CourseMaterialUncheckedCreateInput) {
    return prisma.courseMaterial.create({
      data,
      include: withRelations,
    });
  }

  async update(id: string, data: Prisma.CourseMaterialUpdateInput) {
    return prisma.courseMaterial.update({
      where: { id },
      data,
      include: withRelations,
    });
  }
}
