import { Prisma } from "@prisma/client";

/**
 * Prisma returns Decimal columns as Decimal objects, which JSON.stringify turns
 * into strings. The dashboard does arithmetic on money, so convert them to
 * numbers on the way out.
 */
export const serialize = <T>(value: T): T => {
  if (value === null || value === undefined) {
    return value;
  }

  if (Prisma.Decimal.isDecimal(value)) {
    return (value as Prisma.Decimal).toNumber() as unknown as T;
  }

  if (value instanceof Date) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(serialize) as unknown as T;
  }

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = serialize(val);
    }
    return out as T;
  }

  return value;
};

/** Decimal | number | string -> number, for internal arithmetic. */
export const toNumber = (
  value: Prisma.Decimal | number | string | null | undefined
): number => {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  return value.toNumber();
};
