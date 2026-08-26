import {
    attendanceConfig,
    sessionWindowConfig,
} from "../config/attendance.config.js";
import { env } from "../config/env.js";
import { AttendanceRepository } from "../repositories/attendance.repository.js";
import { SessionRepository } from "../repositories/session.repository.js";
import { StudentRepository } from "../repositories/student.repository.js";
import { ScanSuccess, scanError } from "../types/scan.types.js";
import { decodeQrTokenUnsafe, verifyQrToken } from "../utils/qr.util.js";
import { punctuality, sessionState } from "../utils/session-window.js";
import { SessionAuthActor, canSeeSession } from "../utils/session-access.js";
import { cohortMatches, resolveCohort } from "../utils/cohort.js";
import { notFound } from "../utils/AppError.js";

/** What the scan path knows about the student doing the scanning. */
export interface ScanActor {
    id: string;
    organizationId: string;
}

export class AttendanceService {

    /**
     * Injected rather than reached for, so the scan rules below can be tested
     * without a database. The defaults keep every existing
     * `new AttendanceService()` call site working unchanged.
     */
    constructor(
        private readonly attendanceRepo = new AttendanceRepository(),
        private readonly sessionRepo = new SessionRepository(),
        private readonly studentRepo = new StudentRepository()
    ) {}

    /**
     * Records one student's attendance from a QR code.
     *
     * ─────────────────────────────────────────────────────────────────────────
     * The identity of the person being recorded
     * ─────────────────────────────────────────────────────────────────────────
     *
     * `actor` comes from the authenticated token and from nowhere else. There
     * is no studentId in the request body, no studentId in the QR token — the
     * token carries a sessionId and nothing more — and no path by which a
     * caller can name somebody other than themselves. Proxy attendance is
     * prevented here by there being no parameter to abuse, not by a check that
     * could be forgotten.
     *
     * The organization is read the same way, off the authenticated user, so the
     * tenant comparison below is between two server-held facts.
     *
     * ─────────────────────────────────────────────────────────────────────────
     * The order of the checks, which is itself a security property
     * ─────────────────────────────────────────────────────────────────────────
     *
     * The signature is verified BEFORE anything is reported about the session.
     * Previously the tenant check ran first, which turned this endpoint into an
     * oracle: send an unsigned token naming a guessed session id and the status
     * told you whether that session existed in your university. Nothing is now
     * disclosed about a session until the caller has proved they hold a code
     * this server issued for it.
     *
     * Everything after that point is disclosed freely and deliberately. A
     * caller holding a valid signature already possesses proof the session
     * exists, so distinguishing "wrong university" from "wrong cohort" from
     * "lecture already over" leaks nothing they did not bring with them — and
     * each is something the student can actually act on.
     */
    async scanAttendance(
        token: string,
        actor: ScanActor,
        now: Date = new Date()
    ): Promise<ScanSuccess> {

        // 1- Decode without verifying, purely to learn which session's secret
        // this token should be checked against. Nothing here is trusted.
        const decoded = decodeQrTokenUnsafe(token);

        if (!decoded || !decoded.sessionId) {
            throw scanError("QR_INVALID");
        }

        const session = await this.sessionRepo.findForScan(decoded.sessionId);

        if (!session) {
            throw scanError("SESSION_NOT_FOUND");
        }

        // 2- Prove the token is ours before saying anything about the session.
        this.verifyToken(token, session.qrSecret);

        // 3- Tenant. Two server-held facts, never a client-supplied id.
        if (session.organizationId !== actor.organizationId) {
            throw scanError("SESSION_WRONG_ORGANIZATION");
        }

        // 4- Cohort. The lecture must be one this student is entitled to sit in.
        await this.assertEligible(session, actor);

        /**
         * 5- The session must be genuinely scannable, not merely ACTIVE.
         *
         * A session stays ACTIVE until something closes it, so a lecture that
         * ended an hour ago is still ACTIVE — and a status-only check would let
         * a student record attendance for it. The attendance worker exists to
         * close such sessions, but it must never be the only thing preventing
         * this: a worker that is disabled, crashed, or between passes would
         * otherwise leave every expired lecture scannable.
         *
         * Enforced here, on the write, against the same `sessionState` the QR
         * endpoint uses. Exactly one state may record attendance.
         */
        const state = sessionState(session, now, sessionWindowConfig);

        if (state !== "IN_PROGRESS") {
            throw scanError(
                state === "UPCOMING"
                    ? "SESSION_NOT_STARTED"
                    : state === "PENDING"
                      ? "SESSION_ENDED"
                      : "SESSION_CLOSED"
            );
        }

        /**
         * 6- One row per student per session.
         *
         * Checked here so a repeat scan gets a clear answer rather than a
         * database error, and backed by the unique constraint on
         * [studentId, sessionId] underneath, which is what actually holds when
         * two scans race. Note that this refuses rather than updates: a student
         * who scanned once is already recorded, and a second scan must never be
         * able to rewrite a LATE into a PRESENT — or overwrite an ABSENT the
         * sweep wrote, which is why the check is on the row's existence and not
         * on its status.
         */
        const existing = await this.attendanceRepo.findByStudentAndSession(
            actor.id,
            session.id
        );

        if (existing) {
            throw scanError("ALREADY_RECORDED");
        }

        // 7- PRESENT or LATE, measured from when attendance opened rather than
        // from the timetable: an instructor who starts ten minutes behind has
        // not made their whole class late.
        const attendance = await this.attendanceRepo.create({
            studentId: actor.id,
            sessionId: session.id,
            status: punctuality(
                session.startTime,
                now,
                attendanceConfig.lateAfterMinutes
            ),
        });

        return this.presentScan(attendance, session);
    }

    /* ------------------------------ Scan internals ---------------------------- */

    /**
     * Verifies the presented token against the session's own secret.
     *
     * The two failures are told apart because they mean opposite things to the
     * person holding the phone: an expired token is the normal consequence of
     * the code rotating every thirty seconds and the answer is to scan again,
     * while a bad signature means this is not a code this system issued. Both
     * keep the message they have always had; the code is what distinguishes
     * them. See types/scan.types.ts.
     */
    private verifyToken(token: string, qrSecret: string) {
        try {
            verifyQrToken(token, qrSecret);
        } catch (error) {
            const expired =
                error instanceof Error && error.name === "TokenExpiredError";

            throw scanError(expired ? "QR_EXPIRED" : "QR_INVALID", {
                // Unchanged from before this endpoint had codes: a signature
                // failure and an expiry have always read the same to a human.
                message: "Invalid or expired QR code",
            });
        }
    }

    /**
     * Whether this student is entitled to be in this lecture.
     *
     * The cohort is read from the student's own stored profile and compared
     * against the lecture's academic address using the one shared definition in
     * utils/cohort.ts — the same comparison that decides whether the lecture
     * appears on their timetable. Nothing about the cohort is accepted from the
     * request: there is no faculty, department, level, semester or section
     * anywhere in the scan body, and no course or organization id either.
     *
     * A session with no lecture behind it has no cohort to compare against, so
     * the check is undefined rather than passed — governed by
     * SCAN_ALLOW_UNLINKED_SESSIONS, which ships permissive so that makeup
     * classes and one-off seminars keep working. See the note on it in
     * config/env.ts.
     */
    private async assertEligible(
        session: {
            organizationId: string;
            lectureSchedule: {
                organizationId: string;
                faculty: string;
                department: string;
                level: number;
                semester: number;
                section: string;
            } | null;
        },
        actor: ScanActor
    ) {
        const schedule = session.lectureSchedule;

        if (!schedule) {
            if (env.SCAN_ALLOW_UNLINKED_SESSIONS) {
                return;
            }

            throw scanError("NOT_IN_COHORT");
        }

        // Belt and braces over the foreign key, for the same reason the absence
        // sweep does it: a session and its lecture are written in one
        // organization and cannot drift apart, but attendance is a claim about
        // a named person and is not worth writing on an assumption.
        if (schedule.organizationId !== session.organizationId) {
            throw scanError("SESSION_WRONG_ORGANIZATION");
        }

        const profile = await this.studentRepo.findByUserId(actor.id);
        const cohort = resolveCohort(profile);

        if (!cohort.ok) {
            // A student who cannot be placed in a cohort cannot be shown to
            // belong in this lecture. Refusing is the only safe answer: the
            // alternative is recording attendance for somebody whose timetable
            // this lecture may never have appeared on.
            throw scanError("PROFILE_INCOMPLETE", {
                details:
                    cohort.reason === "MISSING_FIELDS"
                        ? { missingFields: cohort.missingFields }
                        : { invalidFields: ["semester"], semester: cohort.semester },
            });
        }

        if (!cohortMatches(schedule, cohort.criteria)) {
            throw scanError("NOT_IN_COHORT");
        }
    }

    /**
     * The success payload.
     *
     * `attendance` is exactly what this endpoint returned before. Everything
     * beside it is what the scan page has to render — course code, room, the
     * lecture's own hours — and none of it can be derived from an attendance
     * row. `qrSecret` is on the session object read above and is deliberately
     * not projected here.
     */
    private presentScan(
        attendance: {
            id: string;
            studentId: string;
            sessionId: string;
            scanTime: Date;
            status: string;
        },
        session: {
            id: string;
            title: string;
            room: string | null;
            startTime: Date;
            course: { id: string; courseCode: string; courseName: string } | null;
            lectureSchedule: {
                id: string;
                startTime: string;
                endTime: string;
                instructor: { fullName: string };
            } | null;
        }
    ): ScanSuccess {
        return {
            message: "Attendance recorded successfully",
            attendance: {
                id: attendance.id,
                studentId: attendance.studentId,
                sessionId: attendance.sessionId,
                scanTime: attendance.scanTime,
                status: attendance.status as "PRESENT" | "LATE",
            },
            session: {
                id: session.id,
                title: session.title,
                room: session.room,
                startTime: session.startTime,
            },
            course: session.course
                ? {
                      id: session.course.id,
                      courseCode: session.course.courseCode,
                      courseName: session.course.courseName,
                  }
                : null,
            lecture: session.lectureSchedule
                ? {
                      id: session.lectureSchedule.id,
                      startTime: session.lectureSchedule.startTime,
                      endTime: session.lectureSchedule.endTime,
                      instructor: session.lectureSchedule.instructor.fullName,
                  }
                : null,
        };
    }

    async getSessionAttendance(sessionId: string, actor: SessionAuthActor) {
        await this.loadVisible(sessionId, actor);
        return this.attendanceRepo.findBySession(sessionId);
    }

    async getMyAttendance(studentId: string, filter: { courseId?: string } = {}) {
        return this.attendanceRepo.findByStudent(studentId, filter);
    }

    /**
     * The student's own attendance, tallied per subject and overall.
     *
     * Every total here is a count of recorded attendance, and the field is named
     * `recordedLectures` so that it cannot quietly be read as a lecture count. A
     * lecture for which nobody opened a session leaves no row behind, so it
     * appears in neither the numerator nor the denominator — see
     * AttendanceStatus in schema.prisma for why that absence is deliberate and
     * must not be papered over with a synthetic row.
     *
     * `attendanceRate` follows from the same rule: it is the share of *recorded*
     * lectures attended. It is null when nothing has been recorded yet, rather
     * than 0%, because a student with no records has not missed anything.
     *
     * Sessions opened ad hoc carry no course. Their rows are counted in the
     * overall total and collected under a single null-course bucket rather than
     * being dropped, because they are still attendance the student earned.
     */
    async getMyAttendanceSummary(studentId: string) {
        const rows = await this.attendanceRepo.findStatusesByStudent(studentId);

        interface Tally {
            course: { id: string; courseCode: string; courseName: string } | null;
            present: number;
            late: number;
            absent: number;
        }

        const NO_COURSE = "__no_course__";
        const byCourse = new Map<string, Tally>();

        const overall = { present: 0, late: 0, absent: 0 };

        for (const row of rows) {
            const course = row.session.course;
            const key = course?.id ?? NO_COURSE;

            if (!byCourse.has(key)) {
                byCourse.set(key, { course, present: 0, late: 0, absent: 0 });
            }

            const tally = byCourse.get(key)!;

            switch (row.status) {
                case "PRESENT":
                    tally.present += 1;
                    overall.present += 1;
                    break;
                case "LATE":
                    tally.late += 1;
                    overall.late += 1;
                    break;
                case "ABSENT":
                    tally.absent += 1;
                    overall.absent += 1;
                    break;
            }
        }

        const present = (tally: Omit<Tally, "course">) => {
            const recordedLectures = tally.present + tally.late + tally.absent;
            const attended = tally.present + tally.late;

            return {
                present: tally.present,
                late: tally.late,
                absent: tally.absent,
                // Named for what it is: how many lectures produced a record,
                // not how many lectures took place.
                recordedLectures,
                attended,
                attendanceRate:
                    recordedLectures === 0
                        ? null
                        : Number(((attended / recordedLectures) * 100).toFixed(1)),
            };
        };

        const courses = [...byCourse.values()]
            .map(({ course, ...tally }) => ({ course, ...present(tally) }))
            .sort((a, b) =>
                (a.course?.courseCode ?? "").localeCompare(b.course?.courseCode ?? "")
            );

        return { overall: present(overall), courses };
    }

    async getSessionStats(sessionId: string, actor: SessionAuthActor) {
        await this.loadVisible(sessionId, actor);
        return this.attendanceRepo.getSessionStats(sessionId);
    }

    /**
     * The same visibility rule the session routes apply, from the same
     * definition: the tenant is absolute, and an INSTRUCTOR is an instructor who
     * reads their own sessions. Answering "not found" rather than "forbidden"
     * keeps a roster from confirming that somebody else's session id is real.
     */
    private async loadVisible(sessionId: string, actor: SessionAuthActor) {
        const session = await this.sessionRepo.findById(sessionId);

        if (!session || !canSeeSession(session, actor)) {
            throw notFound("Session not found");
        }

        return session;
    }

    async getAdminAnalytics(adminId: string, organizationId: string) {
        return this.attendanceRepo.getAdminAnalytics(adminId, organizationId);
    }

}
