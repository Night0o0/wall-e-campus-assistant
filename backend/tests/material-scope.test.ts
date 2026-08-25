import { beforeEach, describe, expect, it, vi } from "vitest";
import { MaterialRepository } from "../src/repositories/material.repository.js";
import { MaterialService } from "../src/services/material.service.js";
import { materialQuerySchema } from "../src/types/material.types.js";

/**
 * Who sees which links, and whether a withdrawn one can be seen at all.
 *
 *   D-6  MaterialService.list passed the query straight to
 *        findManyInOrganization with no addedById filter, so an ADMIN saw every
 *        link in the university on a page whose subtitle said "the links you
 *        publish" - and got Edit and Withdraw buttons on colleagues' rows that
 *        loadEditable then refused with 403.
 *
 *   D-7  the repository hard-defaulted to isActive:true and the client never
 *        sent anything else, so a withdrawn link disappeared entirely. The row
 *        is deliberately KEPT so it can be brought back, but nothing could ask
 *        to see it, and the "Withdrawn" badge could never render.
 */

const ORG = "org-a";
const INSTRUCTOR = { id: "instructor-1", role: "ADMIN", organizationId: ORG };
const SUPER_ADMIN = {
  id: "super-1",
  role: "UNIVERSITY_SUPER_ADMIN",
  organizationId: ORG,
};

const build = () => {
  const queries: { organizationId: string; query: any }[] = [];

  class FakeMaterials extends MaterialRepository {
    override async findManyInOrganization(organizationId: string, query: any) {
      queries.push({ organizationId, query });
      return [] as never;
    }
  }

  return { service: new MaterialService(new FakeMaterials()), queries };
};

/** Runs a raw query string through Zod exactly as the route does. */
const parse = (raw: Record<string, unknown>) => materialQuerySchema.parse(raw);

describe("an instructor sees only the links they published (D-6)", () => {
  it("scopes the query to the caller", async () => {
    const { service, queries } = build();
    await service.list(parse({}), INSTRUCTOR);

    expect(queries[0].query.addedById).toBe(INSTRUCTOR.id);
  });

  it("cannot be widened by a hand-crafted addedById", async () => {
    // The override is applied last and unconditionally, the same construction
    // the tenant clause uses. Asking for a colleague's links returns your own.
    const { service, queries } = build();
    await service.list(parse({ addedById: "11111111-1111-4111-8111-111111111111" }), INSTRUCTOR);

    expect(queries[0].query.addedById).toBe(INSTRUCTOR.id);
  });

  it("still confines the query to the caller's organization", async () => {
    const { service, queries } = build();
    await service.list(parse({}), INSTRUCTOR);

    expect(queries[0].organizationId).toBe(ORG);
  });
});

describe("a super admin sees the whole university (D-6)", () => {
  it("applies no publisher filter by default", async () => {
    // Seeing every link IS the super admin's job; the subtitle is right for
    // them and was only wrong for an ADMIN.
    const { service, queries } = build();
    await service.list(parse({}), SUPER_ADMIN);

    expect(queries[0].query.addedById).toBeUndefined();
  });

  it("may narrow to one publisher deliberately", async () => {
    const target = "11111111-1111-4111-8111-111111111111";
    const { service, queries } = build();
    await service.list(parse({ addedById: target }), SUPER_ADMIN);

    expect(queries[0].query.addedById).toBe(target);
  });
});

describe("withdrawn links can be asked for (D-7)", () => {
  it("defaults to active when nothing is asked", () => {
    expect(parse({}).status).toBe("active");
  });

  it("accepts withdrawn and all", () => {
    expect(parse({ status: "withdrawn" }).status).toBe("withdrawn");
    expect(parse({ status: "all" }).status).toBe("all");
  });

  it("rejects anything else", () => {
    expect(() => parse({ status: "deleted" })).toThrow();
  });

  it("distinguishes 'not asked' from 'asked for both'", () => {
    // The reason this is an enum and not an optional boolean: those two
    // questions are different and a boolean cannot tell them apart.
    expect(parse({}).status).toBe("active");
    expect(parse({ status: "all" }).status).toBe("all");
  });

  it("passes the status through to the repository", async () => {
    const { service, queries } = build();
    await service.list(parse({ status: "withdrawn" }), SUPER_ADMIN);

    expect(queries[0].query.status).toBe("withdrawn");
  });
});
