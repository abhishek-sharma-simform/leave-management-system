// Zod schemas for the /manager routes. manager.controller.ts has no
// manager.service.ts (documented exception in CLAUDE.md/README) and calls
// Prisma directly, but shape validation still goes through these schemas the
// same as every other route.
import { z } from "zod";
import { paginationQuerySchema, sortSchema } from "./pagination.validator.ts";

// `:id` route param (a leave request id) for GET/approve/reject.
export const managerRequestIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// Body for POST /manager/requests/:id/reject — a non-empty, trimmed reason is
// required; approve has no body schema since it takes no input.
export const rejectReasonBodySchema = z.object({
  reason: z.string().trim().min(1, "Rejection reason is required"),
});

// Query params for GET /manager/requests: shared pagination + sort schema,
// sortBy restricted to createdAt|startDate. Deliberately has no `status`
// filter — this list is hardcoded to PENDING requests by design.
export const managerListQuerySchema = paginationQuerySchema.merge(
  sortSchema(["createdAt", "startDate"], "createdAt"),
);
