import { z } from "zod";

export const metricsQuerySchema = z.object({
  months: z.coerce.number().int().min(3).max(24).default(8),
});

export type MetricsQuery = z.infer<typeof metricsQuerySchema>;
