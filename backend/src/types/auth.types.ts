import { z } from "zod";

export const registerSchema = z.object({
  universityId: z.string().min(4),
  fullName: z.string().min(3),
  email: z.string().email(),
  password: z.string().min(8),
  organizationCode: z.string().min(2)
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "Password is required")
});

export type LoginInput = z.infer<typeof loginSchema>;