import { z } from "zod";

export const scanAttendanceSchema = z.object({
  token: z.string().min(1, "QR token is required")
});

export type ScanAttendanceInput = z.infer<typeof scanAttendanceSchema>;
