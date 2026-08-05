import { Request, Response } from "express";
import { SessionService } from "../services/session.service.js";

const sessionService = new SessionService();

// Helper to strip qrSecret from session responses
const sanitizeSession = (session: any) => {
    const { qrSecret, ...safe } = session;
    return safe;
};

export const createSession = async (req: Request, res: Response) => {
    try {
        const adminId = req.user!.id;
        const orgId = req.user!.organizationId;
        const { title } = req.body;
        const session = await sessionService.createSession(title, adminId, orgId);
        res.status(201).json(sanitizeSession(session));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getMySessions = async (req: Request, res: Response) => {
    try {
        const adminId = req.user!.id;
        const orgId = req.user!.organizationId;
        const sessions = await sessionService.getMySessions(adminId, orgId);
        res.status(200).json(sessions.map(sanitizeSession));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getSession = async (req: Request, res: Response) => {
    try {
        const sessionId = req.params.id;
        const orgId = req.user!.organizationId;
        const session = await sessionService.getSession(sessionId, orgId);
        res.status(200).json(sanitizeSession(session));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const closeSession = async (req: Request, res: Response) => {
    try {
        const sessionId = req.params.id;
        const adminId = req.user!.id;
        const orgId = req.user!.organizationId;
        const session = await sessionService.closeSession(sessionId, adminId, orgId);
        res.status(200).json(sanitizeSession(session));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getQrToken = async (req: Request, res: Response) => {
    try {
        const sessionId = req.params.id;
        const orgId = req.user!.organizationId;
        const tokenData = await sessionService.getQrToken(sessionId, orgId);
        res.status(200).json(tokenData);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};
