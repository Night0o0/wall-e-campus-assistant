import { Request, Response } from "express";
import { SessionService } from "../services/session.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const sessionService = new SessionService();

/** Strips qrSecret so the signing key never leaves the server. */
const sanitizeSession = <T extends { qrSecret?: string }>(session: T) => {
  const { qrSecret: _qrSecret, ...safe } = session;
  return safe;
};

export const createSession = asyncHandler(
  async (req: Request, res: Response) => {
    const session = await sessionService.createSession(
      req.body.title,
      req.user!.id,
      req.user!.organizationId
    );
    res.status(201).json(sanitizeSession(session));
  }
);

export const getMySessions = asyncHandler(
  async (req: Request, res: Response) => {
    const sessions = await sessionService.getMySessions(
      req.user!.id,
      req.user!.organizationId
    );
    res.status(200).json(sessions.map(sanitizeSession));
  }
);

export const getSession = asyncHandler(async (req: Request, res: Response) => {
  const session = await sessionService.getSession(
    req.params.id as string,
    req.user!.organizationId
  );
  res.status(200).json(sanitizeSession(session));
});

export const closeSession = asyncHandler(async (req: Request, res: Response) => {
  const session = await sessionService.closeSession(
    req.params.id as string,
    req.user!.id,
    req.user!.organizationId
  );
  res.status(200).json(sanitizeSession(session));
});

export const getQrToken = asyncHandler(async (req: Request, res: Response) => {
  const tokenData = await sessionService.getQrToken(
    req.params.id as string,
    req.user!.organizationId
  );
  res.status(200).json(tokenData);
});
