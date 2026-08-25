import { Request, Response } from "express";
import { SessionService } from "../services/session.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { PaginationQuery, paginationSchema } from "../utils/pagination.js";

const sessionService = new SessionService();

/** Strips qrSecret so the signing key never leaves the server. */
const sanitizeSession = <T extends { qrSecret?: string }>(session: T) => {
  const { qrSecret: _qrSecret, ...safe } = session;
  return safe;
};

export const createSession = asyncHandler(
  async (req: Request, res: Response) => {
    // The whole validated body, not field by field: `lectureScheduleId` and
    // `room` are alternatives to each other, and the service is what decides
    // between them. `req.user` supplies the tenant and the author — neither is
    // ever read from the body.
    const session = await sessionService.createSession(req.body, req.user!);
    res.status(201).json(sanitizeSession(session));
  }
);

/**
 * The whole actor, not just the id: who is asking decides how wide the list is.
 * An ADMIN gets the sessions they opened, a super admin gets their university —
 * the same rule `getSession` below applies to one session. See
 * utils/session-access.ts.
 */
export const getMySessions = asyncHandler(
  async (req: Request, res: Response) => {
    const page = await sessionService.listSessionsFor(
      req.user!,
      (req.validatedQuery ?? paginationSchema.parse({})) as PaginationQuery
    );

    // Envelope, not a bare array. Both clients already cope: the web api layer
    // unwraps { data, meta }, and the Flutter client wraps a bare array into
    // { data: ... } itself, so _items finds the same key either way.
    res.status(200).json({
      ...page,
      data: page.data.map(sanitizeSession),
    });
  }
);

// The whole actor, not just the tenant: who is asking decides which sessions
// they may see, and an ADMIN sees the ones they opened. See utils/session-access.ts.
export const getSession = asyncHandler(async (req: Request, res: Response) => {
  const session = await sessionService.getSession(
    req.params.id as string,
    req.user!
  );
  res.status(200).json(sanitizeSession(session));
});

export const closeSession = asyncHandler(async (req: Request, res: Response) => {
  const session = await sessionService.closeSession(
    req.params.id as string,
    req.user!
  );
  res.status(200).json(sanitizeSession(session));
});

export const getQrToken = asyncHandler(async (req: Request, res: Response) => {
  const tokenData = await sessionService.getQrToken(
    req.params.id as string,
    req.user!
  );
  res.status(200).json(tokenData);
});
