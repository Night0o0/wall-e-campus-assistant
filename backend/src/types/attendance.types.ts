import { z } from "zod";

export const scanAttendanceSchema = z.object({
  token: z.string().min(1, "QR token is required")
});

export type ScanAttendanceInput = z.infer<typeof scanAttendanceSchema>;

/**
 * The student's own attendance history.
 *
 * `courseId` is the only filter, and there is deliberately no `studentId`: the
 * student is the authenticated user, and a history endpoint that accepted a
 * subject would be a history endpoint for reading somebody else's.
 */
export const myAttendanceQuerySchema = z.object({
  courseId: z.string().uuid("courseId must be a valid id").optional(),
});

export type MyAttendanceQuery = z.infer<typeof myAttendanceQuerySchema>;
