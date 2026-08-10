import { SessionRepository } from "../repositories/session.repository.js";
import { generateQrToken } from "../utils/qr.util.js";
import { conflict, forbidden, notFound } from "../utils/AppError.js";

const sessionRepo = new SessionRepository();

export class SessionService {

    async createSession(title: string, adminId: string, organizationId: string) {
        return sessionRepo.create({ title, createdById: adminId, organizationId });
    }

    async getSession(sessionId: string, organizationId: string) {
        const session = await sessionRepo.findById(sessionId);
        // Same error for missing and out-of-org so the API can't be used to probe other tenants
        if (!session || session.organizationId !== organizationId) {
            throw notFound("Session not found");
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
        if (!session || session.organizationId !== organizationId) {
            throw notFound("Session not found");
        }
        if (session.createdById !== adminId) {
            throw forbidden("Unauthorized to modify this session");
        }
        if (session.status !== 'ACTIVE') {
            throw conflict("Session is not active");
        }

        return sessionRepo.updateStatus(sessionId, 'CLOSED', new Date());
    }

    async getQrToken(sessionId: string, organizationId: string) {
        const session = await sessionRepo.findById(sessionId);
        if (!session || session.organizationId !== organizationId) {
            throw notFound("Session not found");
        }
        if (session.status !== 'ACTIVE') {
            throw conflict("Cannot generate QR for inactive session");
        }

        const token = generateQrToken(session.id, session.qrSecret);
        return { token, expiresIn: 30 };
    }

}
