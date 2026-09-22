import { z } from "zod";

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export function sortSchema<T extends [string, ...string[]]>(
  allowedFields: T,
  defaultField: T[number],
) {
  return z.object({
    sortBy: z.enum(allowedFields).default(defaultField),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  });
}
