import { Request, Response } from "express";
import { UserService } from "../services/user.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { serialize } from "../utils/serialize.js";
import { UserQuery } from "../types/user.types.js";

const userService = new UserService();

export const listUsers = asyncHandler(async (req: Request, res: Response) => {
  const result = await userService.list(req.validatedQuery as UserQuery);
  res.status(200).json(serialize(result));
});

export const getUserStats = asyncHandler(async (_req: Request, res: Response) => {
  const stats = await userService.stats();
  res.status(200).json(stats);
});

export const getUser = asyncHandler(async (req: Request, res: Response) => {
  const user = await userService.getById(req.params.id as string);
  res.status(200).json(serialize(user));
});

export const createUser = asyncHandler(async (req: Request, res: Response) => {
  const user = await userService.create(req.body);
  res.status(201).json(serialize(user));
});

export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  const user = await userService.update(
    req.params.id as string,
    req.body,
    req.user!.id
  );
  res.status(200).json(serialize(user));
});

export const resetUserPassword = asyncHandler(
  async (req: Request, res: Response) => {
    await userService.resetPassword(req.params.id as string, req.body.password);
    res.status(200).json({ message: "Password reset successfully" });
  }
);

export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  await userService.remove(req.params.id as string, req.user!.id);
  res.status(200).json({ message: "User deleted successfully" });
});
