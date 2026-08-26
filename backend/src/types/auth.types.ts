import { z } from "zod";
import { env } from "../config/env.js";

export const registerSchema = z.object({
  universityId: z.string().min(4),
  fullName: z.string().min(3),
  email: z.string().email(),
  password: z.string().min(8),
  organizationCode: z.string().min(2),
  /**
   * Proof that the address above was verified by code.
   *
   * Optional in the schema even when STUDENT_EMAIL_VERIFICATION_REQUIRED is on,
   * and the distinction matters: a missing ticket is a domain failure with its
   * own machine-readable code (EMAIL_VERIFICATION_REQUIRED) that a client
   * branches on to open the OTP screen, not a validation error buried in a list
   * of field messages. AuthService decides; Zod only carries.
   */
  verificationTicket: z.string().min(1).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const completeSupabaseRegistrationSchema = z.object({
  universityId: z.string().trim().min(4).max(50),
  fullName: z.string().trim().min(3).max(120),
  organizationCode: z.string().trim().min(2).max(50),
});

export type CompleteSupabaseRegistrationInput = z.infer<
  typeof completeSupabaseRegistrationSchema
>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "Password is required")
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * The native app has a deliberately narrower account surface than the web
 * console. Keeping a separate schema/route makes that policy visible in the
 * API instead of trusting a Flutter navigation check for authorization.
 */
export const mobileLoginSchema = loginSchema;

export type MobileLoginInput = z.infer<typeof mobileLoginSchema>;

/* ------------------------- Email verification (OTP) ------------------------ */

/**
 * A one-time code as the client sends it.
 *
 * Digits only, and exactly OTP_LENGTH of them, so a malformed entry is refused
 * before it reaches bcrypt — a code is compared with a deliberately slow hash,
 * and letting arbitrary strings through would make this endpoint a cheap way to
 * spend the server's CPU. The length comes from the same config the generator
 * reads, so the two cannot drift apart.
 */
const otpCode = z
  .string()
  .trim()
  .regex(
    new RegExp(`^\\d{${env.OTP_LENGTH}}$`),
    `The code is ${env.OTP_LENGTH} digits`
  );

export const startEmailVerificationSchema = z.object({
  email: z.string().email(),
});

export const confirmEmailVerificationSchema = z.object({
  email: z.string().email(),
  code: otpCode,
});

export type StartEmailVerificationInput = z.infer<
  typeof startEmailVerificationSchema
>;
export type ConfirmEmailVerificationInput = z.infer<
  typeof confirmEmailVerificationSchema
>;

/* ---------------------------- Password recovery ---------------------------- */

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  email: z.string().email(),
  code: otpCode,
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
