import { z } from "zod";

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().optional(),
  sortBy: z.string().trim().optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type PaginationQuery = z.infer<typeof paginationSchema>;

export interface Paginated<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export const toSkipTake = (query: { page: number; limit: number }) => ({
  skip: (query.page - 1) * query.limit,
  take: query.limit,
});

export const paginate = <T>(
  data: T[],
  total: number,
  query: { page: number; limit: number }
): Paginated<T> => {
  const totalPages = Math.max(1, Math.ceil(total / query.limit));

  return {
    data,
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages,
      hasNext: query.page < totalPages,
      hasPrev: query.page > 1,
    },
  };
};

/**
 * Builds a Prisma orderBy from user input, restricted to an allowlist so a
 * query string can't reach into arbitrary relations.
 */
export const buildOrderBy = <T extends string>(
  sortBy: string | undefined,
  sortOrder: "asc" | "desc",
  allowed: readonly T[],
  fallback: T
): Record<string, "asc" | "desc"> => {
  const field = allowed.includes(sortBy as T) ? (sortBy as T) : fallback;
  return { [field]: sortOrder };
};
