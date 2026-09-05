import { SessionCloseReason } from "@prisma/client";
import { SessionRepository } from "../repositories/session.repository.js";
import { ScheduleRepository } from "../repositories/schedule.repository.js";
import { sessionWindowConfig } from "../config/attendance.config.js";
import { CreateSessionInput } from "../types/session.types.js";
import { generateQrToken } from "../utils/qr.util.js";
import {
    canSeeSession,
    isSessionOperator,
    seesOnlyOwnSessions,
} from "../utils/session-access.js";
import {
    PaginationQuery,
    paginate,
    toSkipTake,
} from "../utils/pagination.js";
import { sameOccurrenceWindow, sessionState } from "../utils/session-window.js";
import { badRequest, conflict, forbidden, notFound } from "../utils/AppError.js";

/** Just enough of the authenticated user to scope and authorize an open. */
export interface SessionActor {
    id: string;
    role: string;
    organizationId: string;
}

export class SessionService {

    /**
     * Injected rather than reached for, so the linking rules below can be
     * tested without a database. The defaults keep every existing
     * `new SessionService()` call site working unchanged.
     */
    constructor(
        private readonly sessions = new SessionRepository(),
        private readonly schedules = new ScheduleRepository()
    ) {}

    /**
     * Opens an attendance session.
     *
     * A human act, always. `Session.createdById` is a non-nullable foreign key
     * to User because attendance sessions are opened by staff.
     *
     * When a lecture is named, the room AND the course are copied from it
     * rather than taken from the request.
     *
     * Both copies are deliberate, for different reasons. The room records where
     * attendance was actually taken, so moving the lecture next term must not
     * rewrite where last week's session happened. The course is what every
     * course-level attendance query joins on — `countAttendedByCourse`,
     * `countClosedByCourse`, `findAttendeesOfCourse` — so a linked session that
     * did not carry it would be invisible to all three, and a course's
     * attendance percentage would silently read as though the lecture had never
     * been taught.
     *
     * Neither is reachable from the request body: `createSessionSchema` has no
     * `courseId` field at all, and Zod strips unknown keys, so a client cannot
     * attach a session to a course of its choosing. The course arrives only via
     * `loadScheduleForOpening`, which has already checked the lecture belongs to
     * the caller's organization — so the course, being the lecture's own, is in
     * that organization too.
     */
    async createSession(
        input: CreateSessionInput,
        actor: SessionActor,
        now: Date = new Date()
    ) {
        this.assertOperator(actor);

        const schedule = input.lectureScheduleId
            ? await this.loadScheduleForOpening(input.lectureScheduleId, actor)
            : null;

        if (schedule) {
            await this.assertOccurrenceNotAlreadyOpened(
                schedule.id,
                actor.organizationId,
                now
            );
        }

        return this.sessions.create({
            title: input.title,
            createdById: actor.id,
            organizationId: actor.organizationId,
            lectureScheduleId: schedule?.id ?? null,
            // Null for an ad-hoc session: it belongs to no course, which is what
            // every session looked like before the timetable link existed.
            courseId: schedule?.courseId ?? null,
            // The schedule wins when there is one; the validator has already
            // refused a request that tried to send both.
            room: schedule ? schedule.room : (input.room ?? null),
        });
    }

    async getSession(sessionId: string, actor: SessionActor) {
        return this.loadVisible(sessionId, actor);
    }

    /**
     * The sessions this actor may see, listed.
     *
     * Dispatches on the same predicate `canSeeSession` uses, so the list and
     * the single-session read agree by construction. They did not before: a
     * super admin could open any session in their university by id and read its
     * roster, but `GET /api/sessions` returned only the ones they had opened
     * themselves — so the Sessions page was empty for the one role whose job is
     * to look at everybody's.
     *
     * The tenant is passed separately in both branches and is never derived
     * from anything the caller sent.
     */
    /**
     * One page of the sessions this actor may see.
     *
     * An INSTRUCTOR sees the ones they opened; everybody else sees the whole
     * university. Paginated: this is unbounded history and was returned whole
     * (D-2).
     */
    async listSessionsFor(actor: SessionActor, query: PaginationQuery) {
        this.assertOperator(actor);
        const page = toSkipTake(query);

        const { data, total } = seesOnlyOwnSessions(actor)
            ? await this.sessions.findByCreator(actor.id, actor.organizationId, page)
            : await this.sessions.findByOrganization(actor.organizationId, page);

        return paginate(data, total, query);
    }

    async getMySessions(adminId: string, organizationId: string) {
        return this.sessions.findByCreator(adminId, organizationId);
    }

    async getOrgSessions(organizationId: string) {
        return this.sessions.findByOrganization(organizationId);
    }

    async closeSession(sessionId: string, actor: SessionActor) {
        const session = await this.loadVisible(sessionId, actor);

        if (session.status !== 'ACTIVE') {
            throw conflict("Session is not active");
        }

        // MANUAL, and recorded as such. A session an instructor closed was
        // watched to the end; one the sweep closed was not, and anybody later
        // auditing an absence written against it is entitled to know which.
        return this.sessions.updateStatus(
            sessionId,
            'CLOSED',
            new Date(),
            SessionCloseReason.MANUAL
        );
    }

    /** A rotating QR token for authorized staff projection. */
    async getQrToken(sessionId: string, actor: SessionActor) {
        return this.mintQrToken(await this.loadVisible(sessionId, actor));
    }

    /* ------------------------------ Internals ------------------------------- */

    /**
     * A session this actor is entitled to see, or a 404.
     *
     * "Not found" rather than "forbidden" throughout, including for a session
     * that exists but belongs to another instructor: a 403 would confirm the id
     * is real, which is exactly what a caller who may not see it must not learn.
     */
    private async loadVisible(sessionId: string, actor: SessionActor) {
        const session = await this.sessions.findById(sessionId);

        if (!session || !canSeeSession(session, actor)) {
            throw notFound("Session not found");
        }

        return session;
    }

    private assertOperator(actor: SessionActor) {
        if (!isSessionOperator(actor)) {
            throw forbidden("Only authorized teaching staff may operate attendance sessions");
        }
    }

    /**
     * Issues the code, once the caller has been established as entitled to it.
     *
     * The check is `isScannable`, not `status === 'ACTIVE'`, and that is the
     * same correction made on the scan path: a session whose lecture has ended
     * is still ACTIVE until something closes it, so a status-only test hands
     * out a live-looking code for a lecture that finished. The server would
     * refuse the resulting scan because the window is enforced on the write
     * too, but a QR that cannot be scanned is not a code worth projecting.
     */
    private mintQrToken(session: {
        id: string;
        qrSecret: string;
        status: 'ACTIVE' | 'CLOSED';
        startTime: Date;
        lectureSchedule?: { startTime: string; endTime: string } | null;
    }) {
        const state = sessionState(session, new Date(), sessionWindowConfig);

        if (state !== "IN_PROGRESS") {
            throw conflict(
                state === "UPCOMING"
                    ? "This session has not started yet"
                    : state === "PENDING"
                      ? "This lecture has ended — attendance is no longer being taken"
                      : "Cannot generate QR for inactive session"
            );
        }

        const token = generateQrToken(session.id, session.qrSecret);
        return { token, expiresIn: 30 };
    }

    /**
     * Refuses to open a second session for a lecture occurrence that already
     * has one.
     *
     * This is what stands between a double-tapped "open attendance" button and
     * a student being marked ABSENT from a lecture they sat through. Two
     * sessions for one occurrence are swept independently: the roll is called on
     * each, `findStudentIdsBySession` is per-session, and a student who scanned
     * into the first has no row on the second — so the sweep writes them an
     * absence. The `skipDuplicates` guard on Attendance cannot help, because its
     * unique key is [studentId, sessionId] and these are two different sessions.
     *
     * Scoped by the ±12h window in utils/session-window.ts, which cannot reach
     * another week's occurrence of a weekly slot. Status is deliberately not
     * part of the test: a session that has been closed already had its roll
     * called, so reopening the same occurrence is the more dangerous case, not
     * the safer one.
     *
     * Ad-hoc sessions are not checked and do not need to be — with no lecture
     * behind them they address no cohort, so `sweepOne` writes no absence for
     * them however many are opened.
     *
     * NOTE: this is a service-level check, so two genuinely simultaneous
     * requests can still both pass it. Closing that window needs a partial
     * unique index, which is a migration — see the fix report. The sweep-side
     * guard in AttendanceLifecycleService.sweepOne is what makes the *harm*
     * impossible even when a duplicate does get through.
     */
    private async assertOccurrenceNotAlreadyOpened(
        lectureScheduleId: string,
        organizationId: string,
        now: Date
    ) {
        const { from, to } = sameOccurrenceWindow(now);

        const existing = await this.sessions.findOpenedForScheduleBetween(
            lectureScheduleId,
            organizationId,
            from,
            to
        );

        if (existing.length === 0) {
            return;
        }

        const first = existing[0]!;

        throw conflict(
            first.status === 'ACTIVE'
                ? "Attendance is already open for this lecture — use the session that is already running rather than opening a second one"
                : "Attendance has already been taken for this lecture today, and that session has been closed. Opening a second one would mark everybody who attended the first as absent."
        );
    }

    /**
     * The lecture a session is being opened against, if the caller may open one
     * against it.
     *
     * Three checks, and the order matters. Tenant first, and reported as "not
     * found" rather than "forbidden", so the endpoint cannot be used to discover
     * that a schedule id exists at another university — the same answer
     * ScheduleService gives. Then ownership: an INSTRUCTOR teaches their own lectures
     * and opens attendance for their own lectures, which is the rule
     * ScheduleService.getSchedule already applies to reads. A super admin is
     * scoped to the organization and no further.
     *
     * Deactivated last, and as a 409 rather than a 404: the lecture exists and
     * the caller is entitled to see it, so hiding it here would be a worse
     * answer than saying plainly that it was cancelled.
     */
    private async loadScheduleForOpening(id: string, actor: SessionActor) {
        const schedule = await this.schedules.findById(id);

        if (!schedule || schedule.organizationId !== actor.organizationId) {
            throw notFound("Schedule not found");
        }

        if (actor.role === "INSTRUCTOR" && schedule.instructorId !== actor.id) {
            throw notFound("Schedule not found");
        }

        if (!schedule.isActive) {
            throw conflict(
                "This lecture has been cancelled — attendance cannot be opened for it"
            );
        }

        // Defensive: the schedule validator requires a room, so this cannot be
        // reached through the API. It would fire on data written around it, and
        // a clear refusal now is better than projecting a code with no room.
        if (!schedule.room?.trim()) {
            throw badRequest("This lecture has no room recorded");
        }

        return schedule;
    }

}
