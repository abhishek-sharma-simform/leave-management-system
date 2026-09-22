import { z } from "zod";
import { paginationQuerySchema, sortSchema } from "./pagination.validator.ts";

export const managerRequestIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const rejectReasonBodySchema = z.object({
  reason: z.string().trim().min(1, "Rejection reason is required"),
});

export const managerListQuerySchema = paginationQuerySchema.merge(
  sortSchema(["createdAt", "startDate"], "createdAt"),
);
