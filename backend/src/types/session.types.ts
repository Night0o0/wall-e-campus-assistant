import { z } from "zod";

export const createSessionSchema = z.object({
  title: z.string().min(3, "Session title must be at least 3 characters")
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
