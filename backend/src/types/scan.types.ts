import { AppError } from "../utils/AppError.js";

/**
 * The scan flow's machine-readable failure vocabulary.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Why codes exist at all
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A client cannot branch on an HTTP status here: four of the situations below
 * are 409 and two are 403, and they call for completely different responses in
 * the app — retry the camera, tell the student the lecture is over, tell them
 * they are in the wrong room, send them to their profile. It cannot branch on
 * the message either: prose gets reworded, and this product will eventually be
 * read in Arabic.
 *
 * So the code is the contract. The message beside it is for whoever is reading
 * a server log, and the Flutter client must never parse it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Why the messages did not change
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every message below is the one this endpoint already returned. Adding a code
 * is additive: an existing client that shows `message` keeps working unchanged,
 * and a new client ignores it. That is deliberate — the codes were introduced
 * so behaviour could stay still, not as cover for changing it.
 *
 * The one place this bites is QR_EXPIRED. A token whose signature is wrong and
 * a token that is merely thirty seconds old both produced "Invalid or expired
 * QR code", and both still do. They are now told apart by the code, which is
 * exactly the distinction the client needs: one means "hold the camera up
 * again", the other means "this is not our QR code".
 */
export const SCAN_ERROR_CODES = {
  /** Not a QR token this system issued: unparseable, or a bad signature. */
  QR_INVALID: "QR_INVALID",
  /** A genuine token, correctly signed, past its thirty-second life. */
  QR_EXPIRED: "QR_EXPIRED",
  /** The token named a session that does not exist. */
  SESSION_NOT_FOUND: "SESSION_NOT_FOUND",
  /** The session belongs to another university. */
  SESSION_WRONG_ORGANIZATION: "SESSION_WRONG_ORGANIZATION",
  /** Open, but its window has not begun. */
  SESSION_NOT_STARTED: "SESSION_NOT_STARTED",
  /** Open, but the lecture is over — the PENDING state. */
  SESSION_ENDED: "SESSION_ENDED",
  /** Closed, by an instructor or by the sweep. */
  SESSION_CLOSED: "SESSION_CLOSED",
  /** The lecture is not addressed to this student's cohort. */
  NOT_IN_COHORT: "NOT_IN_COHORT",
  /** The student's own profile does not say which cohort they are in. */
  PROFILE_INCOMPLETE: "PROFILE_INCOMPLETE",
  /** This student already has an attendance row for this session. */
  ALREADY_RECORDED: "ALREADY_RECORDED",
} as const;

export type ScanErrorCode =
  (typeof SCAN_ERROR_CODES)[keyof typeof SCAN_ERROR_CODES];

/**
 * The status each code answers with.
 *
 * Kept as one table rather than scattered across throw sites so that the
 * status/code pairing is a single fact that can be read, tested and changed in
 * one place — the previous version of this endpoint decided both inline at six
 * different points and had drifted into answering 403 for one tenant failure
 * and 404 for another.
 */
const SCAN_ERROR_STATUS: Record<ScanErrorCode, number> = {
  QR_INVALID: 400,
  QR_EXPIRED: 400,
  SESSION_NOT_FOUND: 404,
  SESSION_WRONG_ORGANIZATION: 403,
  SESSION_NOT_STARTED: 409,
  SESSION_ENDED: 409,
  SESSION_CLOSED: 409,
  NOT_IN_COHORT: 403,
  PROFILE_INCOMPLETE: 400,
  ALREADY_RECORDED: 409,
};

/** The message each code carries. Every one is what this endpoint said before. */
const SCAN_ERROR_MESSAGE: Record<ScanErrorCode, string> = {
  QR_INVALID: "Invalid QR code",
  QR_EXPIRED: "Invalid or expired QR code",
  SESSION_NOT_FOUND: "Session not found",
  SESSION_WRONG_ORGANIZATION: "This session does not belong to your university",
  SESSION_NOT_STARTED: "This session has not started yet",
  SESSION_ENDED: "This lecture has ended — attendance is no longer being taken",
  SESSION_CLOSED: "Session is no longer active",
  NOT_IN_COHORT: "This lecture is not part of your timetable",
  PROFILE_INCOMPLETE:
    "Complete your academic profile before scanning attendance",
  ALREADY_RECORDED: "Attendance already recorded for this session",
};

export const scanErrorStatus = (code: ScanErrorCode) => SCAN_ERROR_STATUS[code];
export const scanErrorMessage = (code: ScanErrorCode) =>
  SCAN_ERROR_MESSAGE[code];

/**
 * Builds the failure for one code.
 *
 * `message` may be overridden where a specific situation can say something more
 * useful than the general case — the two QR_INVALID situations differ that way.
 * The code and the status never vary, which is what makes them a contract.
 */
export const scanError = (
  code: ScanErrorCode,
  options: { message?: string; details?: unknown } = {}
) =>
  new AppError(
    options.message ?? SCAN_ERROR_MESSAGE[code],
    SCAN_ERROR_STATUS[code],
    options.details,
    code
  );

/* ------------------------------ Success shape ----------------------------- */

/**
 * What a successful scan returns.
 *
 * Declared as a type rather than assembled ad hoc in the service so the
 * contract the Flutter scan page will be written against is a thing that
 * exists, is type-checked, and shows up in a diff when somebody changes it.
 *
 * `attendance` is byte-for-byte what this endpoint already returned. Everything
 * beside it is new and additive: the client needs to render "MEC201 —
 * Electronics, B-204, marked PRESENT" without a second round trip, and none of
 * it is derivable from an attendance row alone.
 *
 * `course` and `lecture` are nullable because an ad-hoc session has neither.
 * The client has to handle that rather than assume a lecture behind every
 * session.
 */
export interface ScanSuccess {
  message: string;
  attendance: {
    id: string;
    studentId: string;
    sessionId: string;
    scanTime: Date;
    status: "PRESENT" | "LATE";
  };
  session: {
    id: string;
    title: string;
    room: string | null;
    /** When attendance opened — what PRESENT/LATE is measured from. */
    startTime: Date;
  };
  course: {
    id: string;
    courseCode: string;
    courseName: string;
  } | null;
  lecture: {
    id: string;
    /** Wall-clock "HH:MM" on the campus timetable. */
    startTime: string;
    endTime: string;
    instructor: string;
  } | null;
}
