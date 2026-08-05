import { SessionRepository } from "../repositories/session.repository.js";
import { generateQrToken } from "../utils/qr.util.js";

const sessionRepo = new SessionRepository();

export class SessionService {

    async createSession(title: string, adminId: string, organizationId: string) {
        return sessionRepo.create({ title, createdById: adminId, organizationId });
    }

    async getSession(sessionId: string, organizationId: string) {
        const session = await sessionRepo.findById(sessionId);
        if (!session) {
            throw new Error("Session not found");
        }
        // Verify session belongs to the same organization
        if (session.organizationId !== organizationId) {
            throw new Error("Session not found");
        }
        return session;
    }

    async getMySessions(adminId: string, organizationId: string) {
        return sessionRepo.findByCreator(adminId, organizationId);
    }

    async getOrgSessions(organizationId: string) {
        return sessionRepo.findByOrganization(organizationId);
    }

    async closeSession(sessionId: string, adminId: string, organizationId: string) {
        const session = await sessionRepo.findById(sessionId);
        if (!session) {
            throw new Error("Session not found");
        }
        if (session.organizationId !== organizationId) {
            throw new Error("Session not found");
        }
        if (session.createdById !== adminId) {
            throw new Error("Unauthorized to modify this session");
        }
        if (session.status !== 'ACTIVE') {
            throw new Error("Session is not active");
        }

        return sessionRepo.updateStatus(sessionId, 'CLOSED', new Date());
    }

    async getQrToken(sessionId: string, organizationId: string) {
        const session = await sessionRepo.findById(sessionId);
        if (!session) {
            throw new Error("Session not found");
        }
        if (session.organizationId !== organizationId) {
            throw new Error("Session not found");
        }
        if (session.status !== 'ACTIVE') {
            throw new Error("Cannot generate QR for inactive session");
        }

        const token = generateQrToken(session.id, session.qrSecret);
        return { token, expiresIn: 30 };
    }

}
