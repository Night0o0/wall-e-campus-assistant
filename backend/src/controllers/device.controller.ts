import { Request, Response } from "express";
import { DeviceService } from "../services/device.service.js";
import { DeviceQuery } from "../types/device.types.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const deviceService = new DeviceService();

/* ---------------------------- Device principal --------------------------- */

/** POST /api/devices/auth — credential exchange. The only unauthenticated one. */
export const authenticateDeviceCredentials = asyncHandler(
  async (req: Request, res: Response) => {
    const result = await deviceService.authenticate(req.body, {
      // Recorded for the audit trail only; nothing is authorized by it.
      ipAddress: req.ip ?? null,
    });

    res.status(200).json(result);
  }
);

/** GET /api/devices/me */
export const getMyDevice = asyncHandler(async (req: Request, res: Response) => {
  const device = await deviceService.describeSelf(req.device!.id);
  res.status(200).json({ device });
});

/** GET /api/devices/me/sessions/active */
export const getMyActiveSessions = asyncHandler(
  async (req: Request, res: Response) => {
    const result = await deviceService.listActiveSessions(req.device!);
    res.status(200).json(result);
  }
);

/** GET /api/devices/me/sessions/:id/qr */
export const getMySessionQr = asyncHandler(
  async (req: Request, res: Response) => {
    const tokenData = await deviceService.issueQrToken(
      req.device!,
      req.params.id as string
    );

    res.status(200).json(tokenData);
  }
);

/* --------------------------- Management console -------------------------- */

/** POST /api/admin/devices — the one response that ever carries a secret. */
export const provisionDevice = asyncHandler(
  async (req: Request, res: Response) => {
    const result = await deviceService.provision(req.body, req.user!);
    res.status(201).json(result);
  }
);

/** GET /api/admin/devices */
export const listDevices = asyncHandler(async (req: Request, res: Response) => {
  const result = await deviceService.list(
    req.validatedQuery as DeviceQuery,
    req.user!
  );

  res.status(200).json(result);
});

/** GET /api/admin/devices/:id */
export const getDevice = asyncHandler(async (req: Request, res: Response) => {
  const device = await deviceService.get(req.params.id as string, req.user!);
  res.status(200).json({ device });
});

/** PATCH /api/admin/devices/:id */
export const updateDevice = asyncHandler(async (req: Request, res: Response) => {
  const device = await deviceService.update(
    req.params.id as string,
    req.body,
    req.user!
  );

  res.status(200).json({ message: "Device updated", device });
});

/** POST /api/admin/devices/:id/rotate-secret */
export const rotateDeviceSecret = asyncHandler(
  async (req: Request, res: Response) => {
    const result = await deviceService.rotateSecret(
      req.params.id as string,
      req.user!
    );

    res.status(200).json(result);
  }
);

/** PATCH /api/admin/devices/:id/revoke */
export const revokeDevice = asyncHandler(async (req: Request, res: Response) => {
  const device = await deviceService.revoke(
    req.params.id as string,
    req.body?.reason,
    req.user!
  );

  res.status(200).json({ message: "Device revoked", device });
});
