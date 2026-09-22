// Shared pagination/sorting schemas reused by leaveRequest.validator.ts and
// manager.validator.ts (merged onto their own query schemas via `.merge`).
import { z } from "zod";

// `page`/`limit` query params, coerced from strings to numbers. `limit` is
// capped at 100 so callers can't request unbounded result sets.
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

// Builds a `sortBy`/`sortOrder` schema restricted to an explicit allowlist of
// fields. Callers pass the allowlist per-resource so raw query input can never
// reach Prisma's `orderBy` key (which would allow sorting on arbitrary/unindexed
// columns).
export function sortSchema<T extends [string, ...string[]]>(
  allowedFields: T,
  defaultField: T[number],
) {
  return z.object({
    sortBy: z.enum(allowedFields).default(defaultField),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  });
}
