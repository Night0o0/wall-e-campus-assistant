import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { attendedCount } from "../src/repositories/session.repository.js";

/**
 * B2 — what the word "attendance" counts.
 *
 * An Attendance row is written for two entirely different reasons: a student
 * scanned (PRESENT or LATE), or the roll was called and they were not there
 * (ABSENT). An unfiltered `_count` over the relation therefore stopped meaning
 * "attendance" the moment the absence sweep was introduced and started meaning
 * "cohort size" — a lecture three people came to would have reported 24 on the
 * robot's screen, in the admin analytics and in the attendance log.
 *
 * Nothing had failed yet only because no ABSENT row had ever been written. The
 * bug was armed by the lifecycle work, not caused by it.
 *
 * These assertions are deliberately structural. A Prisma projection cannot be
 * exercised without a database, so what is pinned here is the definition itself
 * and the absence of any remaining site that bypasses it — which is exactly the
 * shape the defect had: one corrected site (`getSessionStats`) and four
 * uncorrected ones that nobody had noticed disagreed with it.
 */

const repositorySource = (name: string) =>
  readFileSync(
    join(__dirname, "..", "src", "repositories", `${name}.repository.ts`),
    "utf8"
  );

describe("what an attendanceCount counts", () => {
  it("excludes ABSENT from the shared session count", () => {
    expect(attendedCount).toEqual({
      select: { attendances: { where: { status: { not: "ABSENT" } } } },
    });
  });

  it("leaves no unfiltered attendance count anywhere in the repositories", () => {
    // `attendances: true` inside a `_count` select is the exact shape of the
    // bug. There is no legitimate remaining use of it: where the roll size is
    // wanted, getSessionStats reports it separately as `roll`.
    for (const name of ["session", "attendance"]) {
      const source = repositorySource(name);

      expect(
        source,
        `${name}.repository.ts still counts attendances without excluding ABSENT`
      ).not.toMatch(/attendances:\s*true/);
    }
  });

  it("filters ABSENT out of every place the session repository counts attendance", () => {
    const source = repositorySource("session");

    // Four projections carried the unfiltered count: findByOrganization,
    // findActiveByOrganization (the robot's screen), findByCreator and
    // findByScheduleBetween (the attendance log). All four now go through the
    // one exported constant, so there is a single definition to change.
    const uses = source.match(/_count:\s*attendedCount/g) ?? [];

    expect(uses).toHaveLength(4);
  });

  it("filters ABSENT out of the admin analytics, counts and unique students alike", () => {
    const source = repositorySource("attendance");

    // getAdminAnalytics builds its own count and its own distinct-student
    // query rather than sharing the session projection, so both need the
    // exclusion independently — averageAttendancePerSession and
    // totalUniqueStudents are derived from them.
    expect(source).toMatch(
      /attendances:\s*\{\s*where:\s*\{\s*status:\s*\{\s*not:\s*'ABSENT'\s*\}\s*\}\s*\}/
    );
    expect(source).toMatch(
      /session:\s*\{\s*createdById:\s*adminId,\s*organizationId\s*\},\s*\n\s*status:\s*\{\s*not:\s*'ABSENT'\s*\}/
    );
  });

  it("keeps the sibling-evidence lookup to PRESENT and LATE", () => {
    // findAttendedStudentIdsBySessions answers "is there evidence this student
    // was there". An ABSENT row is evidence of the opposite, so counting it
    // would let one duplicate session's roll suppress the other's absences.
    const source = repositorySource("attendance");
    const method = source.slice(
      source.indexOf("async findAttendedStudentIdsBySessions")
    );

    expect(method.slice(0, 600)).toMatch(/status:\s*\{\s*not:\s*'ABSENT'\s*\}/);
  });
});
