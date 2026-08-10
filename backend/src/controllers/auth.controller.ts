import { Request, Response } from "express";
import { AuthService } from "../services/auth.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const authService = new AuthService();

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

export const login = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.login(req.body);

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
