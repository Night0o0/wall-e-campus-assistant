import { AttendanceRepository } from "../repositories/attendance.repository.js";
import { SessionRepository } from "../repositories/session.repository.js";
import { decodeQrTokenUnsafe, verifyQrToken } from "../utils/qr.util.js";
import { badRequest, conflict, forbidden, notFound } from "../utils/AppError.js";

const attendanceRepo = new AttendanceRepository();
const sessionRepo = new SessionRepository();

export class AttendanceService {

    async scanAttendance(token: string, studentId: string, studentOrgId: string) {

        // 1- Decode token without verification to extract sessionId
        const decoded = decodeQrTokenUnsafe(token);
        if (!decoded || !decoded.sessionId) {
            throw badRequest("Invalid QR code");
        }

        // 2- Find the session to get its qrSecret
        const session = await sessionRepo.findById(decoded.sessionId);
        if (!session) {
            throw notFound("Session not found");
        }

        // 3- Verify student belongs to the same organization as the session
        if (session.organizationId !== studentOrgId) {
            throw forbidden("This session does not belong to your university");
        }

        // 4- Verify the token with the actual secret (checks signature + expiry)
        try {
            verifyQrToken(token, session.qrSecret);
        } catch {
            throw badRequest("Invalid or expired QR code");
        }

        // 5- Check session is still active
        if (session.status === "CLOSED") {
            throw conflict("Session is no longer active");
        }

        // 6- Check student hasn't already scanned
        const existingAttendance = await attendanceRepo.findByStudentAndSession(
            studentId, session.id
        );
        if (existingAttendance) {
            throw conflict("Attendance already recorded for this session");
        }

        // 7- Record attendance
        const attendance = await attendanceRepo.create({
            studentId,
            sessionId: session.id,
            status: "PRESENT"
        });

        return attendance;

    }

    async getSessionAttendance(sessionId: string, organizationId: string) {
        // Verify session belongs to organization
        const session = await sessionRepo.findById(sessionId);
        if (!session || session.organizationId !== organizationId) {
            throw notFound("Session not found");
        }
        return attendanceRepo.findBySession(sessionId);
    }

    async getMyAttendance(studentId: string) {
        return attendanceRepo.findByStudent(studentId);
    }

    async getSessionStats(sessionId: string, organizationId: string) {
        // Verify session belongs to organization
        const session = await sessionRepo.findById(sessionId);
        if (!session || session.organizationId !== organizationId) {
            throw notFound("Session not found");
        }
        return attendanceRepo.getSessionStats(sessionId);
    }

    async getAdminAnalytics(adminId: string, organizationId: string) {
        return attendanceRepo.getAdminAnalytics(adminId, organizationId);
    }

}
