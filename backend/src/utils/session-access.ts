/**
 * Who may see one attendance session.
 *
 * THIS IS THE ONLY DEFINITION OF THAT RULE. It previously existed in four
 * different shapes: `closeSession` demanded ownership of every caller including
 * super admins, `getSession`, `getQrToken`, `getSessionAttendance` and
 * `getSessionStats` demanded only the right tenant, and `occurrenceStates`
 * applied the instructor narrowing that all of them were reaching for. The
 * result was an ADMIN who could read a colleague's attendance roster and mint
 * their QR code but not close their session, and a super admin who could do
 * neither — an inconsistency with no reading under which all four were right.
 *
 * The rule below is the one the rest of the system already uses for schedules
 * (ScheduleService.getSchedule, SessionService.loadScheduleForOpening,
 * AttendanceLifecycleService.occurrenceStates):
 *
 *   * the tenant is absolute — nothing crosses it, whatever the role;
 *   * an ADMIN is an instructor, and sees the sessions they opened;
 *   * UNIVERSITY_SUPER_ADMIN and SYSTEM_OWNER are scoped to their organization
 *     and no further;
 *   * a STUDENT is scoped to the organization only. Narrowing students to their
 *     own cohort is a separate question that belongs with the QR endpoint guard
 *     (QR_ENDPOINT_STAFF_ONLY) and is deliberately not decided here.
 *
 * Callers answer "not found" rather than "forbidden" when this returns false,
 * for the same reason every other read in this system does: a 403 would confirm
 * that a session id exists, which is exactly what a caller who may not see it
 * must not learn.
 */

export interface SessionAuthActor {
  id: string;
  role: string;
  organizationId: string;
}

/** Just enough of a session to decide the question. */
export interface SessionAuthSubject {
  organizationId: string;
  createdById: string;
}

/**
 * Whether this actor is narrowed to the sessions they opened themselves.
 *
 * Extracted so the LIST endpoint and the single-session check cannot drift
 * apart. They already had: `canSeeSession` let a super admin read any session
 * in their university, while `GET /api/sessions` returned only the ones they
 * had personally created — so a super admin could open a session by id and see
 * its roster, but could not find it in the list it should have been in.
 *
 * That is the same class of inconsistency this file was written to end, so the
 * predicate lives here rather than being restated as `role === "ADMIN"` at each
 * call site.
 */
export const seesOnlyOwnSessions = (actor: SessionAuthActor): boolean =>
  actor.role === "ADMIN";

export const canSeeSession = (
  session: SessionAuthSubject,
  actor: SessionAuthActor
): boolean => {
  // Unconditional, and first: no role widens past its own university.
  if (session.organizationId !== actor.organizationId) {
    return false;
  }

  if (seesOnlyOwnSessions(actor)) {
    return session.createdById === actor.id;
  }

  return true;
};
