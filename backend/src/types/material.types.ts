import { z } from "zod";

/**
 * Course material links.
 *
 * Note what is absent from every schema below: organizationId, and addedById.
 * The tenant comes from the authenticated user, and so does the author. Neither
 * is a field a client can send.
 */

/**
 * Hosts a material link is allowed to point at.
 *
 * An allowlist rather than a blocklist, and a small one. The field is a string
 * typed by a member of staff and then handed to every student on the course as
 * something to tap, which makes a mistyped or pasted-in-anger URL a way to
 * point a whole cohort somewhere they did not intend to go. Restricting it to
 * Drive means the worst case is a broken link rather than an open redirect
 * dressed up as a lecture folder.
 *
 * Subdomains are not accepted — the host must match exactly, so
 * "drive.google.com.evil.test" fails. Widen this list deliberately if the
 * university standardises on something else; do not replace it with a regex.
 */
const ALLOWED_MATERIAL_HOSTS = new Set([
  "drive.google.com",
  "docs.google.com",
]);

/** Exported for the tests, which assert on the policy rather than on prose. */
export const isAllowedMaterialUrl = (value: string): boolean => {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return false;
  }

  // https only. A material link is opened by every student on the course, and
  // http would hand the folder address to anyone on the same campus wifi.
  if (url.protocol !== "https:") {
    return false;
  }

  // Credentials in a URL are never legitimate here and are a classic way to
  // make a hostile host look like a familiar one.
  if (url.username || url.password) {
    return false;
  }

  return ALLOWED_MATERIAL_HOSTS.has(url.hostname.toLowerCase());
};

const driveUrlField = z
  .string()
  .trim()
  .min(1, "A link is required")
  .max(2048, "That link is too long")
  .refine(isAllowedMaterialUrl, {
    message:
      "The link must be an https Google Drive or Google Docs address (drive.google.com or docs.google.com)",
  });

/**
 * The cohort a link is addressed to.
 *
 * `scheduleId` is the ordinary way in: an instructor picks one of their own
 * lectures and the service copies the academic address off it. That is what
 * makes "my second-year mechatronics group" a single choice rather than five
 * free-text fields to retype, and it is also what proves the instructor teaches
 * the cohort they are publishing to.
 *
 * The explicit form exists for a super admin, who administers the whole
 * university and may legitimately publish for a cohort they do not teach. It is
 * rejected for a plain INSTRUCTOR inside the service — see CourseMaterialService.
 */
const explicitCohort = z.object({
  faculty: z.string().trim().min(2).max(100),
  department: z.string().trim().min(2).max(100),
  level: z.number().int().min(1).max(7),
  semester: z.number().int().min(1).max(2),
  /** Omitted or null = every section of the cohort. */
  section: z.string().trim().min(1).max(20).nullish(),
});

export const createMaterialSchema = z
  .object({
    courseId: z.string().uuid("courseId must be a valid id"),
    title: z.string().trim().min(2, "Give the link a name").max(120),
    driveUrl: driveUrlField,
    scheduleId: z.string().uuid("scheduleId must be a valid id").optional(),
    cohort: explicitCohort.optional(),
  })
  .refine((data) => Boolean(data.scheduleId) !== Boolean(data.cohort), {
    message: "Provide either scheduleId or cohort, not both",
    path: ["scheduleId"],
  });

export type CreateMaterialInput = z.infer<typeof createMaterialSchema>;

/**
 * The cohort is not editable. Re-addressing a link to a different year is not
 * an edit, it is a different link — and silently moving one out from under the
 * students already using it is worse than making somebody add a new row.
 */
export const updateMaterialSchema = z
  .object({
    title: z.string().trim().min(2).max(120).optional(),
    driveUrl: driveUrlField.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export type UpdateMaterialInput = z.infer<typeof updateMaterialSchema>;

/** Staff-side browsing. The student side takes no filters at all. */
export const materialQuerySchema = z.object({
  courseId: z.string().uuid().optional(),
  department: z.string().trim().min(1).max(100).optional(),
  level: z.coerce.number().int().min(1).max(7).optional(),
  semester: z.coerce.number().int().min(1).max(2).optional(),
  section: z.string().trim().min(1).max(20).optional(),
  /**
   * Which links to list.
   *
   * Tri-state on purpose, and named `status` rather than a boolean because
   * "not asked" and "asked for both" are different questions that an optional
   * boolean cannot tell apart.
   *
   * Withdrawal is a soft delete - the row is KEPT so a link can be brought
   * back - but the repository hard-defaulted to active and the client never
   * sent anything, so a withdrawn link vanished completely and the "Withdrawn"
   * badge in Materials.tsx could never render (D-7).
   */
  status: z.enum(["active", "withdrawn", "all"]).default("active"),

  /**
   * List only links published by this person.
   *
   * Not settable by an INSTRUCTOR through the query string - the service overrides
   * it from the authenticated actor. Present here so a super admin can narrow
   * to one publisher deliberately.
   */
  addedById: z.string().uuid().optional(),
});

export type MaterialQuery = z.infer<typeof materialQuerySchema>;
