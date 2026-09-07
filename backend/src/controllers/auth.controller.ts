import { Request, Response } from "express";
import { AuthService } from "../services/auth.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const authService = new AuthService();

export const getRegistrationOptions = asyncHandler(
  async (req: Request, res: Response) => {
    const query = req.validatedQuery as { organizationCode: string };
    const result = await authService.getRegistrationOptions(
      query.organizationCode
    );
    res.status(200).json(result);
  }
);

export const register = asyncHandler(async (req: Request, res: Response) => {
  const user = await authService.register(req.body);

  res.status(201).json({
    message: "User registered successfully",
    user: {
      id: user.id,
      universityId: user.universityId,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      isVerified: user.isVerified,
    },
  });
});

export const completeSupabaseRegistration = asyncHandler(
  async (req: Request, res: Response) => {
    const result = await authService.completeSupabaseRegistration(
      req.identity!,
      req.body
    );
    const user = result.user;

    res.status(result.created ? 201 : 200).json({
      message: result.created
        ? "Registration submitted for university approval"
        : "Registration was already completed",
      created: result.created,
      user: {
        id: user.id,
        universityId: user.universityId,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        accountStatus: user.accountStatus,
      },
    });
  }
);

/* ------------------------- Email verification (OTP) ------------------------ */

/**
 * POST /api/auth/verify-email/start
 *
 * Always 200, always the same body. Whether a code was sent, a "you already
 * have an account" note was sent, or nothing was sent, is not visible from
 * here — see AuthService.startEmailVerification.
 */
export const startEmailVerification = asyncHandler(
  async (req: Request, res: Response) => {
    await authService.startEmailVerification(req.body.email, req.ip ?? null);

    res.status(200).json({
      message:
        "If that address can be registered, a verification code is on its way.",
    });
  }
);

/** POST /api/auth/verify-email/confirm — spends the code, returns the ticket. */
export const confirmEmailVerification = asyncHandler(
  async (req: Request, res: Response) => {
    const result = await authService.confirmEmailVerification(
      req.body.email,
      req.body.code
    );

    res.status(200).json({
      message: "Email verified",
      ...result,
    });
  }
);

/* ---------------------------- Password recovery ---------------------------- */

/** POST /api/auth/forgot-password — identical answer for every address. */
export const forgotPassword = asyncHandler(
  async (req: Request, res: Response) => {
    await authService.requestPasswordReset(req.body.email, req.ip ?? null);

    res.status(200).json({
      message: "If that account exists, a reset code is on its way.",
    });
  }
);

/** POST /api/auth/reset-password */
export const resetPassword = asyncHandler(
  async (req: Request, res: Response) => {
    await authService.resetPassword(
      req.body.email,
      req.body.code,
      req.body.newPassword
    );

    res.status(200).json({
      message: "Password updated. Sign in with your new password.",
    });
  }
);

export const login = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.loginForWeb(req.body);

  res.status(200).json({
    message: "Login successful",
    token: result.token,
    user: result.user,
  });
});

/** POST /api/auth/mobile-login — campus app users only. */
export const mobileLogin = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.loginForMobile(req.body);

  res.status(200).json({
    message: "Login successful",
    token: result.token,
    user: result.user,
  });
});

export const getProfile = asyncHandler(async (req: Request, res: Response) => {
  const profile = await authService.getProfile(req.user!.id);
  res.status(200).json({ user: profile });
});

export const changePassword = asyncHandler(
  async (req: Request, res: Response) => {
    await authService.changePassword(
      req.user!.id,
      req.body.currentPassword,
      req.body.newPassword
    );

    res.status(200).json({ message: "Password updated successfully" });
  }
);

export const updateProfile = asyncHandler(
  async (req: Request, res: Response) => {
    const user = await authService.updateProfile(req.user!.id, req.body);
    res.status(200).json({ message: "Profile updated", user });
  }
);
